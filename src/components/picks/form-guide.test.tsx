// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
	EARLY_SEASON_GUIDE,
	EMPTY_GUIDE,
	FULL_GUIDE,
	NO_OPPONENT_GUIDE,
	OPENING_WEEKEND_GUIDE,
} from '@/app/preview/form-guide/fixtures'
import { FormGuideView } from './form-guide'

afterEach(cleanup)

function section(name: RegExp) {
	return screen.getByRole('heading', { name }).closest('section') as HTMLElement
}

describe('FormGuideView — season record', () => {
	it('splits the season record into overall, home and away', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		const season = section(/This season/)
		// 12 played: 6W 3D 3L overall, from the preview fixture's results.
		expect(within(season).getByText('Overall')).toBeTruthy()
		expect(within(season).getByText('Home')).toBeTruthy()
		expect(within(season).getByText('Away')).toBeTruthy()
		expect(within(season).getByText(/12 played/)).toBeTruthy()
	})

	it('shows goals for and against with a per-game average', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		const season = section(/This season/)
		expect(within(season).getByText('Scored')).toBeTruthy()
		expect(within(season).getByText('Conceded')).toBeTruthy()
		// 21 scored across 12 games.
		expect(within(season).getByText('1.75 per game')).toBeTruthy()
	})

	it('renders a dash rather than a NaN average when nothing has been played', () => {
		render(<FormGuideView guide={EMPTY_GUIDE} />)
		const season = section(/This season/)
		expect(within(season).getAllByText('— per game')).toHaveLength(2)
		expect(within(season).getAllByText('Not played yet').length).toBeGreaterThan(0)
	})
})

describe('FormGuideView — next fixture', () => {
	it('shows the next fixture with both sides’ win probability and the odds stamp', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		const next = section(/Next fixture/)
		expect(within(next).getByText(/vs Manchester City/)).toBeTruthy()
		expect(within(next).getByText('52%')).toBeTruthy()
		expect(within(next).getByText('26%')).toBeTruthy()
		expect(within(next).getByText(/odds as of/)).toBeTruthy()
	})

	it('says a fixture is unpriced rather than rendering a zero probability', () => {
		render(<FormGuideView guide={EARLY_SEASON_GUIDE} />)
		const next = section(/Next fixture/)
		expect(within(next).getByText('No odds for this match')).toBeTruthy()
		expect(within(next).queryByText('0%')).toBeNull()
	})
})

describe('FormGuideView — head-to-head', () => {
	it('renders the meetings when an opponent came in from the pick', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		expect(section(/Head-to-head vs Manchester City/)).toBeTruthy()
	})

	it('has no head-to-head section at all without an opponent', () => {
		render(<FormGuideView guide={NO_OPPONENT_GUIDE} />)
		expect(screen.queryByRole('heading', { name: /Head-to-head/ })).toBeNull()
	})

	it('says so explicitly when the two teams have not met yet', () => {
		render(<FormGuideView guide={EARLY_SEASON_GUIDE} />)
		const h2h = section(/Head-to-head/)
		expect(within(h2h).getByText(/No meetings in/)).toBeTruthy()
	})
})

describe('FormGuideView — results', () => {
	it('lists every finished match, each linking on to the opponent’s own guide', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		const results = section(/^Results$/)
		expect(within(results).getAllByText(/^\d+–\d+$/)).toHaveLength(FULL_GUIDE.results.length)
		const link = within(results).getAllByRole('link', { name: /form guide/ })[0]
		expect(link.getAttribute('href')).toContain('/competition/comp-pl/team/')
	})

	it('reads as "nothing yet" rather than blank before a ball is kicked', () => {
		render(<FormGuideView guide={EMPTY_GUIDE} />)
		const results = section(/^Results$/)
		expect(within(results).getByText('No matches played yet this season.')).toBeTruthy()
	})
})

describe('FormGuideView — back link', () => {
	it('offers the way back when the caller supplied one', () => {
		render(<FormGuideView guide={FULL_GUIDE} backHref="/game/g1" backLabel="Back to game" />)
		expect(screen.getByRole('link', { name: 'Back to game' }).getAttribute('href')).toBe('/game/g1')
	})

	it('omits it entirely on a directly-visited URL', () => {
		render(<FormGuideView guide={FULL_GUIDE} />)
		expect(screen.queryByRole('link', { name: /^Back/ })).toBeNull()
	})
})

describe('FormGuideView — header position', () => {
	it('reads "Nth of <full table>" on the opening weekend, before this team has played', () => {
		// The bug this guards: getTableSize once counted only teams that already
		// had a snapshot row, so a team sitting 14th could render "14th of 2" on
		// the opening weekend. tableSize is now the full table, so it reads "of
		// 20" even while this team's position line is still empty.
		const { container } = render(<FormGuideView guide={OPENING_WEEKEND_GUIDE} />)
		expect(container.textContent).toContain('14th of 20')
		expect(screen.getByText(/No position history yet/)).toBeTruthy()
	})
})
