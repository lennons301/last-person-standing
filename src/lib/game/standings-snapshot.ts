import { and, asc, countDistinct, eq, gt } from 'drizzle-orm'
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
 * The whole table is recorded, including teams on zero games played — the
 * league always has all its members, so `getTableSize` can count them and the
 * guide can honestly say "of 20" from the opening whistle. A zero-played row
 * carries the source's alphabetical placeholder for its position, so it is
 * keyed at `matchday: 0` and excluded by `getPositionLine` at read time: the
 * line never plots that placeholder, so there is no matchday-1 cliff.
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
		if (!teamId) {
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
	// notices. Gated on `played > 0` so it stays a signal about the id map: a
	// table that resolves fine but hasn't kicked off yet writes matchday-0 rows
	// and is silent, as season start should be.
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
 *
 * The `matchday: 0` placeholder row (a team recorded before it had kicked off)
 * is excluded: its position is the source's alphabetical seeding, not a result,
 * so the line begins at the team's first actual game.
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
			and(
				eq(standingsSnapshot.teamId, teamId),
				eq(standingsSnapshot.competitionId, competitionId),
				gt(standingsSnapshot.matchday, 0),
			),
		)
		.orderBy(asc(standingsSnapshot.matchday))
	return rows
}

/**
 * How many teams are in the competition — the axis floor for the position line
 * (1st at the top, last at the bottom) and the "of N" in the guide header.
 * Null only before any sync has snapshotted this competition.
 *
 * Counted across every matchday held, not just the latest, so the count can
 * only grow and the chart's floor never moves under a line already drawn. That
 * used to come at a cost at the other end: a team entered the count on the
 * matchday it first appeared, so the opening weekend could read "3rd of 18"
 * while the league held 20. It no longer can — the snapshot records the whole
 * table including teams on zero played, so this is the full league size from
 * the first post-deploy sync.
 */
export async function getTableSize(competitionId: string): Promise<number | null> {
	const [row] = await db
		.select({ teams: countDistinct(standingsSnapshot.teamId) })
		.from(standingsSnapshot)
		.where(eq(standingsSnapshot.competitionId, competitionId))
	return row?.teams ? Number(row.teams) : null
}
