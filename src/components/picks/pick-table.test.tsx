// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPickTableRows, type PickTableFixture } from '@/lib/game/pick-table-view'
import { PickTable, type PickTableRanking } from './pick-table'

afterEach(cleanup)

const FIXTURES: PickTableFixture[] = [
	{
		id: 'fx-1',
		home: {
			id: 't-ars',
			name: 'Arsenal',
			shortName: 'ARS',
			leaguePosition: 1,
			form: ['W', 'W', 'D'],
			standing: { played: 26, points: 60, goalsFor: 58, goalsAgainst: 20 },
		},
		away: {
			id: 't-bur',
			name: 'Burnley',
			shortName: 'BUR',
			leaguePosition: 18,
			standing: { played: 26, points: 20, goalsFor: 22, goalsAgainst: 48 },
		},
		odds: {
			home: { probability: 0.82, price: 1.18 },
			draw: { probability: 0.11, price: 9 },
			away: { probability: 0.07, price: 13.5 },
			asOf: '2099-02-28T09:00:00.000Z',
		},
	},
	{
		id: 'fx-2',
		home: {
			id: 't-che',
			name: 'Chelsea',
			shortName: 'CHE',
			leaguePosition: 6,
			form: ['W', 'D', 'L'],
			standing: { played: 26, points: 44, goalsFor: 40, goalsAgainst: 30 },
		},
		away: {
			id: 't-eve',
			name: 'Everton',
			shortName: 'EVE',
			leaguePosition: 12,
			form: ['D', 'L', 'W'],
			standing: { played: 25, points: 31, goalsFor: 28, goalsAgainst: 33 },
		},
	},
]

function rowsFor(overrides: Omit<Parameters<typeof buildPickTableRows>[0], 'fixtures'> = {}) {
	return buildPickTableRows({ fixtures: FIXTURES, ...overrides })
}

/** Team names in render order, read off the rendered table body. */
function renderedTeams(): string[] {
	const [, ...bodyRows] = screen.getAllByRole('row')
	return bodyRows.map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
}

describe('PickTable', () => {
	it('renders one row per team with its standings line, form, opponent side and price', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(screen.getAllByRole('row')).toHaveLength(5) // header + four teams

		const arsenalRow = screen.getByText('Arsenal').closest('tr')
		expect(arsenalRow).toBeTruthy()
		const cells = within(arsenalRow as HTMLElement).getAllByRole('cell')
		expect(cells[1].textContent).toBe('1') // position
		expect(cells[2].textContent).toBe('26') // played
		expect(cells[3].textContent).toBe('60') // points
		expect(cells[4].textContent).toBe('58/20') // goals for / against
		expect(cells[6].textContent).toContain('BUR') // next opponent
		expect(cells[6].textContent).toContain('(H)')
		expect(cells[7].textContent).toContain('82%')
		expect(cells[7].textContent).toContain('1.18')
	})

	it('says so rather than showing 0% for a fixture with no odds', () => {
		render(<PickTable rows={rowsFor()} />)
		const chelseaRow = screen.getByText('Chelsea').closest('tr') as HTMLElement
		expect(within(chelseaRow).getAllByRole('cell')[7].textContent).toBe('No odds')
	})

	it('opens safest-first and re-sorts when a column header is tapped', () => {
		render(<PickTable rows={rowsFor()} />)
		// Default: win-probability descending, with the unpriced fixture below.
		expect(renderedTeams()[0]).toContain('Arsenal')

		fireEvent.click(screen.getByRole('button', { name: 'Sort by Points' }))
		const byPoints = renderedTeams()
		for (const [i, name] of ['Arsenal', 'Chelsea', 'Everton', 'Burnley'].entries()) {
			expect(byPoints[i]).toContain(name)
		}

		// Tapping the sorted column again flips it.
		fireEvent.click(screen.getByRole('button', { name: 'Sort by Points' }))
		expect(renderedTeams()[0]).toContain('Burnley')
	})

	it('announces the sorted column to assistive tech', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(screen.getByRole('columnheader', { name: /Win/ })).toHaveProperty(
			'ariaSort',
			'descending',
		)
		fireEvent.click(screen.getByRole('button', { name: 'Sort by League position' }))
		expect(screen.getByRole('columnheader', { name: /#/ })).toHaveProperty('ariaSort', 'ascending')
	})

	it('marks a used team with its round and refuses to offer it', () => {
		render(<PickTable rows={rowsFor({ usedTeamsByRound: { 't-ars': 'GW3' } })} />)
		expect(screen.getByText('Used GW3')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /Pick Arsenal/ })).toBeNull()
	})

	it('marks a restricted team with its reason', () => {
		render(<PickTable rows={rowsFor({ restrictedTeams: { 't-eve': 'Already through' } })} />)
		expect(screen.getByText('Already through')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /Pick Everton/ })).toBeNull()
	})

	it('commits a pick from the row in one tap', () => {
		const onPick = vi.fn()
		render(<PickTable rows={rowsFor()} onPick={onPick} />)

		fireEvent.click(screen.getByRole('button', { name: 'Pick Chelsea vs Everton (home)' }))
		expect(onPick).toHaveBeenCalledTimes(1)
		expect(onPick.mock.calls[0][0]).toMatchObject({ fixtureId: 'fx-2', side: 'home' })
		expect(onPick.mock.calls[0][0].team.id).toBe('t-che')
	})

	it('marks the round’s current pick and does not re-offer it', () => {
		render(<PickTable rows={rowsFor()} currentTeamId="t-ars" onPick={vi.fn()} />)
		expect(screen.getByText('Current')).toBeTruthy()
		expect(screen.getByRole('button', { name: /Pick Arsenal/ })).toHaveProperty('disabled', true)
	})

	it('offers nothing to tap once the round is read-only', () => {
		render(<PickTable rows={rowsFor()} onPick={vi.fn()} readonly />)
		expect(screen.queryByRole('button', { name: /^Pick / })).toBeNull()
	})

	it('says the season has not started rather than leaving the form column blank', () => {
		render(<PickTable rows={rowsFor()} />)
		// Burnley alone has no form in these fixtures.
		expect(screen.getAllByText('No form yet')).toHaveLength(1)
	})
})

describe('PickTable — ranking mode (turbo)', () => {
	function ranking(overrides: Partial<PickTableRanking> = {}): PickTableRanking {
		return {
			count: 0,
			target: 3,
			onAdd: vi.fn(),
			onMove: vi.fn(),
			onRemove: vi.fn(),
			...overrides,
		}
	}

	it('offers the same board and the same sorting, with rank in place of pick', () => {
		render(<PickTable rows={rowsFor()} ranking={ranking()} />)
		expect(screen.getAllByRole('row')).toHaveLength(5) // header + four teams
		// Every column still sorts, and the board still opens safest-first.
		expect(renderedTeams()[0]).toContain('Arsenal')
		fireEvent.click(screen.getByRole('button', { name: 'Sort by League position' }))
		expect(renderedTeams()[0]).toContain('Arsenal')
		expect(screen.queryByRole('button', { name: /^Pick / })).toBeNull()
	})

	it('adds a team to the confidence set at the next rank, one tap', () => {
		const onAdd = vi.fn()
		render(<PickTable rows={rowsFor()} ranking={ranking({ count: 2, onAdd })} />)

		fireEvent.click(
			screen.getByRole('button', { name: 'Rank Chelsea to beat Everton at number 3' }),
		)
		expect(onAdd).toHaveBeenCalledTimes(1)
		expect(onAdd.mock.calls[0][0]).toMatchObject({ fixtureId: 'fx-2', side: 'home' })
		expect(onAdd.mock.calls[0][0].team.id).toBe('t-che')
	})

	it('carries the rank a team already holds, and orders it from the row', () => {
		const onMove = vi.fn()
		const rows = rowsFor({ rankedFixtures: { 'fx-1': { rank: 2, teamId: 't-ars' } } })
		render(<PickTable rows={rows} ranking={ranking({ count: 3, onMove })} />)

		expect(screen.getByText('Ranked #2')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Rank Arsenal/ })).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'Move Arsenal up to number 1' }))
		fireEvent.click(screen.getByRole('button', { name: 'Move Arsenal down to number 3' }))
		expect(onMove.mock.calls.map((c) => c[1])).toEqual(['up', 'down'])
		expect(onMove.mock.calls[0][0].team.id).toBe('t-ars')
	})

	it('stands the move controls down at the ends of the ranking', () => {
		const rows = rowsFor({ rankedFixtures: { 'fx-1': { rank: 1, teamId: 't-ars' } } })
		render(<PickTable rows={rows} ranking={ranking({ count: 1 })} />)
		expect(screen.getByRole('button', { name: /Move Arsenal up/ })).toHaveProperty('disabled', true)
		expect(screen.getByRole('button', { name: /Move Arsenal down/ })).toHaveProperty(
			'disabled',
			true,
		)
	})

	it('drops a ranked team back out of the set', () => {
		const onRemove = vi.fn()
		const rows = rowsFor({ rankedFixtures: { 'fx-1': { rank: 1, teamId: 't-ars' } } })
		render(<PickTable rows={rows} ranking={ranking({ count: 1, onRemove })} />)

		fireEvent.click(screen.getByRole('button', { name: 'Remove Arsenal from your predictions' }))
		expect(onRemove).toHaveBeenCalledTimes(1)
		expect(onRemove.mock.calls[0][0].team.id).toBe('t-ars')
	})

	it('marks the other side of a ranked fixture with the call, and offers it nothing', () => {
		const rows = rowsFor({ rankedFixtures: { 'fx-1': { rank: 1, teamId: 't-ars' } } })
		render(<PickTable rows={rows} ranking={ranking({ count: 1 })} />)
		expect(screen.getByText('#1: ARS')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Rank Burnley/ })).toBeNull()
	})

	it('offers nothing to tap once the round is read-only', () => {
		const rows = rowsFor({ rankedFixtures: { 'fx-1': { rank: 1, teamId: 't-ars' } } })
		render(<PickTable rows={rows} ranking={ranking({ count: 1 })} readonly />)
		expect(screen.queryByRole('button', { name: /^Rank / })).toBeNull()
		expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
		expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
	})
})
