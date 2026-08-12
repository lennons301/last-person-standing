import { and, asc, countDistinct, eq } from 'drizzle-orm'
import type { AdapterStanding } from '@/lib/data/types'
import { db } from '@/lib/db'
import { standingsSnapshot } from '@/lib/schema/competition'

export interface StandingsSnapshotSummary {
	/** Snapshot rows written or refreshed. */
	written: number
	/** Standing rows skipped — team not in this competition, or no games played. */
	skipped: number
}

/**
 * Persist one matchday's worth of official standings.
 *
 * Called from the same funnel that writes `team.leaguePosition`
 * (`persistStandings` in bootstrap-competitions), so the snapshot is
 * exactly what the daily sync saw — no second provider read, no second
 * schedule. Keyed on the team's own played count, upserted, so:
 *
 * - re-running a sync within one matchday refreshes that point rather than
 *   duplicating it (positions shift while the rest of the matchday is played,
 *   and the last read of the day is the settled one);
 * - the series **accumulates from deployment onward**. Nothing backfills
 *   history, so a competition already mid-season starts its line wherever the
 *   first post-deploy sync found it. That's the documented shape of this
 *   feature, not a gap to paper over.
 *
 * A team on zero games played is skipped: its "position" is the source's
 * alphabetical placeholder, and plotting it would draw a cliff on matchday 1
 * that never happened.
 */
export async function recordStandingsSnapshot(
	competitionId: string,
	standings: AdapterStanding[],
	teamIdByExternalId: Map<string, string>,
	options?: { now?: Date },
): Promise<StandingsSnapshotSummary> {
	const summary: StandingsSnapshotSummary = { written: 0, skipped: 0 }
	const capturedAt = options?.now ?? new Date()

	for (const row of standings) {
		const teamId = teamIdByExternalId.get(row.teamExternalId)
		if (!teamId || row.played <= 0) {
			summary.skipped++
			continue
		}
		const values = {
			competitionId,
			teamId,
			matchday: row.played,
			position: row.position,
			played: row.played,
			won: row.won,
			drawn: row.drawn,
			lost: row.lost,
			points: row.points,
			capturedAt,
		}
		await db
			.insert(standingsSnapshot)
			.values(values)
			.onConflictDoUpdate({
				target: [
					standingsSnapshot.competitionId,
					standingsSnapshot.teamId,
					standingsSnapshot.matchday,
				],
				set: values,
			})
		summary.written++
	}
	// Played matchdays arrived but nothing landed: every row's team failed to
	// resolve (an id-map mismatch), which shows up only as a position line that
	// quietly stops growing. Say it here rather than leave it to whoever
	// notices. A whole table on zero played is season start, not a fault.
	if (summary.written === 0 && standings.some((row) => row.played > 0)) {
		console.warn(
			`[recordStandingsSnapshot] ${competitionId}: ${standings.length} standings row(s), none snapshotted`,
		)
	}
	return summary
}

/** One point on the form guide's position line. */
export interface PositionPoint {
	matchday: number
	position: number
	points: number
}

/**
 * A team's position line for a competition, oldest matchday first. Empty until
 * the first daily sync after this feature deployed — see the accumulation note
 * above; the form guide renders that emptiness as "the line starts once we've
 * seen a matchday", never as a fabricated flat line.
 */
export async function getPositionLine(
	teamId: string,
	competitionId: string,
): Promise<PositionPoint[]> {
	const rows = await db
		.select({
			matchday: standingsSnapshot.matchday,
			position: standingsSnapshot.position,
			points: standingsSnapshot.points,
		})
		.from(standingsSnapshot)
		.where(
			and(eq(standingsSnapshot.teamId, teamId), eq(standingsSnapshot.competitionId, competitionId)),
		)
		.orderBy(asc(standingsSnapshot.matchday))
	return rows
}

/**
 * How many teams the position line is measured against. The chart needs it to
 * scale its axis (1st at the top, last at the bottom) and the guide to say
 * "of 20". Null when nothing has been snapshotted yet.
 *
 * Counted across every matchday held for the competition, not just the latest
 * one, deliberately: the count can then only grow, so the chart's floor never
 * moves under a line that is already drawn. The cost is at the other end —
 * a team enters the count on the matchday it first appears, so in the opening
 * weeks (or after a round with a postponement) this is the number of clubs
 * that have played at least once, and a guide can read "3rd of 18" while the
 * league holds 20. It corrects itself as the stragglers play.
 */
export async function getTableSize(competitionId: string): Promise<number | null> {
	const [row] = await db
		.select({ teams: countDistinct(standingsSnapshot.teamId) })
		.from(standingsSnapshot)
		.where(eq(standingsSnapshot.competitionId, competitionId))
	return row?.teams ? Number(row.teams) : null
}
