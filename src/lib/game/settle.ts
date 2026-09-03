import { and, asc, eq, gt, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	applyAutoCompletion,
	checkClassicCompletion,
	checkCupCompletion,
	checkTurboCompletion,
} from '@/lib/game/auto-complete'
import { isKnockoutRound, settleClassicPick } from '@/lib/game/classic-survival'
import { eliminationUpdate, isAdminRemoved } from '@/lib/game/elimination'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import type { WipeoutPlayerInput } from '@/lib/game-logic/auto-complete-tiebreakers'
import { evaluateCupPicks, resolveCupQualifier } from '@/lib/game-logic/cup'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import {
	computeWcClassicAutoElims,
	type WcFixture,
	wcRoundStage,
} from '@/lib/game-logic/wc-classic'
import { competition, fixture, round } from '@/lib/schema/competition'
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

/**
 * Does this game still have a pending pick in the given round? The shared
 * advancement gate: both the settle path (checkAndMaybeCompleteOrAdvance)
 * and the reconcile path (advanceGameIfReady) refuse to advance a game
 * while this is true — a finished knockout tie can hold a deferred pending
 * pick (winner-lag) even when the data layer says the round is done.
 */
export async function gameHasPendingPicksInRound(
	gameId: string,
	roundId: string,
): Promise<boolean> {
	const pending = await db.query.pick.findFirst({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId), eq(pick.result, 'pending')),
	})
	return pending != null
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
				// Counted like any other settle so the sweep telemetry
				// (stuckFixturesSettled) doesn't undercount a fixture whose only
				// pending picks belong to non-active games.
				const rowResult = await settleClassicPickRow(p, fx)
				if (rowResult.settled) result.classicSettled++
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
				const rowResult = await settleClassicPickRow(p, fx, g)
				if (rowResult.settled) result.classicSettled++
				if (rowResult.eliminated) result.classicEliminated++
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

/**
 * Settle one classic pick row against its finished fixture. Returns whether
 * the row was actually written (`settled: false` = deferred winner-lag tie,
 * left pending on purpose) and whether the player was eliminated by it.
 */
async function settleClassicPickRow(
	p: PickRow,
	fx: FixtureWithRound,
	g?: typeof game.$inferSelect,
): Promise<{ settled: boolean; eliminated: boolean }> {
	// THE classic survival rule, shared with both projections (#242): it reads
	// `fixture.winner`, so a tie settled on penalties is a win rather than a
	// draw; it defers an unresolved knockout tie (#107) rather than scoring one;
	// and it owns the starting-round exemption (#203). Nothing here decides any
	// of that — extend the module, not this caller.
	const outcome = settleClassicPick(
		{ teamId: p.teamId },
		{
			roundId: fx.round.id,
			homeTeamId: fx.homeTeam.id,
			awayTeamId: fx.awayTeam.id,
			homeScore: fx.homeScore,
			awayScore: fx.awayScore,
			winner: fx.winner,
			status: fx.status,
			knockout: isKnockoutRound(fx.round.competition.type, fx.round.number),
		},
		{
			startingRoundId: g?.startingRoundId,
			// The game's settings go through the one resolver (#248), never a cast
			// of the column. A pick row settled without its game (the non-active
			// path above) never reaches the elimination branch below, so what the
			// exemption would have decided for it is read by nothing.
			modeConfig: g ? resolveModeConfig(g) : { mode: 'classic', allowRebuys: false },
		},
	)
	// Deferred: the pick stays PENDING on purpose and settles later via the poll
	// re-fire / recovery sweeps, once the winner (or a decisive score) lands.
	if (outcome.defer || outcome.result == null) return { settled: false, eliminated: false }

	await db
		.update(pick)
		.set({ result: outcome.result, goalsScored: outcome.goalsScored })
		.where(eq(pick.id, p.id))

	if (g == null) return { settled: true, eliminated: false }
	if (!outcome.eliminates) return { settled: true, eliminated: false }

	// Eliminate only if currently alive. Guard makes this race-safe and
	// double-call-safe.
	const updated = await db
		.update(gamePlayer)
		.set(eliminationUpdate('loss', fx.round.id))
		.where(and(eq(gamePlayer.id, p.gamePlayerId), eq(gamePlayer.status, 'alive')))
		.returning({ id: gamePlayer.id })
	return { settled: true, eliminated: updated.length > 0 }
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

	const cupConfig = resolveModeConfig(g)
	const startingLives = cupConfig.mode === 'cup' ? cupConfig.startingLives : 0
	let anyChanged = false

	for (const player of g.players) {
		// Evaluate EVERY player's picks, not just the currently-alive ones. The
		// wipeout rule (checkCupCompletion) needs the full rank-ordered result
		// sequence for everyone, including players whose streak already broke —
		// when a leading rank is a universal loss, an "eliminated" player can win
		// the rebased streak from a later rank, so their later picks must settle
		// rather than stay `pending`. evaluateCupPicks is idempotent and only ever
		// sets `eliminated` (never revives), so re-running on a broken player is
		// safe. Players with no picks (e.g. no-pick eliminations) fall through the
		// `settleable.length === 0` guard below untouched.

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
			// Confirmed-streak boundary: STOP at the first pending pick in rank
			// order. A player's streak — and any elimination from it — can't be
			// confirmed while a higher-confidence pick is still unplayed. The live
			// UI projects later-settled results; the streak is only FINALISED on
			// the contiguous settled prefix from rank 1.
			if (fx.homeScore == null || fx.awayScore == null) break
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
				// A knockout pick is "to qualify": `winner` (incl. ET/penalty ties)
				// decides whether the picked side advanced. The 90-minute (regulation)
				// score is the draw floor + goals source — an underdog level at 90 that
				// loses the shootout still survives (draw_success), and one that wins it
				// is a win. Fall back to the full-time score when regulation isn't
				// reported separately. resolveCupQualifier covers football-data's
				// winner-lag by deriving the qualifier from the penalty-inclusive
				// full-time score when `winner` is absent on a finished tie.
				homeScore: fx.regularHomeScore ?? fx.homeScore ?? 0,
				awayScore: fx.regularAwayScore ?? fx.awayScore ?? 0,
				tierDifference: tierDiff,
				winner: resolveCupQualifier({
					winner: fx.winner,
					finished: fx.status === 'finished',
					fullHomeScore: fx.homeScore,
					fullAwayScore: fx.awayScore,
				}),
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

		// Persist lives. A broken streak does NOT eliminate a cup player: cup is
		// won by the LONGEST streak (checkCupCompletion ranks every player, broken
		// or not — exactly like turbo), so a frozen streak can still be the winning
		// one. Marking it 'eliminated' wrongly drops the player from the
		// in-contention standings/podium (the 1f0d292d "Feargal" incident, where
		// the current leader's frozen streak of 4 was shown as OUT). The winner is
		// crowned only at gameweek completion (applyAutoCompletion → 'winner');
		// every other cup player stays 'alive'. `evalResult.eliminated` still drives
		// the lives/goals freeze inside evaluateCupPicks — it just no longer touches
		// player status here.
		const updates: {
			livesRemaining: number
			status?: 'alive'
			eliminatedRoundId?: string | null
		} = { livesRemaining: evalResult.finalLives }
		// Self-heal: revive any cup player a previous (buggy) settle wrongly marked
		// eliminated on a streak break. Admin removals are a deliberate action and
		// must persist.
		const wronglyEliminated = player.status === 'eliminated' && !isAdminRemoved(player)
		if (wronglyEliminated) {
			updates.status = 'alive'
			updates.eliminatedRoundId = null
		}
		if (player.livesRemaining !== evalResult.finalLives || wronglyEliminated) {
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

	// Crown guard: run the no-pick lock for this round before evaluating ANY
	// completion. If the round's deadline has passed and an alive player made
	// no pick, they must be auto-picked (or eliminated when no unused team
	// remains) BEFORE winners are considered — otherwise a pickless finalist
	// can be crowned in the window between the final fixture settling and the
	// daily-sync fallback running (the WC LPS split-pot incident). The lock is
	// idempotent and internally gated on the deadline having passed, so this
	// is a no-op on healthy rounds.
	await processDeadlineLock([roundId])

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

	// A classic round with a still-pending pick is NOT fully settled even when
	// every fixture is terminal: a knockout tie can be `finished` while its pick
	// is deliberately left pending until the winner resolves (see
	// settleClassicPickRow). Crowning / advancing on the fixture-only `allFinished`
	// would decide the game on an unresolved tie. Mirror the turbo/cup invariant —
	// gate the "round done" verdict on there being no pending picks too. (last-alive
	// / mass-extinction still fire on alive count inside checkClassicCompletion; the
	// deferred player stays alive, so those counts stay correct.)
	let classicRoundSettled = allFinished
	if (
		g.gameMode === 'classic' &&
		allFinished &&
		(await gameHasPendingPicksInRound(gameId, roundId))
	) {
		classicRoundSettled = false
	}

	// Per-mode completion check. Classic + cup check after every pick
	// settlement (game can complete mid-gameweek). Turbo only checks once
	// the round is fully settled.
	if (g.gameMode === 'classic') {
		// WC auto-elim runs after the round is fully settled (it needs the
		// full set of remaining-round candidates).
		if (classicRoundSettled && g.competition.type === 'group_knockout') {
			await runWcClassicAutoElims(gameId, roundId)
		}
		const completion = await checkClassicCompletion(
			gameId,
			g.competitionId,
			roundId,
			roundNumber,
			classicRoundSettled,
		)
		if (completion.completed) {
			await applyAutoCompletion(gameId, completion.winnerPlayerIds)
			result.gamesCompleted.push(gameId)
			return
		}
	} else if (g.gameMode === 'cup') {
		// Cup is a SINGLE gameweek decided by the longest streak — exactly like
		// turbo, just with the tier handicap + lives baked into the streak.
		// Wait until the whole gameweek is settled, then crown the longest
		// streak. Cup never eliminates-to-complete mid-gameweek and never
		// advances across matchdays.
		if (!allFinished) return
		const completion = await checkCupCompletion(gameId)
		await applyAutoCompletion(gameId, completion.winnerPlayerIds, { refund: completion.refund })
		result.gamesCompleted.push(gameId)
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		result.roundsCompleted.push(roundId)
		return
	} else if (g.gameMode === 'turbo') {
		if (!allFinished) return
		// Authoritative invariant guard (independent of the fixture-derived
		// `allFinished`): never crown while any pick in the round is still
		// `pending`. Mirrors the cup guard — protects against stale code or a
		// transient fixture state satisfying `allFinished` wrongly.
		const roundPicks = await db.query.pick.findMany({
			where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
		})
		const pendingTurbo = roundPicks.filter((p) => p.result === 'pending').length
		if (pendingTurbo > 0) {
			console.warn(
				`[checkAndMaybeCompleteOrAdvance] refusing to complete turbo game ${gameId}: ${pendingTurbo} pending pick(s)`,
			)
			return
		}
		const turboPlayerResults = await collectTurboPlayerResults(gameId, roundId)
		const completion = checkTurboCompletion(turboPlayerResults)
		await applyAutoCompletion(gameId, completion.winnerPlayerIds, { refund: completion.refund })
		result.gamesCompleted.push(gameId)
		// Mark the round complete; turbo doesn't advance (single-round mode).
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		result.roundsCompleted.push(roundId)
		return
	}

	// Game still active — if the round is fully settled, mark it complete +
	// advance the game. Classic-only path here (cup + turbo returned above), so
	// use the pending-aware `classicRoundSettled` — never advance past a deferred,
	// still-unresolved knockout tie.
	if (classicRoundSettled) {
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		result.roundsCompleted.push(roundId)
		// Advance only when the settled round IS the game's current round. A
		// late settle in a round the game already moved past (a stranded pick
		// healed by the all-rounds sweep) must land its elimination and stop —
		// re-advancing from the old round would drag currentRoundId backwards.
		if (g.currentRoundId === roundId) {
			const { advanced } = await advanceGameToNextRound(gameId, g.competitionId, roundNumber)
			if (advanced) result.gamesAdvanced.push(gameId)
		}
	}
}

async function collectTurboPlayerResults(
	gameId: string,
	roundId: string,
): Promise<WipeoutPlayerInput[]> {
	const players = await db.query.gamePlayer.findMany({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
	})
	const picks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
	})
	return players.map((p) => ({
		gamePlayerId: p.id,
		// Turbo has no lives mechanic — the goals tiebreak settles ties.
		livesRemaining: 0,
		// Picks are already settled by settleTurboPickRow (result + goalsScored).
		// Skip void picks — the streak walks past them as if they weren't in the
		// input (equivalent to a 9-pick game when one fixture was cancelled).
		picks: picks
			.filter((pk) => pk.gamePlayerId === p.id)
			.filter((pk) => pk.result != null && pk.result !== 'void' && pk.result !== 'pending')
			.map((pk) => ({
				rank: pk.confidenceRank ?? 0,
				correct: pk.result === 'win',
				goals: pk.goalsScored ?? 0,
			})),
	}))
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
			winner: f.winner,
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
				winner: f.winner,
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
		// `no_remaining_teams` rather than `loss`: nothing of theirs lost, every
		// team they could still pick is out of the tournament. This write used to
		// name no reason at all, which left these players null-reasoned and so
		// indistinguishable from an unwritten row by every reason-driven read.
		await db
			.update(gamePlayer)
			.set(eliminationUpdate('no_remaining_teams', currentRoundId))
			.where(eq(gamePlayer.id, ae.gamePlayerId))
	}
}

/**
 * Advance the game's currentRoundId pointer to the next round in the
 * competition. Round-state is per-game: each game advances independently
 * based on when its rounds complete, not on a global competition timeline.
 *
 * Refuses to advance to a round with no fixtures or no deadline (e.g. WC
 * knockout pre-bracket-publication). In that case the game stays pointed at
 * the just-completed round; `advanceGameIfReady` (reconcile path) retries on
 * subsequent cron ticks once the next round has been populated.
 *
 * On successful advance, marks the new currentRound as 'open' and schedules
 * any auto-submit-flagged plans for it.
 *
 * THE single advancement implementation. Both paths that advance a game call
 * it: the settle path (`checkAndMaybeCompleteOrAdvance` below) and the
 * reconcile path (`advanceGameIfReady` in process-round.ts). They share the
 * pending-pick gate (`gameHasPendingPicksInRound`) too — keep it that way;
 * two divergent advancement bodies is how a game ends up advancing past an
 * unresolved knockout tie on one path but not the other.
 */
export async function advanceGameToNextRound(
	gameId: string,
	competitionId: string,
	completedRoundNumber: number,
): Promise<{ advanced: boolean; reason?: 'no-next-round' | 'next-round-tbd' }> {
	const nextRound = await db.query.round.findFirst({
		where: and(eq(round.competitionId, competitionId), gt(round.number, completedRoundNumber)),
		orderBy: [asc(round.number)],
		with: { fixtures: true },
	})
	if (!nextRound) {
		await db.update(game).set({ currentRoundId: null }).where(eq(game.id, gameId))
		return { advanced: false, reason: 'no-next-round' }
	}
	if (nextRound.fixtures.length === 0 || nextRound.deadline == null) {
		// Next round is TBD (e.g. WC bracket pre-publication). Game stays
		// pointed at the just-completed round; reconcile retries on next tick.
		return { advanced: false, reason: 'next-round-tbd' }
	}
	await db.update(game).set({ currentRoundId: nextRound.id }).where(eq(game.id, gameId))
	await openRoundForGame(nextRound.id)
	return { advanced: true }
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
 * Sweep across ALL rounds for pending picks on terminal fixtures — unlike
 * sweepGameSettlement, which only walks a game's current round. Runs as
 * part of reconcileAllActiveGames (daily-sync / manual process-rounds), so
 * a pick stranded behind an already-advanced game (e.g. a deferred knockout
 * tie whose winner arrived late) self-heals within a day, with the
 * elimination applied to the round the fixture belongs to. Originally a
 * production-migration tool for the Brighton stuck-state.
 */
export async function sweepStuckFixtures(): Promise<{
	stuckFixtures: number
	settled: number
}> {
	// Find fixtures in a terminal state ('finished' or 'cancelled') that have
	// at least one pick still 'pending'. Cancelled is in scope because a
	// missed inline void leaves a pick pending on a fixture that will never
	// finish, and that pending pick *pins* the game: reconcileGameState
	// early-returns on a completed round to the gated advancement, so it
	// never reaches sweepGameSettlement (the only other cancellation-aware
	// path). settleFixture voids cancelled fixtures idempotently.
	// Two-step query keeps Drizzle happy and avoids a custom raw SQL join.
	// Archived competitions are excluded at the query — they are immutable
	// history, and this sweep runs outside reconcileGameState's per-game
	// archived guard.
	const terminalFixtures = await db
		.select({ id: fixture.id })
		.from(fixture)
		.innerJoin(round, eq(fixture.roundId, round.id))
		.innerJoin(competition, eq(round.competitionId, competition.id))
		.where(
			and(inArray(fixture.status, ['finished', 'cancelled']), ne(competition.status, 'archived')),
		)
	const ids = terminalFixtures.map((f) => f.id)
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
		const r = await settleFixture(fid)
		// Only count fixtures where something actually settled — a deferred
		// knockout tie whose winner is still unknown stays pending on purpose.
		// `picksVoided` carries the cancelled case (and the history-completeness
		// path carries picks whose game is no longer active).
		if (r.classicSettled + r.turboSettled + r.cupGamesReevaluated + r.picksVoided > 0) settled++
	}
	return { stuckFixtures: stuckIds.length, settled }
}
