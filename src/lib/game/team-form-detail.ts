import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roundLabel } from '@/lib/game/round-label'
import { competition, fixture, round, team } from '@/lib/schema/competition'

export interface TeamFormResult {
	roundNumber: number
	roundLabel: string
	opponentShortName: string
	opponentName: string
	opponentBadgeUrl: string | null
	home: boolean
	goalsFor: number
	goalsAgainst: number
	result: 'W' | 'D' | 'L'
}

/**
 * A team's record over some slice of its season — the whole of it, or just the
 * matches played at one venue.
 *
 * `form` is the venue's own recent-results string (most recent first): a team
 * can be mid-table on aggregate while unbeaten at home, and that's exactly the
 * read a picker wants before committing.
 */
export interface FormSplit {
	played: number
	wins: number
	draws: number
	losses: number
	goalsFor: number
	goalsAgainst: number
	/** Most recent results first, capped at `SPLIT_FORM_LIMIT`. */
	form: Array<'W' | 'D' | 'L'>
}

/** Overall record plus the home/away halves it decomposes into. */
export interface TeamFormSplits {
	overall: FormSplit
	home: FormSplit
	away: FormSplit
}

export interface TeamFormDetail {
	team: {
		id: string
		name: string
		shortName: string
		badgeUrl: string | null
		leaguePosition: number | null
	}
	/** Season record, split by venue, with goals for and against. */
	splits: TeamFormSplits
	recent: TeamFormResult[]
}

/** How many results each split's `form` string carries. */
export const SPLIT_FORM_LIMIT = 5

/**
 * One finished match involving the team, as the queries below select it. Scores
 * are nullable because `status='finished'` and "has a score" are separate facts
 * in the fixture table — a finished row with no score is not counted at all.
 */
export interface TeamFormMatchRow {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	roundNumber: number
}

/** Opponent display info, keyed by team id in `summariseTeamForm`. */
export interface TeamFormOpponent {
	name: string
	shortName: string
	badgeUrl: string | null
}

export interface TeamFormSummary {
	splits: TeamFormSplits
	recent: TeamFormResult[]
}

function emptySplit(): FormSplit {
	return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: [] }
}

/**
 * The form-detail assembly seam: turn a team's finished matches into the season
 * splits and recent-results list the form sheet renders. Pure — no database, no
 * dates, no ordering assumptions beyond the one the caller guarantees.
 *
 * `matches` must arrive **most recent first**, which is how both queries in this
 * file order them. That ordering is what makes `recent` the last N matches and
 * each split's `form` the last few at that venue.
 */
export function summariseTeamForm(input: {
	teamId: string
	matches: TeamFormMatchRow[]
	/** Opponent display info by team id; a missing entry renders as unknown. */
	opponents?: Map<string, TeamFormOpponent>
	competitionType: 'league' | 'knockout' | 'group_knockout'
	/** How many matches `recent` carries. */
	lastN?: number
}): TeamFormSummary {
	const { teamId, matches, opponents, competitionType, lastN = 8 } = input
	const splits: TeamFormSplits = { overall: emptySplit(), home: emptySplit(), away: emptySplit() }
	const recent: TeamFormResult[] = []

	for (const row of matches) {
		if (row.homeScore == null || row.awayScore == null) continue
		const isHome = row.homeTeamId === teamId
		const goalsFor = isHome ? row.homeScore : row.awayScore
		const goalsAgainst = isHome ? row.awayScore : row.homeScore
		const result: 'W' | 'D' | 'L' =
			goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D'

		for (const split of [splits.overall, isHome ? splits.home : splits.away]) {
			split.played++
			split.goalsFor += goalsFor
			split.goalsAgainst += goalsAgainst
			if (result === 'W') split.wins++
			else if (result === 'L') split.losses++
			else split.draws++
			if (split.form.length < SPLIT_FORM_LIMIT) split.form.push(result)
		}

		if (recent.length < lastN) {
			const opponent = opponents?.get(isHome ? row.awayTeamId : row.homeTeamId)
			recent.push({
				roundNumber: row.roundNumber,
				roundLabel: roundLabel(competitionType, row.roundNumber),
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

	return { splits, recent }
}

/**
 * The form sheet's data path. Deliberately opponent-blind: the sheet shows one
 * team's own season, and head-to-head — which within a single competition can
 * only ever be this season's meetings — belongs to the form-guide page, where
 * previous seasons are in scope.
 */
export async function getTeamFormDetail(
	teamId: string,
	competitionId: string,
	beforeRoundNumber?: number,
	lastN = 8,
): Promise<TeamFormDetail | null> {
	const teamRow = await db.query.team.findFirst({ where: eq(team.id, teamId) })
	if (!teamRow) return null

	const compRow = await db.query.competition.findFirst({
		where: eq(competition.id, competitionId),
	})
	const competitionType = (compRow?.type ?? 'league') as 'league' | 'knockout' | 'group_knockout'

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

	const { splits, recent } = summariseTeamForm({
		teamId,
		matches: finishedRows,
		opponents: new Map(
			opponentRows.map((t) => [
				t.id,
				{ name: t.name, shortName: t.shortName, badgeUrl: t.badgeUrl },
			]),
		),
		competitionType,
		lastN,
	})

	return {
		team: {
			id: teamRow.id,
			name: teamRow.name,
			shortName: teamRow.shortName,
			badgeUrl: teamRow.badgeUrl,
			leaguePosition: teamRow.leaguePosition,
		},
		splits,
		recent,
	}
}
