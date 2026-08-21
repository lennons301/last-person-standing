import { describe, expect, it } from 'vitest'
import {
	type BuildRoundSummaryInput,
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryPlayerRow,
} from '@/lib/game/round-summary-view'

/**
 * A three-fixture priced round. Probabilities are the de-vigged 1X2 the sync
 * persists, so each fixture's three outcomes sum to 1 — the tests read expected
 * figures off these literals by hand, never by re-running the builder's own sums.
 */
const FIXTURES: RoundSummaryFixtureRow[] = [
	{
		id: 'fx-1',
		home: { id: 't-ars', shortName: 'ARS', name: 'Arsenal' },
		away: { id: 't-bre', shortName: 'BRE', name: 'Brentford' },
		odds: {
			home: { probability: 0.6, price: 1.6 },
			draw: { probability: 0.24, price: 4.1 },
			away: { probability: 0.16, price: 6.2 },
		},
	},
	{
		id: 'fx-2',
		home: { id: 't-mci', shortName: 'MCI', name: 'Manchester City' },
		away: { id: 't-liv', shortName: 'LIV', name: 'Liverpool' },
		odds: {
			home: { probability: 0.5, price: 2 },
			draw: { probability: 0.25, price: 4 },
			away: { probability: 0.25, price: 4 },
		},
	},
	{
		id: 'fx-3',
		home: { id: 't-eve', shortName: 'EVE', name: 'Everton' },
		away: { id: 't-che', shortName: 'CHE', name: 'Chelsea' },
		odds: {
			home: { probability: 0.2, price: 5 },
			draw: { probability: 0.3, price: 3.3 },
			away: { probability: 0.5, price: 2 },
		},
	},
]

function player(
	name: string,
	teamId: string | null,
	opts: { isAuto?: boolean } = {},
): RoundSummaryPlayerRow {
	return {
		id: `gp-${name.toLowerCase()}`,
		name,
		pick: teamId ? { teamId, isAuto: opts.isAuto ?? false } : null,
	}
}

function input(overrides: Partial<BuildRoundSummaryInput> = {}): BuildRoundSummaryInput {
	return {
		round: { label: 'GW12', longLabel: 'Gameweek 12' },
		isStartingRound: false,
		fixtures: FIXTURES,
		players: [
			player('Alex', 't-ars'),
			player('Bea', 't-ars'),
			player('Cass', 't-ars'),
			player('Dev', 't-che'),
			player('Sam', null),
		],
		...overrides,
	}
}

describe('buildRoundSummary — the field', () => {
	it('counts picks per team, descending, denominated by players alive going in', () => {
		const view = buildRoundSummary(input())

		expect(view.playersAlive).toBe(5)
		expect(view.picksMade).toBe(4)
		expect(view.mostBacked.map((t) => [t.shortName, t.count])).toEqual([
			['ARS', 3],
			['CHE', 1],
		])
		expect(view.mostBacked[0].players.map((p) => p.name)).toEqual(['Alex', 'Bea', 'Cass'])
	})

	it('reports a player who made no pick at all on their own line', () => {
		const view = buildRoundSummary(input())

		expect(view.noPickPlayers.map((p) => p.name)).toEqual(['Sam'])
	})

	it('leads with the most-backed line, the one headline that needs no prices', () => {
		const view = buildRoundSummary(input())

		expect(view.headline).toBe('3 of 5 on ARS')
	})
})

describe("buildRoundSummary — the market's verdict", () => {
	it('reports the field, the spread, the average win chance and expected survivors', () => {
		const view = buildRoundSummary(input())

		// Three on Arsenal at 0.6 and one on Chelsea away at 0.5.
		expect(view.market).toEqual({
			picks: 4,
			distinctTeams: 2,
			averageWinProbability: 2.3 / 4,
			expectedSurvivors: 2.3,
			pricedPicks: null,
		})
	})

	it('names its denominator only when unpriced picks left it short of the field', () => {
		const view = buildRoundSummary(
			input({
				fixtures: [
					...FIXTURES,
					{
						id: 'fx-4',
						home: { id: 't-new', shortName: 'NEW', name: 'Newcastle' },
						away: { id: 't-ful', shortName: 'FUL', name: 'Fulham' },
						odds: null,
					},
				],
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-che'),
					player('Cass', 't-new'),
					player('Sam', null),
				],
			}),
		)

		expect(view.market).toEqual({
			picks: 3,
			distinctTeams: 3,
			averageWinProbability: 1.1 / 2,
			expectedSurvivors: 1.1,
			pricedPicks: 2,
		})
	})
})

describe('buildRoundSummary — boldest calls', () => {
	it('lists only picks the market does not favour in their own fixture, longest price first', () => {
		const view = buildRoundSummary(
			input({
				players: [
					player('Alex', 't-ars'), // favourite at 0.60
					player('Bea', 't-bre'), // away underdog at 0.16
					player('Cass', 't-liv'), // away underdog at 0.25
					player('Dev', 't-eve'), // home underdog at 0.20
				],
			}),
		)

		expect(view.boldest?.kind).toBe('calls')
		if (view.boldest?.kind !== 'calls') throw new Error('expected calls')
		expect(view.boldest.calls.map((c) => [c.player.name, c.shortName, c.winProbability])).toEqual([
			['Bea', 'BRE', 0.16],
			['Dev', 'EVE', 0.2],
			['Cass', 'LIV', 0.25],
		])
		expect(view.boldest.calls[0].opponentShortName).toBe('ARS')
	})

	it('excludes auto-picks — the system chose the underdog, not the player', () => {
		const view = buildRoundSummary(
			input({
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-bre', { isAuto: true }),
					player('Cass', 't-liv'),
				],
			}),
		)

		if (view.boldest?.kind !== 'calls') throw new Error('expected calls')
		expect(view.boldest.calls.map((c) => c.player.name)).toEqual(['Cass'])
	})

	it('says so when nobody backed an underdog, naming the prices in play', () => {
		const view = buildRoundSummary(input())

		// Canonical field: Arsenal (favourite, 1.6) and Chelsea away (favourite, 2.0).
		expect(view.boldest).toEqual({
			kind: 'none',
			shortest: expect.objectContaining({ shortName: 'ARS', price: 1.6 }),
			longest: expect.objectContaining({ shortName: 'CHE', price: 2 }),
		})
	})

	it('has no prices to quote when every pick in the round was made for a player', () => {
		const view = buildRoundSummary(
			input({
				players: [player('Alex', 't-bre', { isAuto: true })],
			}),
		)

		expect(view.boldest).toEqual({ kind: 'none', shortest: null, longest: null })
	})
})
