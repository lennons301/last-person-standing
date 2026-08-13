// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
	MeSummaryView,
	ModeSection,
	TeamRecord,
	TeamRecordFamily,
} from '@/lib/game/me-summary-view'
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
	teamRecords: [],
	modes: [],
}

function withModes(modes: ModeSection[]): MeSummaryView {
	return { ...HEADLINE, modes }
}

function withTeams(families: TeamRecordFamily[]): MeSummaryView {
	return { ...HEADLINE, teamRecords: families }
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

function team(name: string, over: Partial<TeamRecord> = {}): TeamRecord {
	return {
		teamId: `team-${name.toLowerCase()}`,
		name,
		shortName: name.slice(0, 3).toUpperCase(),
		badgeUrl: null,
		picks: 2,
		wins: 1,
		savedByLife: 0,
		rate: 0.5,
		...over,
	}
}

const LIVERPOOL = team('Liverpool', { picks: 4, wins: 3, rate: 0.75 })
const CHELSEA = team('Chelsea', { picks: 3, wins: 1, savedByLife: 1, rate: 0.5 })
const ARSENAL = team('Arsenal')
const EVERTON = team('Everton', { wins: 0, rate: 0 })

/** A family with a best end, a worst end, and two teams only the expansion shows. */
const PREMIER_LEAGUE: TeamRecordFamily = {
	familyKey: 'premier-league',
	name: 'Premier League',
	seasons: 2,
	seasonOptions: ['2025/26', '2024/25'],
	selectedSeason: null,
	best: [LIVERPOOL],
	worst: [EVERTON],
	all: [LIVERPOOL, ARSENAL, CHELSEA, EVERTON],
}

/** The section a mode's — or the Teams section's — heading names. */
function section(name: string): HTMLElement {
	return screen.getByRole('region', { name })
}

/** One team's row, found by the club name it leads with. */
function teamRow(scope: HTMLElement, name: string): HTMLElement {
	const row = within(scope).getAllByText(name)[0].closest('li')
	if (!row) throw new Error(`no team row for ${name}`)
	return row
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

	it('puts the Teams section below the mode sections', () => {
		render(
			<PlayerSummaryView
				summary={{ ...HEADLINE, modes: [CLASSIC], teamRecords: [PREMIER_LEAGUE] }}
			/>,
		)

		const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
		expect(headings).toEqual(['Classic', 'Teams'])
	})
})

describe('PlayerSummaryView teams section', () => {
	it("states a team's picks, wins and rate, and the picks a life absorbed", () => {
		render(<PlayerSummaryView summary={withTeams([PREMIER_LEAGUE])} />)

		const teams = section('Teams')
		const liverpool = teamRow(teams, 'Liverpool')
		expect(liverpool.textContent).toContain('4 picks')
		expect(liverpool.textContent).toContain('3 wins')
		expect(liverpool.textContent).toContain('75%')
		// Nothing a life absorbed, so the row doesn't mention lives at all.
		expect(liverpool.textContent).not.toContain('saved by a life')

		expect(within(teams).getByText(/2 seasons/)).toBeTruthy()
	})

	it('counts a pick a life absorbed on the row, outside the rate', () => {
		const family = { ...PREMIER_LEAGUE, best: [CHELSEA], worst: [] }
		render(<PlayerSummaryView summary={withTeams([family])} />)

		// Chelsea won 1 of the 2 picks a life didn't absorb: 50%, not 1-in-3.
		const chelsea = teamRow(section('Teams'), 'Chelsea')
		expect(chelsea.textContent).toContain('3 picks')
		expect(chelsea.textContent).toContain('1 saved by a life')
		expect(chelsea.textContent).toContain('50%')
	})

	it('leaves an end out entirely rather than labelling an empty one', () => {
		const lonely: TeamRecordFamily = {
			...PREMIER_LEAGUE,
			best: [LIVERPOOL],
			worst: [],
			all: [LIVERPOOL],
		}
		render(<PlayerSummaryView summary={withTeams([lonely])} />)

		const teams = section('Teams')
		expect(within(teams).getByText('Best')).toBeTruthy()
		expect(within(teams).queryByText('Worst')).toBeNull()
	})

	it('lists every team once the expansion is opened', () => {
		render(<PlayerSummaryView summary={withTeams([PREMIER_LEAGUE])} />)

		const teams = section('Teams')
		// Arsenal and Chelsea are in neither end, so only the expansion has them.
		expect(within(teams).queryByText('Arsenal')).toBeNull()
		expect(within(teams).queryByText('Chelsea')).toBeNull()

		fireEvent.click(within(teams).getByRole('button', { name: /All 4 teams/ }))

		for (const name of ['Liverpool', 'Arsenal', 'Chelsea', 'Everton']) {
			expect(within(teams).getAllByText(name).length).toBeGreaterThan(0)
		}
	})

	it('keeps each competition family in its own block', () => {
		const worldCup: TeamRecordFamily = {
			familyKey: 'world-cup',
			name: 'World Cup',
			seasons: 1,
			seasonOptions: ['2026'],
			selectedSeason: null,
			best: [team('Brazil', { wins: 2, picks: 2, rate: 1 })],
			worst: [],
			all: [team('Brazil', { wins: 2, picks: 2, rate: 1 })],
		}
		render(<PlayerSummaryView summary={withTeams([PREMIER_LEAGUE, worldCup])} />)

		const teams = section('Teams')
		expect(within(teams).getByText('Premier League')).toBeTruthy()
		expect(within(teams).getByText('World Cup')).toBeTruthy()
		// One season pooled reads as a season, not as pooling that didn't happen.
		expect(within(teams).getByText(/1 season\./)).toBeTruthy()
	})

	it('has no Teams section at all for a player with no team records', () => {
		render(<PlayerSummaryView summary={withTeams([])} />)

		expect(screen.queryByRole('region', { name: 'Teams' })).toBeNull()
	})
})
