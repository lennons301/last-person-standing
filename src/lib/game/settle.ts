import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	applyAutoCompletion,
	checkClassicCompletion,
	checkCupCompletion,
	checkTurboCompletion,
} from '@/lib/game/auto-complete'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { determinePickResult } from '@/lib/game-logic/common'
import { evaluateCupPicks } from '@/lib/game-logic/cup'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { evaluateTurboPicks } from '@/lib/game-logic/turbo'
import {
	computeWcClassicAutoElims,
	type WcFixture,
	wcRoundStage,
} from '@/lib/game-logic/wc-classic'
import { fixture, round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

/**
 * Per-fixture settlement. Matches the predecessor's
 * `process_pick_results_on_fixture_update` DB trigger: when a fixture
 * transitions to `finished` with scores, every pick on it is settled
 * immediately, players are eliminated where the mode requires it, and the
 * game's auto-completion is checked. This is the only way to get
 * "as-live" feel — round-batched processing leaves picks `pending` until
 * the last fixture in the round finishes.
 *
 * Called from every site that writes `fixture.status = 'finished'`:
 *   - `/api/cron/poll-scores` (live observation of the transition)
 *   - `syncCompetition` in `bootstrap-competitions.ts` (adapter mirror)
 *
 * Also called from `processGameRound` and `reconcileGameState` as sweep
 * wrappers — both delegate to settleFixture for each finished-but-pending
 * fixture in a game.
 *
 * Idempotent on every axis: re-running on a settled pick is a no-op
 * (guard on `pick.result !== 'pending'` for classic/turbo, natural for
 * cup whole-game re-eval); re-running elimination is a no-op (guard on
 * `gamePlayer.status === 'alive'`); re-running completion is a no-op
 * (guard on `game.status === 'active'`).
 */

export interface SettleResult {
	fixtureId: string
	classicSettled: number
	classicEliminated: number
	turboSettled: number
	cupGamesReevaluated: number
	picksVoided: number
	roundsVoided: string[]
	gamesCompleted: string[]
	gamesAdvanced: string[]
	roundsCompleted: string[]
}

function emptyResult(fixtureId: string): SettleResult {
	return {
		fixtureId,
		classicSettled: 0,
		classicEliminated: 0,
		turboSettled: 0,
		cupGamesReevaluated: 0,
		picksVoided: 0,
		roundsVoided: [],
		gamesCompleted: [],
		gamesAdvanced: [],
		roundsCompleted: [],
	}
}

export async function settleFixture(fixtureId: string): Promise<SettleResult> {
	const result = emptyResult(fixtureId)

	const fx = await db.query.fixture.findFirst({
		where: eq(fixture.id, fixtureId),
		with: {
			homeTeam: true,
			awayTeam: true,
			round: { with: { competition: true } },
		},
	})
	if (!fx) return result

	// Normalise postponed → cancelled at the boundary. Per the cancellation
	// design, postponed PL fixtures are typically moved to other matchdays
	// and the survivor game has to roll over rather than block — so any
	// postponed status counts as cancellation for settlement purposes.
	if (fx.status === 'postponed') {
		await db.update(fixture).set({ status: 'cancelled' }).where(eq(fixture.id, fixtureId))
		fx.status = 'cancelled'
	}

	if (fx.status === 'cancelled') {
		return voidFixtureInternal(fx, result)
	}

	if (fx.status !== 'finished') return result
	if (fx.homeScore == null || fx.awayScore == null) return result

	const picks = await db.query.pick.findMany({
		where: eq(pick.fixtureId, fixtureId),
		with: {
			game: { with: { competition: true } },
		},
	})
	if (picks.length === 0) return result

	// Group by gameId so per-game completion checks run once per game per
	// settleFixture invocation, not once per pick.
	const gameIds = Array.from(new Set(picks.map((p) => p.gameId)))

	for (const gameId of gameIds) {
		const gamePicks = picks.filter((p) => p.gameId === gameId)
		const g = gamePicks[0].game
		// Game already completed or set up but not active — skip side effects.
		// Pick rows still settle so historical state is correct, but no
		// elimination / completion / advance fires.
		if (g.status !== 'active') {
			// For completeness on history view, still settle the pick rows.
			// (Mostly cosmetic — the game is done — but cheap and consistent.)
			for (const p of gamePicks) {
				if (g.gameMode === 'cup') continue
				if (p.result !== 'pending') continue
				await settleClassicPickRow(p, fx)
			}
			continue
		}

		if (g.gameMode === 'cup') {
			const changed = await reevaluateCupGame(gameId)
			if (changed) result.cupGamesReevaluated++
			await checkAndMaybeCompleteOrAdvance(gameId, fx.round.id, fx.round.number, result)
		} else if (g.gameMode === 'classic') {
			for (const p of gamePicks) {
				if (p.result !== 'pending') continue
				const eliminated = await settleClassicPickRow(p, fx, g)
				result.classicSettled++
				if (eliminated) result.classicEliminated++
			}
			await checkAndMaybeCompleteOrAdvance(gameId, fx.round.id, fx.round.number, result)
		} else if (g.gameMode === 'turbo') {
			for (const p of gamePicks) {
				if (p.result !== 'pending') continue
				await settleTurboPickRow(p, fx)
				result.turboSettled++
			}
			await checkAndMaybeCompleteOrAdvance(gameId, fx.round.id, fx.round.number, result)
		}
	}

	return result
}

/* ────────────────────────────────────────────────────────────────────── */
/* Classic                                                                */
/* ────────────────────────────────────────────────────────────────────── */

type PickRow = typeof pick.$inferSelect
type FixtureWithRound = typeof fixture.$inferSelect & {
	round: typeof round.$inferSelect & { competition: { type: string } }
	homeTeam: { id: string }
	awayTeam: { id: string }
}

async function settleClassicPickRow(
	p: PickRow,
	fx: FixtureWithRound,
	g?: typeof game.$inferSelect,
): Promise<boolean> {
	// `fx.homeScore` and `fx.awayScore` are pre-validated non-null by the
	// settleFixture entry point — the narrowing is lost across the helper
	// boundary so we coalesce defensively.
	const homeScore = fx.homeScore ?? 0
	const awayScore = fx.awayScore ?? 0
	const result = determinePickResult({
		pickedTeamId: p.teamId,
		homeTeamId: fx.homeTeam.id,
		awayTeamId: fx.awayTeam.id,
		homeScore,
		awayScore,
	})
	const pickedHome = p.teamId === fx.homeTeam.id
	const goalsScored = result === 'win' ? (pickedHome ? homeScore : awayScore) : 0
	await db.update(pick).set({ result, goalsScored }).where(eq(pick.id, p.id))

	if (g == null) return false

	if (result === 'win') return false

	// Starting-round exemption matches the predecessor: round 1 + allowRebuys=false
	// is the "starting gameweek" — losses/draws don't eliminate.
	const allowRebuys = (g.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
	const isStartingRound = fx.round.number === 1 && !allowRebuys
	if (isStartingRound) return false

	// Eliminate only if currently alive. Guard makes this race-safe and
	// double-call-safe.
	const updated = await db
		.update(gamePlayer)
		.set({
			status: 'eliminated',
			eliminatedRoundId: fx.round.id,
			eliminatedReason: 'loss',
		})
		.where(and(eq(gamePlayer.id, p.gamePlayerId), eq(gamePlayer.status, 'alive')))
		.returning({ id: gamePlayer.id })
	return updated.length > 0
}

/* ────────────────────────────────────────────────────────────────────── */
/* Turbo                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

async function settleTurboPickRow(p: PickRow, fx: FixtureWithRound): Promise<void> {
	const homeScore = fx.homeScore ?? 0
	const awayScore = fx.awayScore ?? 0
	const actualOutcome =
		homeScore > awayScore ? 'home_win' : awayScore > homeScore ? 'away_win' : 'draw'
	const correct = p.predictedResult === actualOutcome
	const result = correct ? 'win' : 'loss'
	let goalsScored = 0
	if (correct) {
		if (p.predictedResult === 'home_win') goalsScored = homeScore
		else if (p.predictedResult === 'away_win') goalsScored = awayScore
		else goalsScored = homeScore + awayScore
	}
	await db.update(pick).set({ result, goalsScored }).where(eq(pick.id, p.id))
}

/* ────────────────────────────────────────────────────────────────────── */
/* Cup                                                                    */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Whole-game re-evaluation for cup mode. Mirrors the predecessor's
 * `process_cup_results(p_game_id)`. Iterates the player's picks in
 * confidence-rank order, only over fixtures that have both scores set,
 * accumulates streak / lives via the same `evaluateCupPicks` evaluator
 * used at end-of-round. Persists pick.result + life_gained + life_spent +
 * gamePlayer.livesRemaining. Idempotent — running on a stable input set
 * produces the same writes.
 *
 * Returns whether anything was actually changed (used by callers to
 * decide whether to check completion).
 */
export async function reevaluateCupGame(gameId: string): Promise<boolean> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			players: true,
			currentRound: {
				with: {
					fixtures: {
						with: { homeTeam: true, awayTeam: true },
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			},
		},
	})
	if (!g || g.status !== 'active' || !g.currentRound) return false
	const roundId = g.currentRound.id

	// Collect existing picks for the current round, with fixture refs.
	const existingPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
	})

	const startingLives = (g.modeConfig as { startingLives?: number } | null)?.startingLives ?? 0
	let anyChanged = false

	for (const player of g.players) {
		if (player.status !== 'alive') continue

		const playerPicks = existingPicks
			.filter((p) => p.gamePlayerId === player.id)
			.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))

		// Build the input list for evaluateCupPicks — only picks whose fixture
		// has both scores (`pending` fixtures are excluded; their pick.result
		// stays `'pending'`). Cancelled fixtures are skipped — the pick's
		// `'void'` row was already persisted by voidFixtureInternal; the
		// streak math walks past it naturally because it's not in the input.
		const settleable: Array<{
			pickRow: (typeof existingPicks)[number]
			fixture: (typeof g.currentRound.fixtures)[number]
		}> = []
		for (const p of playerPicks) {
			if (p.result === 'void') continue
			const fx = g.currentRound.fixtures.find((f) => f.id === p.fixtureId)
			if (!fx) continue
			if (fx.status === 'cancelled') continue
			if (fx.homeScore == null || fx.awayScore == null) continue
			settleable.push({ pickRow: p, fixture: fx })
		}
		if (settleable.length === 0) continue

		const cupInputs = settleable.map(({ pickRow, fixture: fx }) => {
			const tierDiff = computeTierDifference(
				fx.homeTeam,
				fx.awayTeam,
				g.competition.type as 'league' | 'knockout' | 'group_knockout',
			)
			const pickedTeam: 'home' | 'away' = pickRow.teamId === fx.homeTeamId ? 'home' : 'away'
			return {
				confidenceRank: pickRow.confidenceRank ?? 0,
				pickedTeam,
				homeScore: fx.homeScore ?? 0,
				awayScore: fx.awayScore ?? 0,
				tierDifference: tierDiff,
			}
		})

		const evalResult = evaluateCupPicks(cupInputs, startingLives)

		// Persist per-pick: pick.result + life_gained + life_spent + goalsScored.
		for (const pr of evalResult.pickResults) {
			const target = settleable.find((s) => (s.pickRow.confidenceRank ?? 0) === pr.confidenceRank)
			if (!target) continue
			const dbResult =
				pr.result === 'win'
					? ('win' as const)
					: pr.result === 'draw_success'
						? ('draw' as const)
						: pr.result === 'saved_by_life'
							? ('saved_by_life' as const)
							: ('loss' as const) // 'loss' + 'restricted' both persist as loss
			// Avoid writing identical state (saves DB churn when smoke tests
			// hammer the function).
			const prev = target.pickRow
			if (
				prev.result === dbResult &&
				prev.goalsScored === pr.goalsCounted &&
				prev.lifeGained === pr.livesGained &&
				prev.lifeSpent === (pr.result === 'saved_by_life')
			) {
				continue
			}
			anyChanged = true
			await db
				.update(pick)
				.set({
					result: dbResult,
					goalsScored: pr.goalsCounted,
					lifeGained: pr.livesGained,
					lifeSpent: pr.result === 'saved_by_life',
				})
				.where(eq(pick.id, target.pickRow.id))
		}

		// Persist lives + eliminated state.
		const updates: { livesRemaining: number; status?: 'eliminated'; eliminatedRoundId?: string } = {
			livesRemaining: evalResult.finalLives,
		}
		if (evalResult.eliminated) {
			updates.status = 'eliminated'
			updates.eliminatedRoundId = roundId
		}
		if (
			player.livesRemaining !== evalResult.finalLives ||
			(evalResult.eliminated && player.status === 'alive')
		) {
			anyChanged = true
			await db.update(gamePlayer).set(updates).where(eq(gamePlayer.id, player.id))
		}
	}

	return anyChanged
}

/* ────────────────────────────────────────────────────────────────────── */
/* Completion + advancement                                                */
/* ────────────────────────────────────────────────────────────────────── */

async function checkAndMaybeCompleteOrAdvance(
	gameId: string,
	roundId: string,
	roundNumber: number,
	result: SettleResult,
): Promise<void> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { competition: true },
	})
	if (!g || g.status !== 'active') return

	const allRoundFixtures = await db.query.fixture.findMany({
		where: eq(fixture.roundId, roundId),
	})
	// A round is "all done" when every fixture has reached a terminal
	// state — either finished with scores OR cancelled. Cancelled
	// fixtures don't block round advancement.
	const allFinished =
		allRoundFixtures.length > 0 &&
		allRoundFixtures.every(
			(f) =>
				(f.status === 'finished' && f.homeScore != null && f.awayScore != null) ||
				f.status === 'cancelled',
		)

	// Per-mode completion check. Classic + cup check after every pick
	// settlement (game can complete mid-gameweek). Turbo only checks once
	// the round is fully settled.
	if (g.gameMode === 'classic') {
		// WC auto-elim runs after the round is fully settled (it needs the
		// full set of remaining-round candidates).
		if (allFinished && g.competition.type === 'group_knockout') {
			await runWcClassicAutoElims(gameId, roundId)
		}
		const completion = await checkClassicCompletion(gameId, g.competitionId, roundId, roundNumber)
		if (completion.completed) {
			await applyAutoCompletion(gameId, completion.winnerPlayerIds)
			result.gamesCompleted.push(gameId)
			return
		}
	} else if (g.gameMode === 'cup') {
		const completion = await checkCupCompletion(gameId, g.competitionId, roundId, roundNumber)
		if (completion.completed) {
			await applyAutoCompletion(gameId, completion.winnerPlayerIds)
			result.gamesCompleted.push(gameId)
			return
		}
	} else if (g.gameMode === 'turbo') {
		if (!allFinished) return
		const turboPlayerResults = await collectTurboPlayerResults(gameId, roundId)
		const completion = checkTurboCompletion(turboPlayerResults)
		await applyAutoCompletion(gameId, completion.winnerPlayerIds)
		result.gamesCompleted.push(gameId)
		// Mark the round complete; turbo doesn't advance (single-round mode).
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		result.roundsCompleted.push(roundId)
		return
	}

	// Game still active — if the round is fully settled, mark it complete +
	// advance the game. Classic + cup path only; turbo handled above.
	if (allFinished) {
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		result.roundsCompleted.push(roundId)
		const advanced = await advanceGameToNextRound(gameId, g.competitionId, roundNumber)
		if (advanced) result.gamesAdvanced.push(gameId)
	}
}

async function collectTurboPlayerResults(gameId: string, roundId: string) {
	const players = await db.query.gamePlayer.findMany({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
	})
	const picks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
		with: { fixture: true },
	})
	return players.map((p) => {
		// Skip void picks — the streak evaluator walks past as if they
		// weren't in the input. Equivalent to a 9-pick game when one
		// fixture was cancelled.
		const playerPicks = picks
			.filter((pk) => pk.gamePlayerId === p.id)
			.filter((pk) => pk.result !== 'void')
			.map((pk) => ({
				confidenceRank: pk.confidenceRank ?? 0,
				predictedResult: (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win',
				homeScore: pk.fixture?.homeScore ?? 0,
				awayScore: pk.fixture?.awayScore ?? 0,
			}))
		const turbo = evaluateTurboPicks(playerPicks)
		return {
			gamePlayerId: p.id,
			streak: turbo.streak,
			goalsInStreak: turbo.goalsInStreak,
		}
	})
}

async function runWcClassicAutoElims(gameId: string, currentRoundId: string): Promise<void> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { competition: true },
	})
	if (!g) return
	const allRounds = await db.query.round.findMany({
		where: eq(round.competitionId, g.competitionId),
		with: { fixtures: { orderBy: (fx, { asc }) => asc(fx.kickoff) } },
	})
	const finishedKnockoutFixtures: WcFixture[] = allRounds.flatMap((r) =>
		r.fixtures.map((f) => ({
			id: f.id,
			roundId: r.id,
			homeTeamId: f.homeTeamId,
			awayTeamId: f.awayTeamId,
			homeScore: f.homeScore,
			awayScore: f.awayScore,
			status: f.status,
			stage: wcRoundStage(r.number),
		})),
	)
	const remainingRounds = allRounds
		.filter((r) => r.status !== 'completed' && r.id !== currentRoundId)
		.map((r) => ({
			id: r.id,
			fixtures: r.fixtures.map((f) => ({
				id: f.id,
				roundId: r.id,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				homeScore: f.homeScore,
				awayScore: f.awayScore,
				status: f.status,
				stage: wcRoundStage(r.number),
			})),
		}))
	const alivePlayers = await db.query.gamePlayer.findMany({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
	})
	if (alivePlayers.length === 0) return
	const picksForGame = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
	const alivePlayersForAutoElim = alivePlayers.map((p) => ({
		gamePlayerId: p.id,
		usedTeamIds: picksForGame.filter((pk) => pk.gamePlayerId === p.id).map((pk) => pk.teamId),
	}))
	const autoElims = computeWcClassicAutoElims({
		alivePlayers: alivePlayersForAutoElim,
		remainingRounds,
		finishedKnockoutFixtures,
	})
	for (const ae of autoElims) {
		await db
			.update(gamePlayer)
			.set({ status: 'eliminated', eliminatedRoundId: currentRoundId })
			.where(eq(gamePlayer.id, ae.gamePlayerId))
	}
}

async function advanceGameToNextRound(
	gameId: string,
	competitionId: string,
	completedRoundNumber: number,
): Promise<boolean> {
	const nextRound = await db.query.round.findFirst({
		where: and(eq(round.competitionId, competitionId), gt(round.number, completedRoundNumber)),
		orderBy: [asc(round.number)],
		with: { fixtures: true },
	})
	if (!nextRound) {
		await db.update(game).set({ currentRoundId: null }).where(eq(game.id, gameId))
		return false
	}
	if (nextRound.fixtures.length === 0 || nextRound.deadline == null) {
		// Next round is TBD (e.g. WC bracket pre-publication). Game stays
		// pointed at the just-completed round; reconcile retries on next tick.
		return false
	}
	await db.update(game).set({ currentRoundId: nextRound.id }).where(eq(game.id, gameId))
	await openRoundForGame(nextRound.id)
	return true
}

/* ────────────────────────────────────────────────────────────────────── */
/* Sweeps                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Sweep helper: for a given game, find every finished fixture in its
 * current round with pending picks and run settleFixture on each. Used
 * by reconcileGameState as the safety-net body, and by processGameRound
 * as the wrapper around per-fixture settlement.
 */
export async function sweepGameSettlement(gameId: string): Promise<SettleResult[]> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { currentRound: { with: { fixtures: true } } },
	})
	if (!g || g.status !== 'active' || !g.currentRound) return []
	const fixtureIds = g.currentRound.fixtures
		.filter(
			(f) =>
				(f.status === 'finished' && f.homeScore != null && f.awayScore != null) ||
				f.status === 'cancelled',
		)
		.map((f) => f.id)
	const results: SettleResult[] = []
	for (const fid of fixtureIds) {
		const r = await settleFixture(fid)
		results.push(r)
	}
	return results
}

/**
 * One-shot sweep across every active game. Used by daily-sync as the
 * 24h backstop for any game whose settlement was missed (e.g. early
 * production data with pending picks on long-finished fixtures).
 */
export async function sweepAllActiveGames(): Promise<{
	gamesChecked: number
	fixturesSettled: number
}> {
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
	})
	let fixturesSettled = 0
	for (const g of activeGames) {
		const results = await sweepGameSettlement(g.id)
		fixturesSettled += results.length
	}
	return { gamesChecked: activeGames.length, fixturesSettled }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Cancellation / void                                                     */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Per-mode void handler — called when a fixture's status becomes
 * `'cancelled'` (or `'postponed'` is normalised to cancelled by the
 * caller). Persists `pick.result = 'void'` for every still-pending
 * pick on the fixture, marks the cancellation reason, then dispatches
 * mode-specific cleanup:
 *
 *   - **Classic:** pick is voided; player stays alive; team usage
 *     stays consumed (validation reads pick.teamId regardless of
 *     result, so the team remains in `usedTeamIds`). The exception is
 *     when the whole round is voided — see `voidWholeRound`.
 *   - **Turbo:** pick is voided; the streak evaluator (when the round
 *     fully settles) walks past void picks.
 *   - **Cup:** pick is voided; `reevaluateCupGame` is re-run, which
 *     iterates rank-ordered and naturally skips voids.
 *
 * Then checks the classic round-void threshold and the standard
 * completion-or-advance flow.
 *
 * See docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md.
 */
async function voidFixtureInternal(
	fx: FixtureWithRound,
	result: SettleResult,
): Promise<SettleResult> {
	const picks = await db.query.pick.findMany({
		where: eq(pick.fixtureId, fx.id),
		with: { game: { with: { competition: true } } },
	})

	// Per-pick void for any picks directly on this fixture. Guard on
	// `result === 'pending'` so already-settled rows aren't retroactively
	// overwritten by a late cancellation; the round-void path is the only
	// place that retroactively overwrites settled picks.
	for (const p of picks) {
		if (p.result !== 'pending') continue
		await db
			.update(pick)
			.set({
				result: 'void',
				cancellationReason: 'cancelled',
				goalsScored: 0,
				lifeGained: 0,
				lifeSpent: false,
			})
			.where(eq(pick.id, p.id))
		result.picksVoided++
	}

	// Find every game whose currentRoundId points at this fixture's round.
	// A cancellation can void the whole round even when the cancelled
	// fixture itself had no picks (the threshold is a property of the
	// round's fixtures, not the picks on this specific cancellation).
	const gamesOnRound = await db.query.game.findMany({
		where: and(eq(game.currentRoundId, fx.round.id), eq(game.status, 'active')),
	})

	for (const g of gamesOnRound) {
		// Cup mode: re-run whole-game evaluation. Picks-of-this-fixture were
		// already voided above; re-eval recomputes streak/lives accordingly.
		if (g.gameMode === 'cup') {
			const changed = await reevaluateCupGame(g.id)
			if (changed) result.cupGamesReevaluated++
		}

		// Classic only: check the round-void threshold. If crossed, void
		// the whole round (releases teams, reinstates same-round
		// eliminations, advances games).
		if (g.gameMode === 'classic') {
			const threshold = await classicVoidThresholdCrossed(fx.round.id)
			if (threshold && !result.roundsVoided.includes(fx.round.id)) {
				await voidWholeRound(fx.round.id, result)
			}
		}

		// Standard completion / advance flow. checkAndMaybeCompleteOrAdvance
		// already treats cancelled fixtures as terminal — they don't block
		// round completion.
		await checkAndMaybeCompleteOrAdvance(g.id, fx.round.id, fx.round.number, result)
	}

	return result
}

/**
 * Has the classic round-void threshold been crossed? Fires when:
 *   - >50% of the round's fixtures have status='cancelled', OR
 *   - >5 fixtures absolute (catches 7-fixture rounds where 4 cancellations
 *     are <50% but still represent enough disruption to void).
 */
async function classicVoidThresholdCrossed(roundId: string): Promise<boolean> {
	const fixtures = await db.query.fixture.findMany({ where: eq(fixture.roundId, roundId) })
	if (fixtures.length === 0) return false
	const cancelled = fixtures.filter((f) => f.status === 'cancelled').length
	return cancelled / fixtures.length > 0.5 || cancelled > 5
}

/**
 * Whole-round void for classic. Triggered when too many fixtures in a
 * round get cancelled (see `classicVoidThresholdCrossed`).
 *
 * Behaviour:
 *  1. round.voided_at = now; round.status = 'completed'.
 *  2. Every pick on the round → result='void', reason='round-voided'.
 *     This *retroactively voids* picks that already settled (win/loss
 *     /draw) — the round outcome is now meaningless.
 *  3. Players eliminated by this round are reinstated to 'alive'.
 *  4. Team usage for round-voided picks is filtered out at validation
 *     time (validate.ts reads `cancellationReason !== 'round-voided'`),
 *     so the teams are effectively released.
 *  5. Games currently sitting on this round get completion-checked +
 *     advanced via the standard flow.
 */
async function voidWholeRound(roundId: string, result: SettleResult): Promise<void> {
	const r = await db.query.round.findFirst({
		where: eq(round.id, roundId),
	})
	if (!r) return
	if (r.voidedAt != null) return // already voided

	await db
		.update(round)
		.set({ voidedAt: new Date(), status: 'completed' })
		.where(eq(round.id, roundId))

	// Void every pick on the round. Includes settled rows — the round is
	// being torn down.
	const roundPicks = await db.query.pick.findMany({
		where: eq(pick.roundId, roundId),
	})
	for (const p of roundPicks) {
		await db
			.update(pick)
			.set({
				result: 'void',
				cancellationReason: 'round-voided',
				goalsScored: 0,
				lifeGained: 0,
				lifeSpent: false,
			})
			.where(eq(pick.id, p.id))
	}
	result.picksVoided += roundPicks.length
	result.roundsVoided.push(roundId)

	// Reinstate players eliminated by this round. Players eliminated in
	// earlier rounds stay eliminated — their rounds still happened.
	await db
		.update(gamePlayer)
		.set({
			status: 'alive',
			eliminatedRoundId: null,
			eliminatedReason: null,
		})
		.where(and(eq(gamePlayer.eliminatedRoundId, roundId), eq(gamePlayer.status, 'eliminated')))
}

/**
 * Sweep across rounds that have any pending pick on a finished fixture.
 * Used for production migration after deploying per-fixture settlement
 * — picks up the Brighton stuck-state.
 */
export async function sweepStuckFixtures(): Promise<{
	stuckFixtures: number
	settled: number
}> {
	// Find fixtures with status='finished' that have at least one pick still
	// 'pending'. Two-step query keeps Drizzle happy and avoids a custom raw
	// SQL join.
	const finishedFixtures = await db
		.select({ id: fixture.id })
		.from(fixture)
		.where(eq(fixture.status, 'finished'))
	const ids = finishedFixtures.map((f) => f.id)
	if (ids.length === 0) return { stuckFixtures: 0, settled: 0 }
	const pendingPicks = await db
		.select({ fixtureId: pick.fixtureId })
		.from(pick)
		.where(and(eq(pick.result, 'pending'), inArray(pick.fixtureId, ids)))
	const stuckIds = Array.from(
		new Set(pendingPicks.map((p) => p.fixtureId).filter((id): id is string => id != null)),
	)
	let settled = 0
	for (const fid of stuckIds) {
		await settleFixture(fid)
		settled++
	}
	return { stuckFixtures: stuckIds.length, settled }
}
