import type { FormGuideResult, FormGuideTeam, TeamFormGuide } from '@/lib/game/team-form-guide'
import { summariseResults } from '@/lib/game/team-form-guide'

/**
 * Hand-built form guides for `/preview/form-guide`. No database, no auth, no
 * game — `FormGuideView` takes a resolved `TeamFormGuide` and nothing else, so
 * every state the page can be in is reachable from plain data here.
 */

const ARS: FormGuideTeam = {
	id: 'team-ars',
	name: 'Arsenal',
	shortName: 'ARS',
	badgeUrl: null,
}
const MCI: FormGuideTeam = {
	id: 'team-mci',
	name: 'Manchester City',
	shortName: 'MCI',
	badgeUrl: null,
}
const EVE: FormGuideTeam = { id: 'team-eve', name: 'Everton', shortName: 'EVE', badgeUrl: null }
const BUR: FormGuideTeam = { id: 'team-bur', name: 'Burnley', shortName: 'BUR', badgeUrl: null }
const NEW: FormGuideTeam = {
	id: 'team-new',
	name: 'Newcastle United',
	shortName: 'NEW',
	badgeUrl: null,
}

function result(
	roundNumber: number,
	opponent: FormGuideTeam,
	home: boolean,
	goalsFor: number,
	goalsAgainst: number,
): FormGuideResult {
	return {
		fixtureId: `fx-${roundNumber}`,
		roundNumber,
		roundLabel: `GW${roundNumber}`,
		kickoff: `2026-0${Math.min(9, 8 + Math.floor(roundNumber / 5))}-${String((roundNumber % 27) + 1).padStart(2, '0')}T14:00:00.000Z`,
		opponent,
		home,
		goalsFor,
		goalsAgainst,
		result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
	}
}

/** A season's worth of results, most recent first, as the query returns them. */
const SEASON_RESULTS: FormGuideResult[] = [
	result(12, MCI, true, 2, 1),
	result(11, EVE, false, 0, 0),
	result(10, BUR, true, 3, 0),
	result(9, NEW, false, 1, 2),
	result(8, MCI, false, 1, 1),
	result(7, EVE, true, 4, 1),
	result(6, BUR, false, 2, 0),
	result(5, NEW, true, 1, 0),
	result(4, MCI, true, 0, 2),
	result(3, EVE, false, 2, 2),
	result(2, BUR, true, 2, 1),
	result(1, NEW, false, 3, 1),
]

function guideFrom(results: FormGuideResult[], overrides: Partial<TeamFormGuide>): TeamFormGuide {
	return {
		team: { ...ARS, leaguePosition: 3 },
		competition: { id: 'comp-pl', name: 'Premier League 2026/27', type: 'league' },
		positionLine: [],
		tableSize: 20,
		overall: summariseResults(results),
		homeRecord: summariseResults(results.filter((r) => r.home)),
		awayRecord: summariseResults(results.filter((r) => !r.home)),
		results,
		nextFixture: null,
		headToHead: null,
		...overrides,
	}
}

/** Mid-season, arrived at from a pick: position line, priced next fixture, h2h. */
export const FULL_GUIDE: TeamFormGuide = guideFrom(SEASON_RESULTS, {
	positionLine: [
		{ matchday: 1, position: 8, points: 3 },
		{ matchday: 2, position: 6, points: 6 },
		{ matchday: 3, position: 7, points: 7 },
		{ matchday: 4, position: 11, points: 7 },
		{ matchday: 5, position: 9, points: 10 },
		{ matchday: 6, position: 6, points: 13 },
		{ matchday: 7, position: 4, points: 16 },
		{ matchday: 8, position: 5, points: 17 },
		{ matchday: 9, position: 6, points: 17 },
		{ matchday: 10, position: 4, points: 20 },
		{ matchday: 11, position: 4, points: 21 },
		{ matchday: 12, position: 3, points: 24 },
	],
	nextFixture: {
		fixtureId: 'fx-next',
		roundNumber: 13,
		roundLabel: 'GW13',
		roundName: 'Gameweek 13',
		kickoff: '2026-11-21T15:00:00.000Z',
		opponent: MCI,
		home: true,
		odds: {
			home: { probability: 0.52, price: 1.85 },
			away: { probability: 0.26, price: 3.6 },
			asOf: '2026-11-20T09:12:00.000Z',
		},
	},
	headToHead: {
		opponent: MCI,
		results: [result(12, MCI, true, 2, 1), result(8, MCI, false, 1, 1), result(4, MCI, true, 0, 2)],
	},
})

/** Same team, arrived at without a fixture in mind: no head-to-head section. */
export const NO_OPPONENT_GUIDE: TeamFormGuide = { ...FULL_GUIDE, headToHead: null }

/**
 * Second matchday of a new season. The point of this one is that everything
 * sparse reads as *intentional*: two results, a two-point position line, a
 * next fixture we hold no odds for.
 */
export const EARLY_SEASON_GUIDE: TeamFormGuide = guideFrom([result(2, BUR, true, 1, 1)], {
	team: { ...ARS, leaguePosition: 9 },
	positionLine: [
		{ matchday: 1, position: 12, points: 0 },
		{ matchday: 2, position: 9, points: 1 },
	],
	nextFixture: {
		fixtureId: 'fx-next-early',
		roundNumber: 3,
		roundLabel: 'GW3',
		roundName: 'Gameweek 3',
		kickoff: '2026-08-29T14:00:00.000Z',
		opponent: NEW,
		home: false,
		odds: null,
	},
	headToHead: { opponent: NEW, results: [] },
})

/**
 * The day the season opens, on a competition the snapshot has never run for:
 * no results, no position history, no odds. Every section has to say what it
 * doesn't know rather than render blank.
 */
export const EMPTY_GUIDE: TeamFormGuide = guideFrom([], {
	team: { ...ARS, leaguePosition: null },
	tableSize: null,
	positionLine: [],
	nextFixture: {
		fixtureId: 'fx-next-empty',
		roundNumber: 1,
		roundLabel: 'GW1',
		roundName: 'Gameweek 1',
		kickoff: null,
		opponent: EVE,
		home: true,
		odds: null,
	},
})
