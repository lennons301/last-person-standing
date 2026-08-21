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
