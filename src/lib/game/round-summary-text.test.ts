import { describe, expect, it } from 'vitest'
import { formatRoundSummaryText } from '@/lib/game/round-summary-text'
import {
	type BuildRoundSummaryInput,
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryPlayerRow,
} from '@/lib/game/round-summary-view'

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

function summary(overrides: Partial<BuildRoundSummaryInput> = {}) {
	return buildRoundSummary({
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
	})
}

describe('formatRoundSummaryText', () => {
	it('writes the crowd, the market and the no-picker as prose', () => {
		expect(formatRoundSummaryText(summary())).toBe(
			[
				'*Gameweek 12 — 3 of 5 on Arsenal*',
				'',
				'4 of 5 still standing got a pick in, spread across 2 teams. The average pick was a 58% shot, and the market expects 2.3 of them to survive. Sam made no pick at all.',
				'',
				"Nobody backed an underdog — every pick was its match's favourite, from Arsenal at 60% down to Chelsea at 50%. Out on their own: Dev on Chelsea (50%).",
				'',
				"Nobody was on the other side of anybody else's pick. The shortest price nobody touched was Manchester City at 50%.",
			].join('\n'),
		)
	})

	it('writes the gamblers, the lone picks and the clashes, marking auto-picks', () => {
		const text = formatRoundSummaryText(
			summary({
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-ars'),
					player('Cass', 't-ars'),
					player('Dev', 't-bre'),
					player('Eve', 't-mci', { isAuto: true }),
					player('Fay', 't-liv'),
				],
			}),
		)

		expect(text).toBe(
			[
				'*Gameweek 12 — 3 of 6 on Arsenal*',
				'',
				'All 6 still standing got a pick in, spread across 4 teams. The average pick was a 45% shot, and the market expects 2.7 of them to survive.',
				'',
				'Boldest calls: Dev on Brentford (16%) away at Arsenal; Fay on Liverpool (25%) away at Manchester City. Out on their own: Eve (auto) on Manchester City (50%), Fay on Liverpool (25%), Dev on Brentford (16%).',
				'',
				'Arsenal v Brentford puts Alex, Bea and Cass up against Dev — one side goes out, and a draw takes everyone in it. Manchester City v Liverpool puts Eve (auto) up against Fay — one side goes out, and a draw takes everyone in it. The shortest price nobody touched was Chelsea at 50%.',
			].join('\n'),
		)
	})

	it('degrades to count-based sentences on a competition with no prices', () => {
		const text = formatRoundSummaryText(
			summary({
				fixtures: FIXTURES.map((f) => ({ ...f, odds: null })),
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-ars'),
					player('Cass', 't-bre'),
					player('Dev', 't-liv'),
				],
			}),
		)

		expect(text).toBe(
			[
				'*Gameweek 12 — 2 of 4 on Arsenal*',
				'',
				'All 4 still standing got a pick in, spread across 3 teams.',
				'',
				'Out on their own: Cass on Brentford, Dev on Liverpool.',
				'',
				'Arsenal v Brentford puts Alex and Bea up against Cass — one side goes out, and a draw takes everyone in it.',
			].join('\n'),
		)
		expect(text).not.toContain('%')
	})

	it('is byte-identical for identical input', () => {
		expect(formatRoundSummaryText(summary())).toBe(formatRoundSummaryText(summary()))
	})

	it('never infers a pronoun from a player name', () => {
		const text = formatRoundSummaryText(
			summary({
				players: [
					player('Alex', 't-ars'),
					player('Bea', 't-bre'),
					player('Cass', 't-liv', { isAuto: true }),
					player('Dev', null),
				],
			}),
		)

		expect(text).not.toMatch(/\b(he|him|his|she|her|hers)\b/i)
	})
})
