import { describe, expect, it } from 'vitest'
import type { FixtureTeamInfo } from '@/components/picks/fixture-row'
import {
	buildPickTableRows,
	DEFAULT_PICK_TABLE_SORT,
	defaultPickView,
	formPoints,
	nextPickTableSort,
	type PickTableFixture,
	pickTableHasStandings,
	sortPickTableRows,
} from './pick-table-view'

function team(id: string, name: string, overrides: Partial<FixtureTeamInfo> = {}): FixtureTeamInfo {
	return {
		id,
		name,
		shortName: name.slice(0, 3).toUpperCase(),
		leaguePosition: null,
		...overrides,
	}
}

const ARS = team('t-ars', 'Arsenal', {
	leaguePosition: 1,
	form: ['W', 'W', 'W', 'D', 'W'],
	standing: { played: 26, points: 60, goalsFor: 58, goalsAgainst: 20 },
})
const BUR = team('t-bur', 'Burnley', {
	leaguePosition: 18,
	form: ['L', 'L', 'D', 'L', 'L'],
	standing: { played: 26, points: 20, goalsFor: 22, goalsAgainst: 48 },
})
const CHE = team('t-che', 'Chelsea', {
	leaguePosition: 6,
	form: ['W', 'D', 'W', 'L', 'D'],
	standing: { played: 26, points: 44, goalsFor: 40, goalsAgainst: 30 },
})
const EVE = team('t-eve', 'Everton', {
	leaguePosition: 12,
	form: ['D', 'L', 'W', 'D', 'L'],
	standing: { played: 25, points: 31, goalsFor: 28, goalsAgainst: 33 },
})

const FIXTURES: PickTableFixture[] = [
	{
		id: 'fx-1',
		home: ARS,
		away: BUR,
		kickoff: '2099-03-01T15:00:00.000Z',
		odds: {
			home: { probability: 0.82, price: 1.18 },
			draw: { probability: 0.11, price: 9 },
			away: { probability: 0.07, price: 13.5 },
			asOf: '2099-02-28T09:00:00.000Z',
		},
	},
	{
		id: 'fx-2',
		home: CHE,
		away: EVE,
		kickoff: '2099-03-01T17:30:00.000Z',
		// Deliberately unpriced: the row that has to degrade.
	},
]

function ids(rows: ReturnType<typeof buildPickTableRows>): string[] {
	return rows.map((r) => r.team.shortName)
}

describe('buildPickTableRows', () => {
	it('emits one row per team, carrying its opponent and the side it plays on', () => {
		const rows = buildPickTableRows({ fixtures: FIXTURES })
		expect(rows).toHaveLength(4)
		const arsenal = rows.find((r) => r.team.id === 't-ars')
		expect(arsenal).toMatchObject({
			fixtureId: 'fx-1',
			side: 'home',
			winProbability: 0.82,
			price: 1.18,
			pickable: true,
		})
		expect(arsenal?.opponent.name).toBe('Burnley')
		expect(rows.find((r) => r.team.id === 't-bur')).toMatchObject({
			side: 'away',
			winProbability: 0.07,
		})
	})

	it('leaves an unpriced fixture with no probability at all rather than a zero', () => {
		const rows = buildPickTableRows({ fixtures: FIXTURES })
		const chelsea = rows.find((r) => r.team.id === 't-che')
		expect(chelsea?.winProbability).toBeNull()
		expect(chelsea?.price).toBeNull()
	})

	it('marks a used team with the round it was used in, and keeps it in the table', () => {
		const rows = buildPickTableRows({
			fixtures: FIXTURES,
			usedTeamsByRound: { 't-ars': 'GW3' },
		})
		const arsenal = rows.find((r) => r.team.id === 't-ars')
		expect(arsenal?.state).toEqual({ kind: 'used', label: 'GW3' })
		expect(arsenal?.pickable).toBe(false)
		expect(rows).toHaveLength(4)
	})

	it('marks a restricted team with its reason', () => {
		const rows = buildPickTableRows({
			fixtures: FIXTURES,
			restrictedTeams: { 't-che': 'Already through' },
		})
		expect(rows.find((r) => r.team.id === 't-che')?.state).toEqual({
			kind: 'restricted',
			reason: 'Already through',
		})
	})

	it('prefers "used" over "restricted" when a team is both — it names the round', () => {
		const rows = buildPickTableRows({
			fixtures: FIXTURES,
			usedTeamsByRound: { 't-ars': 'GW3' },
			restrictedTeams: { 't-ars': 'Already through' },
		})
		expect(rows.find((r) => r.team.id === 't-ars')?.state).toEqual({ kind: 'used', label: 'GW3' })
	})
})

describe('sortPickTableRows', () => {
	const rows = buildPickTableRows({ fixtures: FIXTURES })

	it('defaults to safest-first: win-probability, descending', () => {
		expect(DEFAULT_PICK_TABLE_SORT).toEqual({ column: 'winProbability', direction: 'desc' })
		expect(ids(sortPickTableRows(rows, DEFAULT_PICK_TABLE_SORT)).slice(0, 2)).toEqual([
			'ARS',
			'BUR',
		])
	})

	it('sinks rows with no value to the bottom in BOTH directions', () => {
		// Ascending win-probability must not float the two unpriced teams to the
		// top of a board that promises safest-first — "no odds" isn't zero.
		const asc = ids(sortPickTableRows(rows, { column: 'winProbability', direction: 'asc' }))
		expect(asc.slice(0, 2)).toEqual(['BUR', 'ARS'])
		expect(asc.slice(2).sort()).toEqual(['CHE', 'EVE'])

		const desc = ids(sortPickTableRows(rows, { column: 'winProbability', direction: 'desc' }))
		expect(desc.slice(2).sort()).toEqual(['CHE', 'EVE'])
	})

	it('sorts by league position, played, points and goal difference', () => {
		expect(ids(sortPickTableRows(rows, { column: 'position', direction: 'asc' }))).toEqual([
			'ARS',
			'CHE',
			'EVE',
			'BUR',
		])
		expect(ids(sortPickTableRows(rows, { column: 'points', direction: 'desc' }))).toEqual([
			'ARS',
			'CHE',
			'EVE',
			'BUR',
		])
		expect(ids(sortPickTableRows(rows, { column: 'goalDifference', direction: 'desc' }))).toEqual([
			'ARS',
			'CHE',
			'EVE',
			'BUR',
		])
		expect(
			ids(sortPickTableRows(rows, { column: 'played', direction: 'asc' })).slice(0, 1),
		).toEqual(['EVE'])
	})

	it('sorts by form points and by the opponent name', () => {
		expect(ids(sortPickTableRows(rows, { column: 'form', direction: 'desc' })).slice(0, 1)).toEqual(
			['ARS'],
		)
		// Opponents A–Z: Arsenal (BUR's opponent) … Everton (CHE's).
		expect(ids(sortPickTableRows(rows, { column: 'opponent', direction: 'asc' }))).toEqual([
			'BUR',
			'ARS',
			'EVE',
			'CHE',
		])
	})

	it('breaks ties by team name so equal rows never shuffle between sorts', () => {
		const levelFixtures: PickTableFixture[] = [
			{
				id: 'fx-level',
				home: team('t-z', 'Zebra FC', { standing: { points: 30 } }),
				away: team('t-a', 'Albion FC', { standing: { points: 30 } }),
			},
		]
		const level = buildPickTableRows({ fixtures: levelFixtures })
		expect(ids(sortPickTableRows(level, { column: 'points', direction: 'desc' }))).toEqual([
			'ALB',
			'ZEB',
		])
		expect(ids(sortPickTableRows(level, { column: 'points', direction: 'asc' }))).toEqual([
			'ALB',
			'ZEB',
		])
	})

	it('does not mutate the rows it was given', () => {
		const original = [...rows]
		sortPickTableRows(rows, { column: 'points', direction: 'asc' })
		expect(rows).toEqual(original)
	})

	it('sorts a table with no standings at all by name alone, without throwing', () => {
		const bare = buildPickTableRows({
			fixtures: [{ id: 'fx-bare', home: team('t-x', 'Ajax'), away: team('t-y', 'Benfica') }],
		})
		expect(ids(sortPickTableRows(bare, { column: 'points', direction: 'desc' }))).toEqual([
			'AJA',
			'BEN',
		])
	})
})

describe('nextPickTableSort', () => {
	it('flips the direction when the sorted column is tapped again', () => {
		expect(nextPickTableSort({ column: 'points', direction: 'desc' }, 'points')).toEqual({
			column: 'points',
			direction: 'asc',
		})
	})

	it('starts a new column at the end of it the player is looking for', () => {
		expect(nextPickTableSort(DEFAULT_PICK_TABLE_SORT, 'position')).toEqual({
			column: 'position',
			direction: 'asc',
		})
		expect(nextPickTableSort(DEFAULT_PICK_TABLE_SORT, 'points')).toEqual({
			column: 'points',
			direction: 'desc',
		})
	})
})

describe('formPoints', () => {
	it('scores the last five results, and reports nothing for a season not started', () => {
		expect(formPoints(['W', 'D', 'L'])).toBe(4)
		expect(formPoints([])).toBeNull()
		expect(formPoints(undefined)).toBeNull()
	})
})

describe('pickTableHasStandings', () => {
	it('is true when any team carries a position or a played count', () => {
		expect(pickTableHasStandings(buildPickTableRows({ fixtures: FIXTURES }))).toBe(true)
	})

	it('is false for a competition with no table behind it', () => {
		const cupRows = buildPickTableRows({
			fixtures: [{ id: 'fx-cup', home: team('t-x', 'Ajax'), away: team('t-y', 'Benfica') }],
		})
		expect(pickTableHasStandings(cupRows)).toBe(false)
	})
})

describe('defaultPickView', () => {
	it('opens a league on the table and a knockout on the fixtures', () => {
		expect(defaultPickView('league', true)).toBe('table')
		expect(defaultPickView('knockout', true)).toBe('fixtures')
		expect(defaultPickView('group_knockout', true)).toBe('fixtures')
	})

	it('falls back to the fixtures whenever there is no table to show', () => {
		expect(defaultPickView('league', false)).toBe('fixtures')
		expect(defaultPickView(null, false)).toBe('fixtures')
	})
})
