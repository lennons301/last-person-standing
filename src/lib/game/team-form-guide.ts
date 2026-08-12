import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm'
import type { FixtureOdds } from '@/components/picks/fixture-row'
import { db } from '@/lib/db'
import { toFixtureOddsView } from '@/lib/game/fixture-odds-view'
import { roundLabel, roundLabelLong } from '@/lib/game/round-label'
import { getPositionLine, getTableSize, type PositionPoint } from '@/lib/game/standings-snapshot'
import { competition, fixture, fixtureOdds, round, team } from '@/lib/schema/competition'

export interface FormGuideTeam {
	id: string
	name: string
	shortName: string
	badgeUrl: string | null
}

/** One finished match in the season's results list. */
export interface FormGuideResult {
	fixtureId: string
	roundNumber: number
	roundLabel: string
	/** ISO — serialised here because the guide's view is a client component. */
	kickoff: string | null
	opponent: FormGuideTeam
	home: boolean
	goalsFor: number
	goalsAgainst: number
	result: 'W' | 'D' | 'L'
}

/**
 * A win/draw/loss + goals tally over some slice of the season. Totals only —
 * per-game averages are derived at render time (`perGame`) so a zero-played
 * slice can render a dash rather than a NaN.
 */
export interface FormGuideRecord {
	played: number
	wins: number
	draws: number
	losses: number
	goalsFor: number
	goalsAgainst: number
}

/** The team's next scheduled match, with the market's read on it. */
export interface FormGuideNextFixture {
	fixtureId: string
	roundNumber: number
	roundLabel: string
	roundName: string
	kickoff: string | null
	opponent: FormGuideTeam
	/** True when this team is at home — which side of `odds` is theirs. */
	home: boolean
	/** Null for a fixture (or competition) we hold no odds for. Never a zero. */
	odds: FixtureOdds | null
}

export interface FormGuideHeadToHead {
	opponent: FormGuideTeam
	results: FormGuideResult[]
}

export interface TeamFormGuide {
	team: FormGuideTeam & { leaguePosition: number | null }
	competition: { id: string; name: string; type: 'league' | 'knockout' | 'group_knockout' }
	/** Position by matchday, oldest first. Empty until the snapshot has run. */
	positionLine: PositionPoint[]
	/** Teams in the table, from the snapshot. Null before the first snapshot. */
	tableSize: number | null
	overall: FormGuideRecord
	homeRecord: FormGuideRecord
	awayRecord: FormGuideRecord
	/** Every finished match this season, most recent first. */
	results: FormGuideResult[]
	nextFixture: FormGuideNextFixture | null
	/** Set only when the guide was opened from a pick, i.e. with an opponent. */
	headToHead: FormGuideHeadToHead | null
}

/** Per-game average, or null when nothing has been played. */
export function perGame(total: number, played: number): number | null {
	if (played <= 0) return null
	return total / played
}

/** Tally a set of results — the whole season, or just its home/away half. */
export function summariseResults(results: FormGuideResult[]): FormGuideRecord {
	const record: FormGuideRecord = {
		played: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		goalsFor: 0,
		goalsAgainst: 0,
	}
	for (const r of results) {
		record.played++
		if (r.result === 'W') record.wins++
		else if (r.result === 'D') record.draws++
		else record.losses++
		record.goalsFor += r.goalsFor
		record.goalsAgainst += r.goalsAgainst
	}
	return record
}

/**
 * Everything the full form-guide page shows for one team in one competition.
 *
 * Competition-scoped, not game-scoped: two players in different games on the
 * same competition are looking at the same page, and nothing here depends on a
 * game, a player or a pick. `opponentTeamId` is the only pick-shaped input —
 * supplied when the guide was opened from a fixture, and the only thing that
 * brings out the head-to-head section.
 *
 * Returns null when the team or competition doesn't exist, so the page can
 * 404 rather than render an empty shell.
 */
export async function getTeamFormGuide(
	teamId: string,
	competitionId: string,
	opponentTeamId?: string,
	options?: { now?: Date },
): Promise<TeamFormGuide | null> {
	const [teamRow, compRow] = await Promise.all([
		db.query.team.findFirst({ where: eq(team.id, teamId) }),
		db.query.competition.findFirst({ where: eq(competition.id, competitionId) }),
	])
	if (!teamRow || !compRow) return null
	const competitionType = compRow.type as 'league' | 'knockout' | 'group_knockout'
	const now = options?.now ?? new Date()

	const rows = await db
		.select({
			fixtureId: fixture.id,
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
			status: fixture.status,
			kickoff: fixture.kickoff,
			roundNumber: round.number,
		})
		.from(fixture)
		.innerJoin(round, eq(round.id, fixture.roundId))
		// Every fixture, not just the finished ones: the unplayed ones are what
		// give `loadNextFixture` its opponent without a second team read.
		.where(
			and(
				eq(round.competitionId, competitionId),
				or(eq(fixture.homeTeamId, teamId), eq(fixture.awayTeamId, teamId)),
			),
		)
		.orderBy(desc(round.number), desc(fixture.kickoff))

	const opponentIds = new Set<string>()
	for (const r of rows) opponentIds.add(r.homeTeamId === teamId ? r.awayTeamId : r.homeTeamId)
	if (opponentTeamId) opponentIds.add(opponentTeamId)
	const opponentRows = opponentIds.size
		? await db.query.team.findMany({ where: inArray(team.id, Array.from(opponentIds)) })
		: []
	const opponents = new Map(opponentRows.map((t) => [t.id, toGuideTeam(t)]))

	const results: FormGuideResult[] = []
	for (const row of rows) {
		if (row.status !== 'finished' || row.homeScore == null || row.awayScore == null) continue
		results.push(
			toResult(row, teamId, competitionType, opponents.get(otherSide(row, teamId)) ?? UNKNOWN_TEAM),
		)
	}

	const [positionLine, tableSize, nextFixture, headToHead] = await Promise.all([
		getPositionLine(teamId, competitionId),
		getTableSize(competitionId),
		loadNextFixture(teamId, competitionId, competitionType, opponents, now),
		opponentTeamId
			? loadHeadToHead(teamId, opponentTeamId, competitionId, competitionType, opponents)
			: Promise.resolve(null),
	])

	return {
		team: {
			...toGuideTeam(teamRow),
			leaguePosition: teamRow.leaguePosition,
		},
		competition: { id: compRow.id, name: compRow.name, type: competitionType },
		positionLine,
		tableSize,
		overall: summariseResults(results),
		homeRecord: summariseResults(results.filter((r) => r.home)),
		awayRecord: summariseResults(results.filter((r) => !r.home)),
		results,
		nextFixture,
		headToHead,
	}
}

const UNKNOWN_TEAM: FormGuideTeam = {
	id: 'unknown',
	name: 'Unknown',
	shortName: '???',
	badgeUrl: null,
}

function toGuideTeam(row: {
	id: string
	name: string
	shortName: string
	badgeUrl: string | null
}): FormGuideTeam {
	return { id: row.id, name: row.name, shortName: row.shortName, badgeUrl: row.badgeUrl }
}

interface FixtureRowShape {
	fixtureId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	kickoff: Date | null
	roundNumber: number
}

function otherSide(row: { homeTeamId: string; awayTeamId: string }, teamId: string): string {
	return row.homeTeamId === teamId ? row.awayTeamId : row.homeTeamId
}

function toResult(
	row: FixtureRowShape,
	teamId: string,
	competitionType: 'league' | 'knockout' | 'group_knockout',
	opponent: FormGuideTeam,
): FormGuideResult {
	const home = row.homeTeamId === teamId
	const goalsFor = (home ? row.homeScore : row.awayScore) ?? 0
	const goalsAgainst = (home ? row.awayScore : row.homeScore) ?? 0
	return {
		fixtureId: row.fixtureId,
		roundNumber: row.roundNumber,
		roundLabel: roundLabel(competitionType, row.roundNumber),
		kickoff: row.kickoff ? row.kickoff.toISOString() : null,
		opponent,
		home,
		goalsFor,
		goalsAgainst,
		result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
	}
}

/**
 * The next match this team is scheduled to play, with its persisted odds.
 *
 * "Next" is the earliest scheduled kickoff from now — not the next round —
 * because a rescheduled match can sit outside its round's window. A team with
 * no scheduled kickoff left (season over, or fixtures not yet published) has
 * no next fixture, and the page says so rather than inventing one.
 */
async function loadNextFixture(
	teamId: string,
	competitionId: string,
	competitionType: 'league' | 'knockout' | 'group_knockout',
	opponents: Map<string, FormGuideTeam>,
	now: Date,
): Promise<FormGuideNextFixture | null> {
	const [next] = await db
		.select({
			fixtureId: fixture.id,
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			kickoff: fixture.kickoff,
			roundNumber: round.number,
			roundName: round.name,
			odds: {
				homePrice: fixtureOdds.homePrice,
				drawPrice: fixtureOdds.drawPrice,
				awayPrice: fixtureOdds.awayPrice,
				homeProbability: fixtureOdds.homeProbability,
				drawProbability: fixtureOdds.drawProbability,
				awayProbability: fixtureOdds.awayProbability,
				asOf: fixtureOdds.asOf,
			},
		})
		.from(fixture)
		.innerJoin(round, eq(round.id, fixture.roundId))
		.leftJoin(fixtureOdds, eq(fixtureOdds.fixtureId, fixture.id))
		.where(
			and(
				eq(round.competitionId, competitionId),
				eq(fixture.status, 'scheduled'),
				gte(fixture.kickoff, now),
				or(eq(fixture.homeTeamId, teamId), eq(fixture.awayTeamId, teamId)),
			),
		)
		.orderBy(asc(fixture.kickoff))
		.limit(1)
	if (!next) return null

	const home = next.homeTeamId === teamId
	return {
		fixtureId: next.fixtureId,
		roundNumber: next.roundNumber,
		roundLabel: roundLabel(competitionType, next.roundNumber),
		roundName: next.roundName ?? roundLabelLong(competitionType, next.roundNumber),
		kickoff: next.kickoff ? next.kickoff.toISOString() : null,
		opponent: opponents.get(otherSide(next, teamId)) ?? UNKNOWN_TEAM,
		home,
		// The left join yields an all-null odds object for an unpriced fixture;
		// `asOf` is the not-null column, so it's the honest presence test.
		odds: next.odds?.asOf
			? toFixtureOddsView(next.odds as Parameters<typeof toFixtureOddsView>[0])
			: null,
	}
}

/**
 * Meetings between the two clubs, most recent first. Scoped to this
 * competition like everything else on the page — a season's worth of history,
 * which for a league is the reverse fixture, and for a cup the earlier ties.
 */
async function loadHeadToHead(
	teamId: string,
	opponentTeamId: string,
	competitionId: string,
	competitionType: 'league' | 'knockout' | 'group_knockout',
	opponents: Map<string, FormGuideTeam>,
): Promise<FormGuideHeadToHead | null> {
	const opponent = opponents.get(opponentTeamId)
	if (!opponent) return null

	const rows = await db
		.select({
			fixtureId: fixture.id,
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
			kickoff: fixture.kickoff,
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

	return {
		opponent,
		results: rows
			.filter((r) => r.homeScore != null && r.awayScore != null)
			.map((r) => toResult(r, teamId, competitionType, opponent)),
	}
}
