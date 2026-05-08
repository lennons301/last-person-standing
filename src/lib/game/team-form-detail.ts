import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round, team } from '@/lib/schema/competition'

export interface TeamFormResult {
	roundNumber: number
	opponentShortName: string
	opponentName: string
	opponentBadgeUrl: string | null
	home: boolean
	goalsFor: number
	goalsAgainst: number
	result: 'W' | 'D' | 'L'
}

export interface HeadToHeadResult {
	roundNumber: number
	homeTeamShortName: string
	awayTeamShortName: string
	homeScore: number
	awayScore: number
}

export interface TeamFormDetail {
	team: {
		id: string
		name: string
		shortName: string
		badgeUrl: string | null
		leaguePosition: number | null
	}
	seasonRecord: { wins: number; draws: number; losses: number }
	recent: TeamFormResult[]
	headToHead: HeadToHeadResult[] | null
}

export async function getTeamFormDetail(
	teamId: string,
	competitionId: string,
	opponentTeamId?: string,
	beforeRoundNumber?: number,
	lastN = 8,
): Promise<TeamFormDetail | null> {
	const teamRow = await db.query.team.findFirst({ where: eq(team.id, teamId) })
	if (!teamRow) return null

	const finishedRows = await db
		.select({
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
			roundNumber: round.number,
		})
		.from(fixture)
		.innerJoin(round, eq(round.id, fixture.roundId))
		.where(
			and(
				eq(round.competitionId, competitionId),
				eq(fixture.status, 'finished'),
				beforeRoundNumber != null ? lt(round.number, beforeRoundNumber) : undefined,
				or(eq(fixture.homeTeamId, teamId), eq(fixture.awayTeamId, teamId)),
			),
		)
		.orderBy(desc(round.number), desc(fixture.kickoff))

	const opponentIds = new Set<string>()
	for (const r of finishedRows) {
		opponentIds.add(r.homeTeamId === teamId ? r.awayTeamId : r.homeTeamId)
	}
	const opponentRows = opponentIds.size
		? await db.query.team.findMany({ where: inArray(team.id, Array.from(opponentIds)) })
		: []
	const opponentMap = new Map(opponentRows.map((t) => [t.id, t]))

	let wins = 0
	let draws = 0
	let losses = 0
	const recent: TeamFormResult[] = []
	for (const row of finishedRows) {
		if (row.homeScore == null || row.awayScore == null) continue
		const isHome = row.homeTeamId === teamId
		const goalsFor = isHome ? row.homeScore : row.awayScore
		const goalsAgainst = isHome ? row.awayScore : row.homeScore
		let result: 'W' | 'D' | 'L'
		if (goalsFor > goalsAgainst) {
			result = 'W'
			wins++
		} else if (goalsFor < goalsAgainst) {
			result = 'L'
			losses++
		} else {
			result = 'D'
			draws++
		}
		if (recent.length < lastN) {
			const opponentId = isHome ? row.awayTeamId : row.homeTeamId
			const opponent = opponentMap.get(opponentId)
			recent.push({
				roundNumber: row.roundNumber,
				opponentShortName: opponent?.shortName ?? '???',
				opponentName: opponent?.name ?? 'Unknown',
				opponentBadgeUrl: opponent?.badgeUrl ?? null,
				home: isHome,
				goalsFor,
				goalsAgainst,
				result,
			})
		}
	}

	let headToHead: HeadToHeadResult[] | null = null
	if (opponentTeamId) {
		const h2hRows = await db
			.select({
				homeTeamId: fixture.homeTeamId,
				awayTeamId: fixture.awayTeamId,
				homeScore: fixture.homeScore,
				awayScore: fixture.awayScore,
				roundNumber: round.number,
			})
			.from(fixture)
			.innerJoin(round, eq(round.id, fixture.roundId))
			.where(
				and(
					eq(round.competitionId, competitionId),
					eq(fixture.status, 'finished'),
					or(
						and(eq(fixture.homeTeamId, teamId), eq(fixture.awayTeamId, opponentTeamId)),
						and(eq(fixture.homeTeamId, opponentTeamId), eq(fixture.awayTeamId, teamId)),
					),
				),
			)
			.orderBy(desc(round.number))
			.limit(5)

		const teamShortNames = new Map<string, string>()
		teamShortNames.set(teamRow.id, teamRow.shortName)
		const opp = opponentMap.get(opponentTeamId)
		if (opp) teamShortNames.set(opp.id, opp.shortName)
		// Fallback for opponent not in the loaded set (unlikely but defensive).
		if (!teamShortNames.has(opponentTeamId)) {
			const oppRow = await db.query.team.findFirst({ where: eq(team.id, opponentTeamId) })
			if (oppRow) teamShortNames.set(oppRow.id, oppRow.shortName)
		}

		headToHead = h2hRows
			.filter((r) => r.homeScore != null && r.awayScore != null)
			.map((r) => ({
				roundNumber: r.roundNumber,
				homeTeamShortName: teamShortNames.get(r.homeTeamId) ?? '???',
				awayTeamShortName: teamShortNames.get(r.awayTeamId) ?? '???',
				homeScore: r.homeScore as number,
				awayScore: r.awayScore as number,
			}))
	}

	// Suppress unused-var lint when ascending pulls aren't needed; asc imported for symmetry with detail-queries.ts patterns.
	void asc

	return {
		team: {
			id: teamRow.id,
			name: teamRow.name,
			shortName: teamRow.shortName,
			badgeUrl: teamRow.badgeUrl,
			leaguePosition: teamRow.leaguePosition,
		},
		seasonRecord: { wins, draws, losses },
		recent,
		headToHead,
	}
}
