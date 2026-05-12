import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { settleFixture, sweepGameSettlement } from '@/lib/game/settle'
import { fixture, round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

/**
 * Advance the game's currentRoundId pointer to the next round in the
 * competition. Round-state is per-game: each game advances independently
 * based on when its rounds complete, not on a global competition timeline.
 *
 * Refuses to advance to a round with no fixtures or no deadline (e.g. WC
 * knockout pre-bracket-publication). In that case the game stays pointed at
 * the just-completed round; advanceGameIfReady retries on subsequent cron
 * ticks once the next round has been populated.
 *
 * On successful advance, marks the new currentRound as 'open' and schedules
 * any auto-submit-flagged plans for it.
 */
async function advanceGameToNextRound(
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
		return { advanced: false, reason: 'next-round-tbd' }
	}
	await db.update(game).set({ currentRoundId: nextRound.id }).where(eq(game.id, gameId))
	await openRoundForGame(nextRound.id)
	return { advanced: true }
}

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
// Avoid unused-import lint warning while keeping fixture/round imports
// for the round walker above.
export const _settleRefs = { fixture, round }
