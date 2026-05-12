import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { advanceGameIfReady, processGameRound } from '@/lib/game/process-round'
import { game } from '@/lib/schema/game'

export type ReconcileResult =
	| { ok: true; action: 'noop'; reason: string }
	| { ok: true; action: 'processed' }
	| { ok: true; action: 'advanced' }
	| { ok: false; error: string }

/**
 * Idempotent recovery for a single game. If the game's current round has all
 * fixtures finished but the round itself isn't completed yet, this calls
 * processGameRound (evaluates picks, eliminates, marks round complete,
 * advances to next round). If the game is stuck on a completed round (e.g.
 * next round was TBD at process time), this retries advancement.
 *
 * Designed to be called from every recovery surface — page SSR, live API,
 * daily-sync, manual cron. The idempotency guard in processGameRound makes
 * concurrent calls safe.
 *
 * Returns an action so callers can log or telemetry-track when reconciliation
 * actually did work, vs. when it was a no-op (the common case).
 */
export async function reconcileGameState(gameId: string): Promise<ReconcileResult> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			currentRound: {
				with: { fixtures: true },
			},
		},
	})
	if (!g) return { ok: false, error: 'game-not-found' }
	if (g.status !== 'active') return { ok: true, action: 'noop', reason: 'game-not-active' }
	if (!g.currentRoundId || !g.currentRound) {
		return { ok: true, action: 'noop', reason: 'no-current-round' }
	}

	// Stuck-on-completed: the round was processed but advanceGameToNextRound
	// couldn't find a next round (TBD bracket, etc.). Try again now.
	if (g.currentRound.status === 'completed') {
		const r = await advanceGameIfReady(gameId)
		if (r.advanced) return { ok: true, action: 'advanced' }
		return { ok: true, action: 'noop', reason: r.reason }
	}

	const fixtures = g.currentRound.fixtures
	if (fixtures.length === 0) return { ok: true, action: 'noop', reason: 'no-fixtures' }
	const allFinished = fixtures.every(
		(f) => f.status === 'finished' && f.homeScore != null && f.awayScore != null,
	)
	if (!allFinished) return { ok: true, action: 'noop', reason: 'fixtures-not-finished' }

	const result = await processGameRound(gameId, g.currentRoundId)
	if (!result.processed) {
		return { ok: true, action: 'noop', reason: result.reason ?? 'processGameRound-noop' }
	}
	return { ok: true, action: 'processed' }
}

/**
 * Reconcile every active game. Used by daily-sync as the 24h safety net for
 * games that nobody has viewed since their round finished.
 */
export async function reconcileAllActiveGames(): Promise<{
	checked: number
	processed: number
	advanced: number
}> {
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
	})
	let processed = 0
	let advanced = 0
	for (const g of activeGames) {
		const r = await reconcileGameState(g.id)
		if (r.ok && r.action === 'processed') processed++
		if (r.ok && r.action === 'advanced') advanced++
	}
	return { checked: activeGames.length, processed, advanced }
}
