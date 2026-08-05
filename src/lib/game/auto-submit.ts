import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture } from '@/lib/schema/competition'
import { gamePlayer, pick, plannedPick } from '@/lib/schema/game'

export async function submitPlannedPick(
	gamePlayerId: string,
	roundId: string,
	teamId: string,
): Promise<{ submitted: boolean; reason?: string }> {
	// Verify plan still exists (player might have removed it)
	const plan = await db.query.plannedPick.findFirst({
		where: and(eq(plannedPick.gamePlayerId, gamePlayerId), eq(plannedPick.roundId, roundId)),
	})
	if (!plan || plan.teamId !== teamId) return { submitted: false, reason: 'plan-removed' }

	const gp = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gamePlayerId) })
	if (!gp || gp.status !== 'alive') return { submitted: false, reason: 'player-not-alive' }

	// Verify no pick already submitted for this round
	const existingPick = await db.query.pick.findFirst({
		where: and(eq(pick.gamePlayerId, gamePlayerId), eq(pick.roundId, roundId)),
	})
	if (existingPick) return { submitted: false, reason: 'already-picked' }

	// Find the fixture where this team plays in this round. Ordered by kickoff
	// so when a team has multiple fixtures in a round (e.g. PL rearrangements),
	// the auto-submit picks the earliest one deterministically.
	const fixturesInRound = await db.query.fixture.findMany({
		where: eq(fixture.roundId, roundId),
		orderBy: [asc(fixture.kickoff)],
	})
	const fx = fixturesInRound.find((f) => f.homeTeamId === teamId || f.awayTeamId === teamId)
	if (!fx) return { submitted: false, reason: 'team-not-in-round' }

	// Write the pick with auto_submitted = true, then clear the plan.
	// The existing-pick read above can be raced by the deadline no-pick lock's
	// auto-pick, so the partial unique index `pick_player_round_classic_idx`
	// settles it: on conflict the insert is a no-op and this reports
	// 'already-picked' exactly as the sequential path does, leaving the plan
	// alone rather than crashing the QStash handler with a unique violation.
	const inserted = await db
		.insert(pick)
		.values({
			gameId: gp.gameId,
			gamePlayerId,
			roundId,
			teamId,
			fixtureId: fx.id,
			autoSubmitted: true,
		})
		.onConflictDoNothing({
			target: [pick.gamePlayerId, pick.roundId],
			where: sql`${pick.confidenceRank} is null`,
		})
		.returning({ id: pick.id })
	if (inserted.length === 0) return { submitted: false, reason: 'already-picked' }

	await db.delete(plannedPick).where(eq(plannedPick.id, plan.id))
	return { submitted: true }
}
