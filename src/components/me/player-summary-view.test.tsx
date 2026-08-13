// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeSummaryView, ModeSection } from '@/lib/game/me-summary-view'
import { PlayerSummaryView } from './player-summary-view'

afterEach(cleanup)

const HEADLINE = {
	kind: 'summary' as const,
	filters: { season: null },
	headline: {
		gamesPlayed: 6,
		gamesWon: 1,
		winRate: 1 / 6,
		pickAccuracy: { successful: 9, settled: 12, rate: 0.75, savedByLife: 1 },
		mostPickedTeam: null,
	},
	modes: [],
}

function withModes(modes: ModeSection[]): MeSummaryView {
	return { ...HEADLINE, modes }
}

const CLASSIC: ModeSection = {
	mode: 'classic',
	kind: 'played',
	gamesPlayed: 4,
	gamesWon: 1,
	winRate: 0.25,
	competitions: [
		{
			competitionId: 'comp-pl',
			name: 'Premier League 2025/26',
			gamesPlayed: 3,
			gamesWon: 1,
			winRate: 1 / 3,
		},
		{ competitionId: 'comp-wc', name: 'World Cup 2026', gamesPlayed: 1, gamesWon: 0, winRate: 0 },
	],
	depth: { best: 9, average: 4.5, games: 4 },
	roundOne: { games: 4, survived: 3, survivalRate: 0.75, exits: 1 },
}

const TURBO: ModeSection = {
	mode: 'turbo',
	kind: 'played',
	gamesPlayed: 2,
	gamesWon: 0,
	winRate: 0,
	competitions: [
		{
			competitionId: 'comp-pl',
			name: 'Premier League 2025/26',
			gamesPlayed: 2,
			gamesWon: 0,
			winRate: 0,
		},
	],
	streak: { longest: 5, average: 3.5, games: 2 },
}

/** The section a mode's heading names. */
function section(name: string): HTMLElement {
	return screen.getByRole('region', { name })
}

/** The figure shown under one labelled stat. */
function stat(scope: HTMLElement, label: string): string {
	const node = within(scope).getByText(label)
	return node.nextElementSibling?.textContent ?? ''
}

describe('PlayerSummaryView', () => {
	it('shows a mode section with its record and a row per competition', () => {
		render(<PlayerSummaryView summary={withModes([CLASSIC])} />)

		const classic = section('Classic')
		expect(stat(classic, 'Games played')).toBe('4')
		expect(stat(classic, 'Games won')).toBe('1')
		expect(stat(classic, 'Win rate')).toBe('25%')

		const [header, ...rows] = within(classic).getAllByRole('row')
		expect(header.textContent).toContain('Competition')
		expect(rows.map((r) => r.textContent)).toEqual([
			expect.stringContaining('Premier League 2025/26'),
			expect.stringContaining('World Cup 2026'),
		])
		expect(rows[0].textContent).toContain('3')
		expect(rows[0].textContent).toContain('33%')
	})

	it('shows classic depth as the rounds survived, best and average', () => {
		render(<PlayerSummaryView summary={withModes([CLASSIC])} />)

		const classic = section('Classic')
		expect(within(classic).getByText(/rounds you held a pick in/i)).toBeTruthy()
		expect(stat(classic, 'Deepest run')).toBe('9 rounds')
		expect(stat(classic, 'Average run')).toBe('4.5 rounds')
	})

	it('shows longest and average streak in a single-round mode', () => {
		render(<PlayerSummaryView summary={withModes([TURBO])} />)

		const turbo = section('Turbo')
		expect(stat(turbo, 'Longest streak')).toBe('5')
		expect(stat(turbo, 'Average streak')).toBe('3.5')
	})

	it('has no streak figures to show while every single-round game is still going', () => {
		const inPlay: ModeSection = { ...TURBO, streak: { longest: null, average: null, games: 0 } }
		render(<PlayerSummaryView summary={withModes([inPlay])} />)

		const turbo = section('Turbo')
		expect(stat(turbo, 'Longest streak')).toBe('—')
		expect(within(turbo).getByText(/no completed/i)).toBeTruthy()
	})

	it('says a mode has no history rather than showing it as a row of noughts', () => {
		render(
			<PlayerSummaryView
				summary={withModes([
					CLASSIC,
					{ mode: 'turbo', kind: 'unplayed' },
					{ mode: 'cup', kind: 'unplayed' },
				])}
			/>,
		)

		const cup = section('Cup')
		expect(within(cup).getByText(/haven't played/i)).toBeTruthy()
		expect(within(cup).queryByText('Games played')).toBeNull()
		expect(within(cup).queryAllByRole('row')).toHaveLength(0)
	})
})
