import { and, asc, eq, gt, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { applyAutoCompletion } from '@/lib/game/auto-complete'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import {
	deriveSettlement,
	type SettlementCupFixture,
	type SettlementFacts,
	type SettlementGamePick,
	type SettlementPick,
	type SettlementPlan,
	type SettlementRoundFixture,
} from '@/lib/game/settlement-plan'
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
 * Also called from `reconcileGameState` via `sweepGameSettlement` as a sweep
 * wrapper — it delegates to settleFixture for each finished-but-pending
 * fixture in a game.
 *
 * **Three halves, and only the middle one holds the rules.** *Gather* reads the
 * rows (`gatherSettlementFacts`), *decide* is `deriveSettlement`
 * (`settlement-plan.ts`) — pure, no database, one exhaustive dispatch over the
 * mode — and *apply* is `applyPlan`, which puts the whole plan into a single
 * transaction. Nothing in this file decides a pick result, an elimination or a
 * winner; extend the pure module instead.
 *
 * Idempotent on every axis: re-running on a settled pick is a no-op (the rules
 * only write `pending` rows for classic/turbo, and cup's whole-game re-eval
 * emits no write for a row already holding the right state); re-running
 * elimination is a no-op (`requireAlive` guards the update); re-running
 * completion is a no-op (`game.status === 'active'` gates it).
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

/** A transaction handle, as drizzle hands one to `db.transaction`'s callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type FixtureWithRound = typeof fixture.$inferSelect & {
	round: typeof round.$inferSelect & { competition: typeof competition.$inferSelect }
}
type GameWithCompetition = typeof game.$inferSelect & {
	competition: typeof competition.$inferSelect
}

export async function settleFixture(fixtureId: string): Promise<SettleResult> {
	const result = emptyResult(fixtureId)

	const fx = await db.query.fixture.findFirst({
		where: eq(fixture.id, fixtureId),
		with: { round: { with: { competition: true } } },
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

	if (fx.status !== 'finished' && fx.status !== 'cancelled') return result
	if (fx.status === 'finished' && (fx.homeScore == null || fx.awayScore == null)) return result

	// Read before anything else writes: a pick the deadline lock inserts below is
	// not one this fixture settles in the same pass. It lands `pending` and
	// settles on the next poll or recovery sweep, which is what keeps a
	// last-alive crown from turning on a fallback pick made moments earlier.
	const fixturePicks = await db.query.pick.findMany({ where: eq(pick.fixtureId, fixtureId) })
	const gameIds = new Set(fixturePicks.map((p) => p.gameId))

	if (fx.status === 'cancelled') {
		// A cancellation can void the whole round even when the cancelled fixture
		// itself had no picks — the void threshold is a property of the round's
		// fixtures, not of the picks on this specific cancellation. So every game
		// sitting on the round is in scope, picks on this fixture or not.
		const gamesOnRound = await db.query.game.findMany({
			where: and(eq(game.currentRoundId, fx.round.id), eq(game.status, 'active')),
			columns: { id: true },
		})
		for (const g of gamesOnRound) gameIds.add(g.id)
	}
	if (gameIds.size === 0) return result

	const games = await db.query.game.findMany({
		where: inArray(game.id, Array.from(gameIds)),
		with: { competition: true },
	})

	// Crown guard: run the no-pick lock for this round before evaluating ANY
	// completion. If the round's deadline has passed and an alive player made no
	// pick, they must be auto-picked (or eliminated when no unused team remains)
	// BEFORE winners are considered — otherwise a pickless finalist can be
	// crowned in the window between the final fixture settling and the
	// daily-sync fallback running (the WC LPS split-pot incident). The lock is
	// idempotent and internally gated on the deadline having passed, so this is
	// a no-op on healthy rounds.
	if (games.some((g) => g.status === 'active')) await processDeadlineLock([fx.round.id])

	for (const g of games) {
		const ownPicks = fixturePicks.filter((p) => p.gameId === g.id)
		let plan = deriveSettlement(await gatherSettlementFacts(g, fx, ownPicks))
		if (plan.voidRound && !result.roundsVoided.includes(fx.round.id)) {
			// Round-level and irreversible: tear the round up first, then ask this
			// game again, so its verdict is reached against the round as it now
			// stands rather than against the one that has just been thrown out.
			await voidWholeRound(fx.round.id, result)
			plan = deriveSettlement(await gatherSettlementFacts(g, fx, ownPicks))
		}
		await applySettlementPlan(plan, result)
	}

	return result
}

/* ────────────────────────────────────────────────────────────────────── */
/* Gather                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

function toSettlementPick(p: typeof pick.$inferSelect): SettlementPick {
	return {
		id: p.id,
		gamePlayerId: p.gamePlayerId,
		fixtureId: p.fixtureId,
		teamId: p.teamId,
		confidenceRank: p.confidenceRank,
		predictedResult: p.predictedResult,
		result: p.result,
		goalsScored: p.goalsScored,
		lifeGained: p.lifeGained,
		lifeSpent: p.lifeSpent,
	}
}

function toGamePick(
	p: typeof pick.$inferSelect,
	fx: SettlementGamePick['fixture'],
): SettlementGamePick {
	return {
		id: p.id,
		gamePlayerId: p.gamePlayerId,
		teamId: p.teamId,
		confidenceRank: p.confidenceRank,
		result: p.result,
		goalsScored: p.goalsScored,
		fixture: fx,
	}
}

function toRoundFixture(f: typeof fixture.$inferSelect): SettlementRoundFixture {
	return {
		id: f.id,
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
		homeScore: f.homeScore,
		awayScore: f.awayScore,
		status: f.status,
	}
}

/** Every row the rules read, and nothing they don't. */
async function gatherSettlementFacts(
	g: GameWithCompetition,
	fx: FixtureWithRound,
	fixturePicks: Array<typeof pick.$inferSelect>,
): Promise<SettlementFacts> {
	const modeConfig = resolveModeConfig(g)
	const competitionType = g.competition.type

	const [roundFixtures, roundPicks, players, nextRound] = await Promise.all([
		db.query.fixture.findMany({ where: eq(fixture.roundId, fx.round.id) }),
		db.query.pick.findMany({
			where: and(eq(pick.gameId, g.id), eq(pick.roundId, fx.round.id)),
		}),
		db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, g.id) }),
		db.query.round.findFirst({
			where: and(eq(round.competitionId, g.competitionId), gt(round.number, fx.round.number)),
			orderBy: [asc(round.number)],
			columns: { id: true },
		}),
	])

	// Cup's raw-goals backstop reads the picked team's actual score off the
	// fixture, so cup — and only cup — pays for the join.
	const gamePicks: SettlementGamePick[] =
		modeConfig.mode === 'cup'
			? (
					await db.query.pick.findMany({ where: eq(pick.gameId, g.id), with: { fixture: true } })
				).map((p) =>
					toGamePick(
						p,
						p.fixture
							? {
									homeTeamId: p.fixture.homeTeamId,
									homeScore: p.fixture.homeScore,
									awayScore: p.fixture.awayScore,
								}
							: null,
					),
				)
			: (await db.query.pick.findMany({ where: eq(pick.gameId, g.id) })).map((p) =>
					toGamePick(p, null),
				)

	// Cup re-evaluates the game's OWN current round rather than the settling
	// fixture's — they are the same round in every real cup game, cup being a
	// single gameweek, but the re-eval has always been anchored to the game.
	const cupRound =
		modeConfig.mode === 'cup' && g.currentRoundId != null
			? await loadCupRound(g.id, g.currentRoundId)
			: null

	// The World Cup auto-elim walks the whole bracket; nothing else needs it.
	const competitionRounds =
		competitionType === 'group_knockout'
			? await db.query.round.findMany({
					where: eq(round.competitionId, g.competitionId),
					with: { fixtures: true },
				})
			: []

	return {
		game: {
			id: g.id,
			status: g.status,
			modeConfig,
			startingRoundId: g.startingRoundId,
			currentRoundId: g.currentRoundId,
		},
		competitionType,
		fixture: {
			id: fx.id,
			homeTeamId: fx.homeTeamId,
			awayTeamId: fx.awayTeamId,
			homeScore: fx.homeScore,
			awayScore: fx.awayScore,
			winner: fx.winner,
			status: fx.status,
		},
		round: { id: fx.round.id, number: fx.round.number },
		fixturePicks: fixturePicks.map(toSettlementPick),
		roundFixtures: roundFixtures.map(toRoundFixture),
		roundPicks: roundPicks.map(toSettlementPick),
		cupRound,
		players: players.map((p) => ({
			id: p.id,
			status: p.status,
			eliminatedReason: p.eliminatedReason,
			eliminatedRoundId: p.eliminatedRoundId,
			livesRemaining: p.livesRemaining,
		})),
		gamePicks,
		hasNextRound: nextRound != null,
		competitionRounds: competitionRounds.map((r) => ({
			id: r.id,
			number: r.number,
			status: r.status,
			fixtures: r.fixtures.map((f) => ({
				id: f.id,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				homeScore: f.homeScore,
				awayScore: f.awayScore,
				status: f.status,
				winner: f.winner,
			})),
		})),
	}
}

async function loadCupRound(gameId: string, roundId: string): Promise<SettlementFacts['cupRound']> {
	const [fixtures, picks] = await Promise.all([
		db.query.fixture.findMany({
			where: eq(fixture.roundId, roundId),
			with: { homeTeam: true, awayTeam: true },
		}),
		db.query.pick.findMany({ where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)) }),
	])
	const cupFixtures: SettlementCupFixture[] = fixtures.map((f) => ({
		...toRoundFixture(f),
		homeTeam: { externalIds: f.homeTeam.externalIds },
		awayTeam: { externalIds: f.awayTeam.externalIds },
		regularHomeScore: f.regularHomeScore,
		regularAwayScore: f.regularAwayScore,
		winner: f.winner,
	}))
	return { id: roundId, fixtures: cupFixtures, picks: picks.map(toSettlementPick) }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Apply                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

/** Does this plan ask for anything at all? A re-run sweep's usually doesn't. */
function planIsEmpty(plan: SettlementPlan): boolean {
	return (
		plan.pickWrites.length === 0 &&
		plan.playerWrites.length === 0 &&
		plan.completion == null &&
		!plan.completeRound &&
		!plan.advance
	)
}

async function applySettlementPlan(plan: SettlementPlan, result: SettleResult): Promise<void> {
	// Don't open a connection to write nothing — the recovery sweeps re-derive
	// every settled fixture of a game on every page view.
	if (planIsEmpty(plan)) return
	const applied = await db.transaction((tx) => applyPlan(tx, plan))

	result.classicSettled += plan.counters.classicSettled
	result.turboSettled += plan.counters.turboSettled
	result.picksVoided += plan.counters.picksVoided
	if (plan.counters.cupReevaluated) result.cupGamesReevaluated++
	result.classicEliminated += applied.eliminated
	if (plan.gameCompleted) result.gamesCompleted.push(plan.gameId)
	if (applied.roundCompleted) result.roundsCompleted.push(applied.roundCompleted)
	if (applied.advanced) result.gamesAdvanced.push(plan.gameId)

	// Opening the next round schedules its QStash triggers, so it stays outside
	// the transaction rather than holding one open across an HTTP call. It is
	// idempotent, and the reconcile sweeps re-run it for anything it misses.
	if (applied.openRoundId) await openRoundForGame(applied.openRoundId)
}

interface AppliedPlan {
	eliminated: number
	roundCompleted: string | null
	advanced: boolean
	openRoundId: string | null
}

/**
 * The whole plan, in one transaction: the pick rows, the eliminations, the
 * payouts, the round's closure and the game's move to the next one. A crash
 * anywhere in it rolls the lot back, rather than leaving a round marked
 * complete on a game that never advanced for a recovery sweep to find.
 */
async function applyPlan(tx: Tx, plan: SettlementPlan): Promise<AppliedPlan> {
	for (const write of plan.pickWrites) {
		await tx.update(pick).set(write.set).where(eq(pick.id, write.pickId))
	}

	let eliminated = 0
	for (const write of plan.playerWrites) {
		const rows = await tx
			.update(gamePlayer)
			.set(write.set)
			.where(
				write.requireAlive
					? and(eq(gamePlayer.id, write.gamePlayerId), eq(gamePlayer.status, 'alive'))
					: eq(gamePlayer.id, write.gamePlayerId),
			)
			.returning({ id: gamePlayer.id })
		if (write.countsAsElimination && rows.length > 0) eliminated++
	}

	if (plan.completion) {
		await applyAutoCompletion(tx, plan.gameId, plan.completion.winnerPlayerIds, {
			refund: plan.completion.refund,
		})
	}

	let roundCompleted: string | null = null
	if (plan.completeRound) {
		await markRoundCompleted(tx, plan.roundId)
		roundCompleted = plan.roundId
	}

	if (!plan.advance) return { eliminated, roundCompleted, advanced: false, openRoundId: null }
	const advance = await advanceGame(tx, plan.gameId)
	return {
		eliminated,
		roundCompleted,
		advanced: advance.advanced,
		openRoundId: advance.openRoundId,
	}
}

/**
 * THE write that closes a round. One site, so "the round is over" can't be
 * said three different ways — and so the whole-round void, which closes a round
 * for a different reason, still says it the same way.
 */
async function markRoundCompleted(tx: Tx, roundId: string, voidedAt?: Date): Promise<void> {
	await tx
		.update(round)
		.set({ status: 'completed', ...(voidedAt ? { voidedAt } : {}) })
		.where(eq(round.id, roundId))
}

/* ────────────────────────────────────────────────────────────────────── */
/* Advancement                                                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * THE advancement gate and THE advancement body, in one function.
 *
 * Both paths that advance a game reach it: the settle path through `applyPlan`
 * (in the same transaction that closed the round) and the reconcile path
 * through `advanceGameIfReady`. It used to be two functions — a gate and a
 * body — with a doc comment asking future readers to keep the gate's
 * conditions in step across the two callers, which is what a shared seam is
 * for. The conditions matter: a knockout tie can be `finished` with its pick
 * deliberately pending (winner-lag, #107), and advancing past it strands the
 * pick forever — the player survives rounds they should have gone out in.
 *
 * Refuses to advance to a round with no fixtures or no deadline (e.g. a World
 * Cup knockout round before the bracket is published). The game stays pointed
 * at the just-completed round and the reconcile path retries on later ticks.
 *
 * Returns the round to *open* rather than opening it: that schedules QStash
 * triggers, which has no business inside a transaction.
 */
async function advanceGame(
	tx: Tx,
	gameId: string,
): Promise<{ advanced: boolean; reason: string; openRoundId: string | null }> {
	const refused = (reason: string) => ({ advanced: false, reason, openRoundId: null })

	const g = await tx.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { currentRound: true },
	})
	if (!g) return refused('not-found')
	if (g.status !== 'active') return refused('not-active')
	if (!g.currentRound) return refused('no-current-round')
	if (g.currentRound.status !== 'completed') return refused('round-not-completed')

	const pending = await tx.query.pick.findFirst({
		where: and(
			eq(pick.gameId, gameId),
			eq(pick.roundId, g.currentRound.id),
			eq(pick.result, 'pending'),
		),
	})
	if (pending) return refused('pending-picks')

	const nextRound = await tx.query.round.findFirst({
		where: and(eq(round.competitionId, g.competitionId), gt(round.number, g.currentRound.number)),
		orderBy: [asc(round.number)],
		with: { fixtures: true },
	})
	if (!nextRound) {
		await tx.update(game).set({ currentRoundId: null }).where(eq(game.id, gameId))
		return refused('no-next-round')
	}
	if (nextRound.fixtures.length === 0 || nextRound.deadline == null) {
		return refused('next-round-tbd')
	}
	await tx.update(game).set({ currentRoundId: nextRound.id }).where(eq(game.id, gameId))
	return { advanced: true, reason: 'advanced', openRoundId: nextRound.id }
}

/**
 * Retry advancement for a game stuck pointing at a completed round. Used by
 * the reconcile path to pick up games whose next round was TBD at
 * process-time and has since been populated by bootstrap.
 */
export async function advanceGameIfReady(
	gameId: string,
): Promise<{ advanced: boolean; reason: string }> {
	const outcome = await db.transaction((tx) => advanceGame(tx, gameId))
	if (outcome.openRoundId) await openRoundForGame(outcome.openRoundId)
	return { advanced: outcome.advanced, reason: outcome.reason }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Sweeps                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Sweep helper: for a given game, find every finished fixture in its
 * current round with pending picks and run settleFixture on each. Used
 * by reconcileGameState as the safety-net body, and by the qstash
 * handler's legacy `process_round` job.
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

/* ────────────────────────────────────────────────────────────────────── */
/* Cancellation / void                                                     */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Whole-round void for classic. Triggered when too many fixtures in a
 * round get cancelled (`deriveSettlement` owns the threshold and asks for this
 * through `plan.voidRound`).
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
 *     advanced by the per-game plans, which are re-derived against the
 *     torn-up round.
 */
async function voidWholeRound(roundId: string, result: SettleResult): Promise<void> {
	const r = await db.query.round.findFirst({ where: eq(round.id, roundId) })
	if (!r) return
	if (r.voidedAt != null) return // already voided

	const roundPicks = await db.query.pick.findMany({ where: eq(pick.roundId, roundId) })

	await db.transaction(async (tx) => {
		await markRoundCompleted(tx, roundId, new Date())

		// Void every pick on the round. Includes settled rows — the round is
		// being torn down.
		for (const p of roundPicks) {
			await tx
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

		// Reinstate players eliminated by this round. Players eliminated in
		// earlier rounds stay eliminated — their rounds still happened.
		await tx
			.update(gamePlayer)
			.set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
			.where(and(eq(gamePlayer.eliminatedRoundId, roundId), eq(gamePlayer.status, 'eliminated')))
	})

	result.picksVoided += roundPicks.length
	result.roundsVoided.push(roundId)
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
