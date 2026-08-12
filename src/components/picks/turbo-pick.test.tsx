// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
	// The form sheet reads the current path to build the form guide's back link.
	usePathname: () => '/game/g1',
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
		draw: { probability: 3 / 13, price: 4 },
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

/**
 * The Table view as turbo's ranking surface: the same board classic reads, with
 * a tap that adds to the confidence set instead of committing a single pick.
 */
describe('TurboPick Table view', () => {
	const withTable = (f: TurboPickFixture, homePos: number, awayPos: number): TurboPickFixture => ({
		...f,
		home: { ...f.home, leaguePosition: homePos, standing: { played: 26, points: 50 } },
		away: { ...f.away, leaguePosition: awayPos, standing: { played: 26, points: 38 } },
	})

	const TABLE_FIXTURES: TurboPickFixture[] = [
		withTable(FIXTURES[0], 4, 9),
		withTable(FIXTURES[1], 1, 6),
		withTable(
			{
				id: 'f3',
				home: { id: 't5', name: 'Brighton', shortName: 'BHA' },
				away: { id: 't6', name: 'Everton', shortName: 'EVE' },
				kickoff: '2026-08-16T13:00:00Z',
			},
			7,
			12,
		),
	]

	function renderTable(props: Partial<React.ComponentProps<typeof TurboPick>> = {}) {
		return renderPicker({
			fixtures: TABLE_FIXTURES,
			numberOfPicks: 3,
			competitionType: 'league',
			...props,
		})
	}

	/** The confidence list's rows, top to bottom, as the ranking list renders them. */
	function rankedRows(): string[] {
		return screen
			.getAllByLabelText('Drag to reorder')
			.map((handle) => handle.parentElement?.textContent ?? '')
	}

	it('offers no Table view for a round with no standings behind it', () => {
		renderPicker()
		expect(screen.queryByRole('button', { name: 'table' })).toBeNull()
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('opens a league round on the board and a knockout on the fixtures', () => {
		renderTable()
		expect(screen.getByRole('table')).toBeTruthy()
		cleanup()

		renderTable({ competitionType: 'knockout' })
		expect(screen.queryByRole('table')).toBeNull()
		// The toggle is still offered — the standings are there either way.
		expect(screen.getByRole('button', { name: 'table' })).toBeTruthy()
	})

	it('ranks a team from the board, into the same list the fixtures view builds', () => {
		renderTable()
		fireEvent.click(
			screen.getByRole('button', { name: 'Rank Arsenal to beat Chelsea at number 1' }),
		)
		expect(screen.getByText('1 of 3')).toBeTruthy()
		expect(rankedRows()[0]).toContain('Arsenal')
		// And the board now marks the fixture rather than re-offering it.
		expect(screen.getByText('Ranked #1')).toBeTruthy()
		expect(screen.getByText('#1: ARS')).toBeTruthy()
	})

	it('shows a ranking made in the fixtures view on the board, unchanged', () => {
		renderTable({
			initialRanking: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
				// A draw belongs to the fixture, not to a team: the board can't offer
				// it, but it says which call has been made on both of its rows.
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' },
			],
		})
		expect(screen.getByText('Ranked #1')).toBeTruthy()
		expect(screen.getByText('#1: MUN')).toBeTruthy()
		expect(screen.getAllByText('#2: Draw')).toHaveLength(2)
	})

	it('reorders the confidence set from the board, and the list follows', () => {
		renderTable({
			initialRanking: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win' },
			],
		})
		expect(rankedRows()[0]).toContain('Manchester United')

		fireEvent.click(screen.getByRole('button', { name: 'Move Arsenal up to number 1' }))
		expect(rankedRows()[0]).toContain('Arsenal')
		// Both calls re-numbered on the board too, not just in the list — each
		// marked on the row of the team it is called against.
		expect(screen.getByText('#1: ARS')).toBeTruthy() // on Chelsea's row
		expect(screen.getByText('#2: MUN')).toBeTruthy() // on Newcastle's
	})

	it('drops a ranked team from the board', () => {
		renderTable({
			initialRanking: [{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' }],
		})
		fireEvent.click(
			screen.getByRole('button', { name: 'Remove Manchester United from your predictions' }),
		)
		expect(screen.getByText('0 of 3')).toBeTruthy()
		expect(
			screen.getByRole('button', {
				name: 'Rank Manchester United to beat Newcastle United at number 1',
			}),
		).toBeTruthy()
	})

	it('keeps the board on the same columns and sorting classic reads', () => {
		renderTable()
		for (const column of [
			'League position',
			'Played',
			'Points',
			'Recent form',
			'Win probability',
		]) {
			expect(screen.getByRole('button', { name: `Sort by ${column}` })).toBeTruthy()
		}
		// One row per team in the round, ranked or not, plus the header.
		expect(screen.getAllByRole('row')).toHaveLength(7)
	})
})
