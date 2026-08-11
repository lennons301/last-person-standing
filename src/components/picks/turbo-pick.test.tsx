// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { TurboPick, type TurboPickFixture } from './turbo-pick'

afterEach(cleanup)

const FIXTURES: TurboPickFixture[] = [
	{
		id: 'f1',
		home: { id: 't1', name: 'Manchester United', shortName: 'MUN', form: ['W', 'D'] },
		away: { id: 't2', name: 'Newcastle United', shortName: 'NEW', form: ['L', 'W'] },
		kickoff: '2026-08-15T14:00:00Z',
	},
	{
		id: 'f2',
		home: { id: 't3', name: 'Arsenal', shortName: 'ARS', form: ['W', 'W'] },
		away: { id: 't4', name: 'Chelsea', shortName: 'CHE', form: ['D', 'L'] },
		kickoff: '2026-08-15T16:30:00Z',
	},
]

const SUBMITTED = [
	{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' as const },
	{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' as const },
]

function renderPicker(props: Partial<React.ComponentProps<typeof TurboPick>> = {}) {
	return render(
		<TurboPick
			gameId="g1"
			roundId="r1"
			roundNumber={7}
			competitionId="c1"
			fixtures={FIXTURES}
			existingPicks={[]}
			numberOfPicks={2}
			{...props}
		/>,
	)
}

describe('TurboPick round chrome', () => {
	it('leaves the round name and deadline to the game hero', () => {
		// The hero sits directly above the picker and owns both; the picker used to
		// repeat them, so the same gameweek and the same clock appeared twice.
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('Gameweek')
		expect(container.textContent).not.toContain('⏱')
		expect(container.querySelector('h2')).toBeNull()
	})

	it('opens on its two lists', () => {
		renderPicker()
		expect(screen.getByText('Your predictions')).toBeTruthy()
		expect(screen.getByText('Remaining fixtures')).toBeTruthy()
		expect(screen.getByText('0 of 2')).toBeTruthy()
		expect(screen.getByText('2 left')).toBeTruthy()
	})
})

describe('TurboPick submission state', () => {
	it('says nothing about a submission before there is one', () => {
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('Picks locked in')
		expect(container.textContent).not.toContain('Unsaved changes')
	})

	it('reports a clean submission', () => {
		const { container } = renderPicker({ existingPicks: SUBMITTED })
		expect(container.textContent).toContain('Picks locked in')
		expect(screen.getByText('2 of 2')).toBeTruthy()
	})

	it('reports an on-screen ranking that has drifted from the submitted one', () => {
		const { container } = renderPicker({
			existingPicks: SUBMITTED,
			initialRanking: [
				{ fixtureId: 'f2', confidenceRank: 1, predictedResult: 'draw' },
				{ fixtureId: 'f1', confidenceRank: 2, predictedResult: 'home_win' },
			],
		})
		expect(container.textContent).toContain('Unsaved changes')
	})

	it('starts partially ranked when asked to, with nothing submitted', () => {
		// Turbo's API only accepts a complete ranking, so this state exists only
		// mid-flow — and only `/preview/picks` mounts straight into it.
		const { container } = renderPicker({
			initialRanking: [{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' }],
		})
		expect(screen.getByText('1 of 2')).toBeTruthy()
		expect(screen.getByText('1 left')).toBeTruthy()
		expect(container.textContent).not.toContain('Picks locked in')
	})
})

describe('TurboPick form sheets', () => {
	it('gives ranked picks the same tap-through as the remaining fixtures', () => {
		renderPicker({
			existingPicks: [{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' }],
			numberOfPicks: 1,
		})
		// f1 is ranked, f2 is still in the remaining list: all four teams tap through.
		expect(screen.getByLabelText('Open form details for Manchester United')).toBeTruthy()
		expect(screen.getByLabelText('Open form details for Newcastle United')).toBeTruthy()
		expect(screen.getByLabelText('Open form details for Arsenal')).toBeTruthy()
		expect(screen.getByLabelText('Open form details for Chelsea')).toBeTruthy()
	})
})

describe('TurboPick win probability', () => {
	const ODDS = {
		home: { probability: 8 / 13, price: 1.5 },
		away: { probability: 2 / 13, price: 6 },
		asOf: '2026-08-14T11:30:00Z',
	}

	it('surfaces each fixture’s win probability inline in the fixtures view', () => {
		renderPicker({ fixtures: [{ ...FIXTURES[0], odds: ODDS }, FIXTURES[1]] })
		expect(screen.getByText('62%')).toBeTruthy()
		expect(screen.getByText('1.50')).toBeTruthy()
		expect(screen.getByText('15%')).toBeTruthy()
	})

	it('renders no probability for an unpriced fixture', () => {
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('%')
	})
})
