import { describe, expect, it } from 'vitest'
import {
	SPLIT_FORM_LIMIT,
	summariseTeamForm,
	type TeamFormMatchRow,
	type TeamFormOpponent,
} from './team-form-detail'

const TEAM = 'mun'

const OPPONENTS = new Map<string, TeamFormOpponent>([
	['new', { name: 'Newcastle United', shortName: 'NEW', badgeUrl: 'new.png' }],
	['bha', { name: 'Brighton & Hove Albion', shortName: 'BHA', badgeUrl: null }],
])

/** A finished match, from the team's point of view. */
function match(
	roundNumber: number,
	venue: 'home' | 'away',
	goalsFor: number | null,
	goalsAgainst: number | null,
	opponentId = 'new',
): TeamFormMatchRow {
	return venue === 'home'
		? {
				roundNumber,
				homeTeamId: TEAM,
				awayTeamId: opponentId,
				homeScore: goalsFor,
				awayScore: goalsAgainst,
			}
		: {
				roundNumber,
				homeTeamId: opponentId,
				awayTeamId: TEAM,
				homeScore: goalsAgainst,
				awayScore: goalsFor,
			}
}

function summarise(matches: TeamFormMatchRow[], lastN?: number) {
	return summariseTeamForm({
		teamId: TEAM,
		matches,
		opponents: OPPONENTS,
		competitionType: 'league',
		lastN,
	})
}

describe('summariseTeamForm — home/away split', () => {
	it('keeps home and away records apart, and sums them into overall', () => {
		const { splits } = summarise([
			match(4, 'home', 3, 1),
			match(3, 'away', 0, 2),
			match(2, 'home', 1, 1),
			match(1, 'away', 2, 0),
		])

		expect(splits.home).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0 })
		expect(splits.away).toMatchObject({ played: 2, wins: 1, draws: 0, losses: 1 })
		expect(splits.overall).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1 })
	})

	it('gives each venue its own recent-form string, most recent first', () => {
		// Unbeaten at home, winless away — the read a combined "W D L W" hides.
		const { splits } = summarise([
			match(4, 'home', 2, 0),
			match(3, 'away', 0, 1),
			match(2, 'home', 1, 1),
			match(1, 'away', 1, 3),
		])

		expect(splits.home.form).toEqual(['W', 'D'])
		expect(splits.away.form).toEqual(['L', 'L'])
		expect(splits.overall.form).toEqual(['W', 'L', 'D', 'L'])
	})

	it('caps each split’s form string without capping the record it summarises', () => {
		const matches = Array.from({ length: 9 }, (_, i) => match(9 - i, 'home', 2, 0))

		const { splits } = summarise(matches)

		expect(splits.home.form).toHaveLength(SPLIT_FORM_LIMIT)
		expect(splits.home.played).toBe(9)
		expect(splits.home.wins).toBe(9)
	})

	it('reports an unplayed season as zeroes at every venue, not as missing data', () => {
		const { splits, recent } = summarise([])

		for (const split of [splits.overall, splits.home, splits.away]) {
			expect(split).toEqual({
				played: 0,
				wins: 0,
				draws: 0,
				losses: 0,
				goalsFor: 0,
				goalsAgainst: 0,
				form: [],
			})
		}
		expect(recent).toEqual([])
	})

	it('counts a team’s away leg from its own side of the scoreline', () => {
		// The row says 1–3 to the home side; away from the team's view that's a 3–1 win.
		const { splits } = summarise([match(1, 'away', 3, 1)])

		expect(splits.away).toMatchObject({ wins: 1, goalsFor: 3, goalsAgainst: 1, form: ['W'] })
		expect(splits.home.played).toBe(0)
	})
})

describe('summariseTeamForm — goals for and against', () => {
	it('aggregates goals per venue and overall', () => {
		const { splits } = summarise([
			match(4, 'home', 3, 1),
			match(3, 'home', 2, 2),
			match(2, 'away', 0, 1),
			match(1, 'away', 1, 4),
		])

		expect(splits.home).toMatchObject({ goalsFor: 5, goalsAgainst: 3 })
		expect(splits.away).toMatchObject({ goalsFor: 1, goalsAgainst: 5 })
		expect(splits.overall).toMatchObject({ goalsFor: 6, goalsAgainst: 8 })
	})

	it('ignores a finished match with no score rather than counting it as 0–0', () => {
		const { splits, recent } = summarise([match(2, 'home', 2, 0), match(1, 'away', null, null)])

		expect(splits.overall).toMatchObject({ played: 1, wins: 1, draws: 0, goalsFor: 2 })
		expect(splits.away.played).toBe(0)
		expect(recent).toHaveLength(1)
	})
})

describe('summariseTeamForm — recent matches', () => {
	it('keeps the last N matches in the order given, with the opponent and venue', () => {
		const { recent } = summarise(
			[match(3, 'home', 3, 1, 'new'), match(2, 'away', 1, 1, 'bha'), match(1, 'home', 0, 2, 'new')],
			2,
		)

		expect(recent).toHaveLength(2)
		expect(recent[0]).toMatchObject({
			roundNumber: 3,
			roundLabel: 'GW3',
			opponentShortName: 'NEW',
			opponentName: 'Newcastle United',
			opponentBadgeUrl: 'new.png',
			home: true,
			goalsFor: 3,
			goalsAgainst: 1,
			result: 'W',
		})
		expect(recent[1]).toMatchObject({ opponentShortName: 'BHA', home: false, result: 'D' })
	})

	it('falls back to an unknown opponent rather than dropping the match', () => {
		const { recent, splits } = summarise([match(1, 'home', 1, 0, 'ghost')])

		expect(recent[0]).toMatchObject({ opponentShortName: '???', opponentName: 'Unknown' })
		expect(splits.overall.played).toBe(1)
	})
})
