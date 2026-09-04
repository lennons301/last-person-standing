import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { advanceGameIfReady, sweepGameSettlement, sweepStuckFixtures } from '@/lib/game/settle'
import { game } from '@/lib/schema/game'

export type ReconcileResult =
	| { ok: true; action: 'noop'; reason: string }
	| { ok: true; action: 'settled'; fixturesSettled: number }
	| { ok: true; action: 'advanced' }
	| { ok: false; error: string }

/**
 * Idempotent safety-net for a single game. Per-fixture settlement
 * (lib/game/settle.ts) is the primary mechanism, called as each fixture
 * transitions to `finished` in live-poll + syncCompetition. Reconcile
 * exists in case those write sites missed something (network error,
 * future bug, in-flight migration of stuck data) — it walks the game's
 * current round and calls settleFixture for every finished-but-pending
 * fixture.
 *
 * Called from every recovery surface — page SSR, live API, daily-sync,
 * manual cron. settleFixture is idempotent (guards on pick.result !==
 * 'pending' for classic/turbo; cup re-eval is naturally idempotent), so
 * concurrent calls are safe.
 */
export async function reconcileGameState(gameId: string): Promise<ReconcileResult> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: {
				with: { fixtures: true },
			},
		},
	})
	if (!g) return { ok: false, error: 'game-not-found' }
	if (g.status !== 'active') return { ok: true, action: 'noop', reason: 'game-not-active' }
	// Archived competitions are immutable history — reconcile must not settle,
	// advance, or open rounds on one. Guarding here covers every recovery
	// surface at once (page SSR, live API, daily-sync sweep, manual cron).
	if (g.competition?.status === 'archived') {
		return { ok: true, action: 'noop', reason: 'competition-archived' }
	}
	if (!g.currentRoundId || !g.currentRound) {
		return { ok: true, action: 'noop', reason: 'no-current-round' }
	}

	// Stuck-on-completed: the round was processed but advanceGame
	// couldn't find a next round (TBD bracket, etc.). Try again now.
	if (g.currentRound.status === 'completed') {
		const r = await advanceGameIfReady(gameId)
		if (r.advanced) return { ok: true, action: 'advanced' }
		return { ok: true, action: 'noop', reason: r.reason }
	}

	const results = await sweepGameSettlement(gameId)
	const fixturesSettled = results.reduce(
		(sum, r) => sum + r.classicSettled + r.turboSettled + r.cupGamesReevaluated,
		0,
	)
	if (fixturesSettled === 0) {
		return { ok: true, action: 'noop', reason: 'no-pending-on-finished-fixtures' }
	}
	return { ok: true, action: 'settled', fixturesSettled }
}

/**
 * Reconcile every active game. Used by daily-sync as the 24h safety net for
 * games whose settlement was missed at every other surface.
 */
export async function reconcileAllActiveGames(): Promise<{
	checked: number
	settled: number
	advanced: number
	stuckFixturesSettled: number
}> {
	// All-rounds stranded-pick sweep FIRST: reconcileGameState only walks a
	// game's CURRENT round, so a pick deferred past its round (a knockout tie
	// whose winner landed after the game moved on) is invisible to the
	// per-game pass. sweepStuckFixtures finds every finished fixture with a
	// pending pick across ALL rounds; settleFixture applies the elimination
	// to the round the fixture belongs to. Running it first also unblocks any
	// advancement below that was gated on those picks.
	const stuck = await sweepStuckFixtures()
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
	})
	let settled = 0
	let advanced = 0
	for (const g of activeGames) {
		const r = await reconcileGameState(g.id)
		if (r.ok && r.action === 'settled') settled += r.fixturesSettled
		if (r.ok && r.action === 'advanced') advanced++
	}
	return { checked: activeGames.length, settled, advanced, stuckFixturesSettled: stuck.settled }
}
