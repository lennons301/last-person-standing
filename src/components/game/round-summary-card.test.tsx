// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
	type BuildRoundSummaryInput,
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryPlayerRow,
} from '@/lib/game/round-summary-view'
import { RoundSummaryCard } from './round-summary-card'

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
			player('Cass', 't-bre'),
			player('Dev', 't-liv', { isAuto: true }),
			player('Sam', null),
		],
		...overrides,
	})
}

function expand() {
	fireEvent.click(screen.getByRole('button', { expanded: false }))
}

describe('RoundSummaryCard', () => {
	it('is collapsed on load, with the most-backed line in its trigger', () => {
		render(<RoundSummaryCard summary={summary()} />)

		expect(screen.getByText('2 of 5 on ARS')).toBeTruthy()
		expect(screen.queryByText('Most backed')).toBeNull()
	})

	it('expands in place to the six tiles, in order', () => {
		render(<RoundSummaryCard summary={summary()} />)
		expand()

		expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
			"The market's verdict",
			'Most backed',
			'Boldest calls',
			'Out on their own',
			'Head to head',
			'Left on the table',
		])
	})

	it('shows the decimal price and the win chance together', () => {
		render(<RoundSummaryCard summary={summary()} />)
		expand()

		expect(screen.getAllByText('ARS 1.6 (60%)').length).toBeGreaterThan(0)
	})

	it('marks a pick made for a player wherever it names them', () => {
		render(<RoundSummaryCard summary={summary()} />)
		expand()

		expect(screen.getAllByText(/Dev \(auto\)/).length).toBeGreaterThan(0)
	})

	it('reports the player the deadline caught with nothing in', () => {
		render(<RoundSummaryCard summary={summary()} />)
		expand()

		expect(screen.getByText(/Sam/)).toBeTruthy()
	})

	it('drops the three market tiles on an unpriced competition and says why', () => {
		render(
			<RoundSummaryCard
				summary={summary({ fixtures: FIXTURES.map((f) => ({ ...f, odds: null })) })}
			/>,
		)
		expand()

		expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
			'Most backed',
			'Out on their own',
			'Head to head',
		])
		expect(screen.getByText(/no bookmaker prices/i)).toBeTruthy()
	})

	it('opens on load only when the gallery asks it to', () => {
		render(<RoundSummaryCard summary={summary()} defaultOpen />)

		expect(screen.getByText('Most backed')).toBeTruthy()
	})
})
