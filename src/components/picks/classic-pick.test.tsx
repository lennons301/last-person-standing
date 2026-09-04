// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ refresh: vi.fn() }),
	// The form sheet reads the current path to build the form guide's back link.
	usePathname: () => '/game/g1',
}))

import type { PickFixture } from '@/lib/game/pick-view-types'
import { ClassicPick } from './classic-pick'

afterEach(cleanup)

const FIXTURES: PickFixture[] = [
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

describe('ClassicPick — Fixtures ⇄ Table', () => {
	const TABLE_FIXTURES: PickFixture[] = [
		{
			...FIXTURES[0],
			home: { ...FIXTURES[0].home, standing: { played: 26, points: 55 } },
			away: { ...FIXTURES[0].away, standing: { played: 26, points: 40 } },
		},
	]

	it('offers both views, and each can make the pick', () => {
		const onSubmitPick = vi.fn().mockResolvedValue(undefined)
		renderPicker({ fixtures: TABLE_FIXTURES, onSubmitPick })

		// Fixtures first: select a side, then confirm.
		fireEvent.click(screen.getByText('Manchester United'))
		fireEvent.click(screen.getByRole('button', { name: /Lock in pick/ }))
		expect(onSubmitPick).toHaveBeenCalledWith({ fixtureId: 'fx-1', teamId: 't-mun' })
	})

	it('selects from a table row and commits on the same confirm bar', () => {
		const onSubmitPick = vi.fn().mockResolvedValue(undefined)
		renderPicker({ fixtures: TABLE_FIXTURES, competitionType: 'league', onSubmitPick })

		fireEvent.click(screen.getByRole('button', { name: /^Select Newcastle United/ }))
		// One tap selects and nothing more — the board and the fixtures view share
		// the same select-then-confirm contract.
		expect(onSubmitPick).not.toHaveBeenCalled()

		fireEvent.click(screen.getByRole('button', { name: /Lock in pick/ }))
		expect(onSubmitPick).toHaveBeenCalledWith({ fixtureId: 'fx-1', teamId: 't-new' })
	})

	it('opens a league on the Table and a knockout on the Fixtures', () => {
		const { unmount } = renderPicker({ fixtures: TABLE_FIXTURES, competitionType: 'league' })
		expect(screen.getByRole('table')).toBeTruthy()
		unmount()

		renderPicker({ fixtures: TABLE_FIXTURES, competitionType: 'knockout' })
		expect(screen.queryByRole('table')).toBeNull()
		// The toggle is still there — the knockout just doesn't open on it.
		expect(screen.getByRole('button', { name: 'table' })).toBeTruthy()
	})

	it('switches views on the toggle', () => {
		renderPicker({ fixtures: TABLE_FIXTURES, competitionType: 'knockout' })
		fireEvent.click(screen.getByRole('button', { name: 'table' }))
		expect(screen.getByRole('table')).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'fixtures' }))
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('hides the Table view entirely where there are no standings', () => {
		// A competition with no league table behind it: the board would be all
		// dashes, which is worse than not offering it.
		renderPicker({
			competitionType: 'league',
			fixtures: [
				{
					id: 'fx-cup',
					home: { id: 't-a', name: 'Ajax', shortName: 'AJA' },
					away: { id: 't-b', name: 'Benfica', shortName: 'BEN' },
					kickoff: null,
				},
			],
		})
		expect(screen.queryByRole('button', { name: 'table' })).toBeNull()
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('marks a used team in the table with the round it was used in', () => {
		renderPicker({
			fixtures: TABLE_FIXTURES,
			competitionType: 'league',
			usedTeamsByRound: { 't-mun': { label: 'GW12', longLabel: 'Gameweek 12' } },
		})
		expect(screen.getByText('Used GW12')).toBeTruthy()
		expect(screen.getByText('Used Gameweek 12')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Select Manchester United/ })).toBeNull()
	})
})
