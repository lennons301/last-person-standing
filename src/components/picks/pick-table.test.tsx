// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPickTableRows, type PickTableFixture } from '@/lib/game/pick-table-view'
import type { FormSheetRenderer } from './fixture-row'
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
			form: ['W', 'W', 'D', 'L', 'W', 'D'],
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

/** The data rows, without the header block's own rows. */
function bodyRows(): HTMLElement[] {
	const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
	return within(body).getAllByRole('row')
}

/** Team names in render order, read off the rendered table body. */
function renderedTeams(): string[] {
	return bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
}

function cellsOf(teamName: string): HTMLElement[] {
	const row = screen.getByText(teamName).closest('tr') as HTMLElement
	return within(row).getAllByRole('cell')
}

describe('PickTable', () => {
	it('renders five columns: team, position, form, next opponent and win chance', () => {
		render(<PickTable rows={rowsFor()} />)
		const headers = screen.getAllByRole('columnheader')
		expect(headers.map((h) => h.textContent)).toEqual(['Team', '#', 'Form', 'Next', 'Win'])

		const cells = cellsOf('Arsenal')
		expect(cells).toHaveLength(5)
		expect(cells[1].textContent).toBe('1') // league position
		expect(cells[3].textContent).toContain('BUR') // next opponent
		expect(cells[3].textContent).toContain('(H)')
		// The price never drops: it's what makes the percentage traceable.
		expect(cells[4].textContent).toContain('82%')
		expect(cells[4].textContent).toContain('1.18')
	})

	it('shows no played, points or goals column', () => {
		render(<PickTable rows={rowsFor()} />)
		for (const label of ['Played', 'Points', 'Goals for and against']) {
			expect(screen.queryByRole('button', { name: `Sort by ${label}` })).toBeNull()
		}
		// Goals stay reachable through the form sheet's home/away split, not here.
		expect(cellsOf('Arsenal').some((c) => c.textContent?.includes('58/20'))).toBe(false)
	})

	it('says so rather than showing 0% for a fixture with no odds', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(cellsOf('Chelsea')[4].textContent).toBe('No odds')
	})

	it('opens on the league table and re-sorts when a sortable header is tapped', () => {
		render(<PickTable rows={rowsFor()} />)
		// Default: position ascending — the order the league is in.
		for (const [i, name] of ['Arsenal', 'Chelsea', 'Everton', 'Burnley'].entries()) {
			expect(renderedTeams()[i]).toContain(name)
		}

		fireEvent.click(screen.getByRole('button', { name: 'Sort by Win probability' }))
		expect(renderedTeams()[0]).toContain('Arsenal')
		expect(renderedTeams()[1]).toContain('Burnley')

		// Tapping the sorted column again flips it.
		fireEvent.click(screen.getByRole('button', { name: 'Sort by Win probability' }))
		expect(renderedTeams()[0]).toContain('Burnley')
	})

	it('offers no sort on the columns that carry no order', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(screen.queryByRole('button', { name: 'Sort by Recent form' })).toBeNull()
		expect(screen.queryByRole('button', { name: 'Sort by Next opponent' })).toBeNull()
		expect(screen.getByRole('columnheader', { name: 'Form' })).toHaveProperty('ariaSort', null)
	})

	it('announces the sorted column to assistive tech', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(screen.getByRole('columnheader', { name: /#/ })).toHaveProperty('ariaSort', 'ascending')
		fireEvent.click(screen.getByRole('button', { name: 'Sort by Win probability' }))
		expect(screen.getByRole('columnheader', { name: /Win/ })).toHaveProperty(
			'ariaSort',
			'descending',
		)
	})

	it('states both gestures permanently, under the header row', () => {
		render(<PickTable rows={rowsFor()} onSelect={vi.fn()} renderFormSheet={() => null} />)
		const note = screen.getByText(/Tap a row to select a team/)
		expect(note.textContent).toContain('Tap the form for team detail')
		// In the header block, so it can't be sorted away or scrolled past.
		expect(note.closest('thead')).toBeTruthy()
	})

	it('shows three form results, and taps through to the form sheet', () => {
		const renderFormSheet = vi.fn<FormSheetRenderer>(() => null)
		render(<PickTable rows={rowsFor()} renderFormSheet={renderFormSheet} />)

		// Arsenal carries six results; the board shows the three most recent.
		const dots = within(cellsOf('Arsenal')[2]).getAllByText(/^[WDL]$/)
		expect(dots.map((d) => d.textContent)).toEqual(['W', 'W', 'D'])

		fireEvent.click(screen.getByRole('button', { name: 'Open form details for Arsenal' }))
		expect(renderFormSheet).toHaveBeenCalled()
		const args = renderFormSheet.mock.lastCall?.[0]
		expect(args).toMatchObject({ fixtureId: 'fx-1', side: 'home', open: true })
		// The whole 1X2 comes down with the row, draw included.
		expect(args?.market).toMatchObject({ teamSide: 'home', draw: { price: 9 } })
	})

	it('taps through on a row with no form, and still says the season has not started', () => {
		const renderFormSheet = vi.fn<FormSheetRenderer>(() => null)
		render(<PickTable rows={rowsFor()} renderFormSheet={renderFormSheet} />)
		// Burnley alone has no form in these fixtures. A labelled column reads a
		// blank cell as a gap, so the wording stays — the cell is tappable anyway.
		expect(screen.getAllByText('No form yet')).toHaveLength(1)

		fireEvent.click(screen.getByRole('button', { name: 'Open form details for Burnley' }))
		expect(renderFormSheet.mock.lastCall?.[0]).toMatchObject({
			fixtureId: 'fx-1',
			side: 'away',
			open: true,
		})
	})

	it('reaches the form sheet from a board where nothing has been played', () => {
		const preSeason: PickTableFixture[] = FIXTURES.map((f) => ({
			...f,
			home: { ...f.home, form: undefined },
			away: { ...f.away, form: undefined },
		}))
		render(
			<PickTable rows={buildPickTableRows({ fixtures: preSeason })} renderFormSheet={() => null} />,
		)
		// Every row: the form-guide page behind the sheet is reachable from the
		// Table in a round where no fixture has been played.
		expect(screen.getAllByRole('button', { name: /^Open form details/ })).toHaveLength(4)
		expect(screen.getAllByText('No form yet')).toHaveLength(4)
	})

	it('declares its column widths rather than letting the used chip set them', () => {
		render(
			<PickTable
				rows={rowsFor({
					usedTeamsByRound: { 't-ars': { label: 'GW3', longLabel: 'Gameweek 3' } },
				})}
			/>,
		)
		// One declared share per column, rather than the widest content taking
		// what it likes and the team column absorbing the rest.
		const cols = Array.from(screen.getByRole('table').querySelectorAll('colgroup col'))
		expect(cols.map((c) => c.className)).toEqual([
			'w-[34%] sm:w-[40%]',
			'w-[9%] sm:w-[7%]',
			'w-[24%] sm:w-[20%]',
			'w-[17%] sm:w-[16%]',
			'w-[16%] sm:w-[17%]',
		])
		// A long name gives up its tail instead of widening the column — without
		// which the name would be the one thing able to overrule the share.
		expect(screen.getByText('Arsenal').parentElement?.className).toContain('truncate')
	})

	it('renders no form sheet for a board with no way to open one', () => {
		render(<PickTable rows={rowsFor()} />)
		expect(screen.queryByRole('button', { name: /^Open form details/ })).toBeNull()
	})

	it('selects a team from the row and never commits from a single tap', () => {
		const onSelect = vi.fn()
		render(<PickTable rows={rowsFor()} onSelect={onSelect} />)

		const select = screen.getByRole('button', { name: 'Select Chelsea vs Everton (home)' })
		fireEvent.click(select)
		expect(onSelect).toHaveBeenCalledTimes(1)
		expect(onSelect.mock.calls[0][0]).toMatchObject({ fixtureId: 'fx-2', side: 'home' })
		expect(onSelect.mock.calls[0][0].team.id).toBe('t-che')
	})

	it('selects from a tap anywhere on the row that isn’t a control of its own', () => {
		const onSelect = vi.fn()
		const renderFormSheet = vi.fn<FormSheetRenderer>(() => null)
		render(<PickTable rows={rowsFor()} onSelect={onSelect} renderFormSheet={renderFormSheet} />)

		// The next-opponent cell carries nothing to tap, so it's the row's gesture.
		fireEvent.click(cellsOf('Chelsea')[3])
		expect(onSelect).toHaveBeenCalledTimes(1)
		expect(onSelect.mock.calls[0][0].team.id).toBe('t-che')

		// The form cell is its own gesture: it opens the sheet and selects nothing.
		fireEvent.click(screen.getByRole('button', { name: 'Open form details for Chelsea' }))
		expect(renderFormSheet).toHaveBeenCalled()
		expect(onSelect).toHaveBeenCalledTimes(1)

		// And the select button itself fires once, not once for itself and once
		// for the row it sits in.
		fireEvent.click(screen.getByRole('button', { name: 'Select Chelsea vs Everton (home)' }))
		expect(onSelect).toHaveBeenCalledTimes(2)
	})

	it('positions nothing against a table row, which cannot be a containing block', () => {
		render(
			<PickTable
				rows={rowsFor()}
				onSelect={vi.fn()}
				selectedRowId="fx-2:home"
				renderFormSheet={() => null}
			/>,
		)
		const table = screen.getByRole('table')
		// CSS 2.1 leaves `position: relative` on a table row undefined and WebKit
		// ignores it, so an absolutely positioned child escapes its row and lands
		// on the page instead — which on iOS piled every row's tap target over the
		// top of the page, swallowing the Fixtures/Table toggle's taps and painting
		// the selected row's green ring across the lot (#211).
		expect(table.querySelector('[class*="absolute"]')).toBeNull()
		expect(table.querySelector('tr[class*="relative"], td[class*="relative"]')).toBeNull()
	})

	it('is keyboard-operable, with the form control a sibling rather than a child', () => {
		render(<PickTable rows={rowsFor()} onSelect={vi.fn()} renderFormSheet={() => null} />)
		const select = screen.getByRole('button', { name: 'Select Arsenal vs Burnley (home)' })
		// A real button: reachable by tab, and Enter / Space activate it for free.
		expect(select.tagName).toBe('BUTTON')
		expect(select).toHaveProperty('tabIndex', 0)

		const form = screen.getByRole('button', { name: 'Open form details for Arsenal' })
		expect(select.contains(form)).toBe(false)
		expect(form.contains(select)).toBe(false)
		expect(select.closest('tr')).toBe(form.closest('tr'))
	})

	it('marks the selected row', () => {
		const rows = rowsFor()
		render(<PickTable rows={rows} onSelect={vi.fn()} selectedRowId="fx-2:home" />)
		expect(screen.getByRole('button', { name: 'Select Chelsea vs Everton (home)' })).toHaveProperty(
			'ariaPressed',
			'true',
		)
		expect(screen.getByRole('button', { name: 'Select Everton vs Chelsea (away)' })).toHaveProperty(
			'ariaPressed',
			'false',
		)
	})

	it('marks a used team with its round — short on the chip, long for a reader', () => {
		render(
			<PickTable
				rows={rowsFor({
					usedTeamsByRound: { 't-ars': { label: 'GW3', longLabel: 'Gameweek 3' } },
				})}
				onSelect={vi.fn()}
			/>,
		)
		// The chip is short: it sits under a team name in a five-column board, and
		// the player already knows what "GW" stands for.
		expect(screen.getByText('Used GW3')).toBeTruthy()
		// A screen reader hears the round spelled out — "GW3" is not a word.
		expect(screen.getByText('Used Gameweek 3')).toBeTruthy()
		expect(screen.getByText('Arsenal')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Select Arsenal/ })).toBeNull()
	})

	it('marks a restricted team with its reason', () => {
		render(
			<PickTable
				rows={rowsFor({ restrictedTeams: { 't-eve': 'Already through' } })}
				onSelect={vi.fn()}
			/>,
		)
		expect(screen.getByText('Already through')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Select Everton/ })).toBeNull()
	})

	it('marks the round’s current pick and does not re-offer it', () => {
		render(<PickTable rows={rowsFor()} currentTeamId="t-ars" onSelect={vi.fn()} />)
		expect(screen.getByText('Current')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /^Select Arsenal/ })).toBeNull()
	})

	it('offers nothing to tap once the round is read-only', () => {
		render(<PickTable rows={rowsFor()} onSelect={vi.fn()} readonly />)
		expect(screen.queryByRole('button', { name: /^Select / })).toBeNull()
		expect(bodyRows()).toHaveLength(4)
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

	it('offers the same board and the same sorting, with rank in place of select', () => {
		render(<PickTable rows={rowsFor()} ranking={ranking()} />)
		expect(bodyRows()).toHaveLength(4)
		expect(renderedTeams()[0]).toContain('Arsenal')
		fireEvent.click(screen.getByRole('button', { name: 'Sort by Win probability' }))
		expect(renderedTeams()[0]).toContain('Arsenal')
		expect(screen.queryByRole('button', { name: /^Select / })).toBeNull()
	})

	it('re-declares the shares once the rank column is on the board', () => {
		render(<PickTable rows={rowsFor()} ranking={ranking()} />)
		const cols = Array.from(screen.getByRole('table').querySelectorAll('colgroup col'))
		// Six columns, and the team column gives up the most for the sixth.
		expect(cols).toHaveLength(6)
		expect(cols[0].className).toBe('w-[27%] sm:w-[33%]')
		expect(cols[5].className).toBe('w-[17%] sm:w-[16%]')
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
