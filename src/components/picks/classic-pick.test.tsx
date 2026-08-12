// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ refresh: vi.fn() }),
}))

import { ClassicPick, type ClassicPickFixture } from './classic-pick'

afterEach(cleanup)

const FIXTURES: ClassicPickFixture[] = [
	{
		id: 'fx-1',
		home: { id: 't-mun', name: 'Manchester United', shortName: 'MUN', leaguePosition: 4 },
		away: { id: 't-new', name: 'Newcastle United', shortName: 'NEW', leaguePosition: 9 },
		kickoff: '2099-01-02T15:00:00.000Z',
	},
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof ClassicPick>> = {}) {
	return render(
		<ClassicPick
			gameId="g1"
			roundId="r27"
			roundName="Gameweek 27"
			roundNumber={27}
			competitionId="c1"
			deadline={new Date('2099-01-02T11:00:00.000Z')}
			fixtures={FIXTURES}
			usedTeamsByRound={{}}
			existingPickTeamId={null}
			existingPickFixtureId={null}
			{...overrides}
		/>,
	)
}

describe('ClassicPick — no duplication of the hero', () => {
	it('renders no round heading or deadline in the expanded picker', () => {
		// The hero directly above owns both: it names the round and counts the
		// deadline down. Expanded, this card's job is only "choose your team".
		const { container } = renderPicker()
		expect(screen.queryByRole('heading', { name: 'Gameweek 27' })).toBeNull()
		expect(container.textContent).not.toContain('⏱')
	})

	it('still offers the way back to the collapsed summary once a pick exists', () => {
		renderPicker({
			existingPickTeamId: 't-mun',
			existingPickFixtureId: 'fx-1',
			startExpanded: true,
		})
		expect(screen.getByRole('button', { name: /Collapse/ })).toBeTruthy()
	})

	it('keeps naming the round in the collapsed summary, which the hero may not own', () => {
		renderPicker({ existingPickTeamId: 't-mun', existingPickFixtureId: 'fx-1' })
		expect(screen.getByText(/Gameweek 27 · picks locked/)).toBeTruthy()
	})
})

describe('ClassicPick win probability', () => {
	const ODDS = {
		home: { probability: 8 / 13, price: 1.5 },
		draw: { probability: 3 / 13, price: 4 },
		away: { probability: 2 / 13, price: 6 },
		asOf: '2026-08-14T11:30:00Z',
	}

	it('surfaces each fixture’s win probability inline in the fixtures view', () => {
		renderPicker({ fixtures: [{ ...FIXTURES[0], odds: ODDS }] })
		expect(screen.getByText('62%')).toBeTruthy()
		expect(screen.getByText('1.50')).toBeTruthy()
		expect(screen.getByText('15%')).toBeTruthy()
	})

	it('renders no probability for an unpriced fixture', () => {
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('%')
	})
})
