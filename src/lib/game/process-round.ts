import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	advanceGameToNextRound,
	gameHasPendingPicksInRound,
	settleFixture,
	sweepGameSettlement,
} from '@/lib/game/settle'
import { round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

/**
 * Retry advancement for games stuck pointing at a completed round. Used by
 * the cron to pick up games whose next round was TBD at process-time and
 * has since been populated by bootstrap.
 */
export async function advanceGameIfReady(
	gameId: string,
): Promise<{ advanced: boolean; reason: string }> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { currentRound: true },
	})
	if (!g) return { advanced: false, reason: 'not-found' }
	if (g.status !== 'active') return { advanced: false, reason: 'not-active' }
	if (!g.currentRound) return { advanced: false, reason: 'no-current-round' }
	if (g.currentRound.status !== 'completed') {
		return { advanced: false, reason: 'round-not-completed' }
	}
	// Same pending-pick gate as the settle-path advancement
	// (checkAndMaybeCompleteOrAdvance): the round's status is the data
	// source's verdict that its fixtures are done, but a deferred knockout
	// pick (winner-lag) can still be pending on a finished fixture. Advancing
	// past it strands the pick forever — the player survives rounds they
	// should have gone out in.
	if (await gameHasPendingPicksInRound(gameId, g.currentRound.id)) {
		return { advanced: false, reason: 'pending-picks' }
	}
	const result = await advanceGameToNextRound(g.id, g.competitionId, g.currentRound.number)
	return { advanced: result.advanced, reason: result.reason ?? 'advanced' }
}

/**
 * Per-round sweep wrapper. Picks every finished fixture in the named round
 * that still has pending picks and runs settleFixture on it. Settlement
 * itself is per-fixture (see lib/game/settle.ts); this just walks the round.
 *
 * Kept exported so:
 *  - the qstash handler can still dispatch by (gameId, roundId) for
 *    backwards compatibility with any in-flight queued jobs;
 *  - the manual ops cron (/api/cron/process-rounds) and reconcile path
 *    both have a coarse-grained entry point to a game's settlement state.
 */
export async function processGameRound(gameId: string, roundId: string) {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: { orderBy: (fx, { asc }) => asc(fx.kickoff) },
		},
	})
	if (!roundData) throw new Error(`Round ${roundId} not found`)

	const finishedFixtures = roundData.fixtures.filter(
		(f) => f.status === 'finished' && f.homeScore != null && f.awayScore != null,
	)
	let settled = 0
	for (const f of finishedFixtures) {
		const r = await settleFixture(f.id)
		settled += r.classicSettled + r.turboSettled
	}
	// Sweep again via the game-scoped helper to catch any round-completion /
	// advancement that should have fired for THIS game in particular (the
	// per-fixture call settles cross-game state, but post-settle game
	// advance is keyed on the game's currentRoundId, so a game-scoped sweep
	// is a clean way to wrap up).
	await sweepGameSettlement(gameId)

	return { processed: settled > 0, fixturesSettled: settled }
}

/**
 * Used by tests / older code that wanted the underlying primitive. New
 * code should call settleFixture directly.
 */
export { settleFixture } from '@/lib/game/settle'
