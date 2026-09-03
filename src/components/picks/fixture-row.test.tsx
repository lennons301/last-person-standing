// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FixtureRow, type FixtureTeamInfo } from './fixture-row'
import type { FormMarket } from './team-form-panel'

afterEach(cleanup)

const MUN: FixtureTeamInfo = { id: 't1', name: 'Manchester United', shortName: 'MUN' }
const NEW: FixtureTeamInfo = { id: 't2', name: 'Newcastle United', shortName: 'NEW' }

describe('FixtureRow league position', () => {
	it('renders league position when a side has a position but no form', () => {
		// Regression: position used to live inside the form bar, and the bar only
		// rendered when form existed — so at season start the row silently lost the
		// league positions too.
		render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, leaguePosition: 4 }}
				away={{ ...NEW, leaguePosition: 9 }}
				competitionId="c1"
			/>,
		)
		expect(screen.getByText('4th')).toBeTruthy()
		expect(screen.getByText('9th')).toBeTruthy()
	})

	it('shows a form-less side its position alone, with no filler beside it', () => {
		// The row used to say "No form yet" here. A position with nothing next to it
		// already reads as a season that hasn't started, and the filler only
		// collided with the position it sat beside.
		const { container } = render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, leaguePosition: 4 }}
				away={NEW}
				competitionId="c1"
			/>,
		)
		expect(screen.getByText('4th')).toBeTruthy()
		expect(container.textContent).not.toContain('No form yet')
	})

	it('still renders form alongside position', () => {
		const { container } = render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, leaguePosition: 4, form: ['W', 'D'] }}
				away={NEW}
				competitionId="c1"
			/>,
		)
		expect(screen.getByText('4th')).toBeTruthy()
		// One dot per result on the home side; the away side simply shows nothing.
		expect(screen.getAllByText('W')).toHaveLength(1)
		expect(container.textContent).not.toContain('No form yet')
	})

	it('drops the bottom bar entirely when the row has neither form nor position', () => {
		// Cup fixtures carry neither, so there's nothing for the bar to hold and no
		// sheet worth tapping through to.
		render(<FixtureRow fixtureId="f1" home={MUN} away={NEW} competitionId="c1" />)
		expect(screen.queryByLabelText(/Open form details/)).toBeNull()
	})
})

describe('FixtureRow "both used" label', () => {
	it('renders the label outside the dimmed card so it stays legible and steals no width', () => {
		const { container } = render(
			<FixtureRow fixtureId="f1" home={MUN} away={NEW} usedSide="both" usedLabel="Both used" />,
		)
		expect(screen.getByText('Both used')).toBeTruthy()
		const dimmedCard = container.querySelector('.opacity-30')
		expect(dimmedCard).toBeTruthy()
		// The label must not sit inside the dimmed, pointer-events-none card — and
		// in particular not inside the flex row the team buttons compete in.
		expect(dimmedCard?.textContent).not.toContain('Both used')
	})
})

describe('FixtureRow team name', () => {
	it('never clips the mobile short code, only the desktop full name', () => {
		// The two used to share one `truncate w-full` span, so a status chip on the
		// same button shrank the column and clipped codes like MUN.
		const { container } = render(
			<FixtureRow fixtureId="f1" home={MUN} away={NEW} homeState={{ kind: 'auto-locked' }} />,
		)
		// `getByText('MUN')` is ambiguous — the badge fallback renders the code too.
		const shortCode = [...container.querySelectorAll('span')].find(
			(el) => el.textContent === 'MUN' && el.className.includes('sm:hidden'),
		)
		expect(shortCode).toBeTruthy()
		expect(shortCode?.className).toContain('whitespace-nowrap')
		expect(shortCode?.className).not.toContain('truncate')
		const fullName = screen.getByText('Manchester United')
		expect(fullName.className).toContain('truncate')
		expect(container.textContent).toContain('Auto')
	})
})

describe('FixtureRow type scale', () => {
	it('uses only named scale steps — no ad-hoc bracket font sizes', () => {
		// Badges carry a URL so the row renders images rather than initials: the
		// initials' font size is locked to the badge diameter, which is TeamBadge's
		// geometry problem, not part of the row's hierarchy.
		const { container } = render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, leaguePosition: 1, form: ['W', 'W', 'L'], badgeUrl: '/mun.png' }}
				away={{ ...NEW, leaguePosition: 20, form: ['L', 'D', 'W'], badgeUrl: '/new.png' }}
				competitionId="c1"
				kickoff="2026-08-15T14:00:00Z"
				tierValue={3}
				tierMax={3}
				plusN={2}
				showHeart
				underdogSide="away"
				homeState={{ kind: 'current' }}
				awayState={{ kind: 'tentative' }}
			/>,
		)
		const bracketSizes = [...container.querySelectorAll('[class]')]
			// `getAttribute` rather than `.className` — on SVG elements the latter is
			// an SVGAnimatedString, not a string.
			.flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
			// Bracketed *lengths* only — `text-[var(--alive)]` is a colour, not a size.
			.filter((c) => /^text-\[[\d.]+(rem|px|em)\]$/.test(c))
		expect(bracketSizes).toEqual([])
	})
})

describe('FixtureRow win probability', () => {
	// 8/13, 3/13 and 2/13 — the de-vigged read of a 1.50 / 4.00 / 6.00 market.
	const ODDS = {
		home: { probability: 8 / 13, price: 1.5 },
		draw: { probability: 3 / 13, price: 4 },
		away: { probability: 2 / 13, price: 6 },
		asOf: '2026-08-14T11:30:00Z',
	}

	it('renders each side’s win probability with the raw price it came from', () => {
		render(<FixtureRow fixtureId="f1" home={MUN} away={NEW} odds={ODDS} />)

		expect(screen.getByText('62%')).toBeTruthy()
		expect(screen.getByText('1.50')).toBeTruthy()
		expect(screen.getByText('15%')).toBeTruthy()
		expect(screen.getByText('6.00')).toBeTruthy()
	})

	it('stamps when the odds were taken', () => {
		const { container } = render(<FixtureRow fixtureId="f1" home={MUN} away={NEW} odds={ODDS} />)
		expect(container.textContent).toContain('Odds as of')
	})

	it('renders no probability at all for a fixture with no odds', () => {
		// A fixture (or whole competition) the source doesn't price. Never a zero,
		// never a placeholder — the row is simply the row it was before.
		const { container } = render(<FixtureRow fixtureId="f1" home={MUN} away={NEW} />)
		expect(container.textContent).not.toContain('%')
		expect(container.textContent).not.toContain('Odds as of')
	})

	it('hands the form sheet the full market, attributed to the tapped side', () => {
		// The row shows two win chances; the sheet one tap below shows the whole
		// 1X2, so the draw the row hides still has to reach it.
		const markets: Array<FormMarket | null | undefined> = []
		render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, form: ['W'] }}
				away={NEW}
				odds={ODDS}
				renderFormSheet={({ market }) => {
					markets.push(market)
					return null
				}}
			/>,
		)
		fireEvent.click(screen.getByLabelText('Open form details for Newcastle United'))

		const market = markets.at(-1)
		expect(market).toMatchObject({
			home: { shortName: 'MUN', probability: 8 / 13, price: 1.5 },
			draw: { probability: 3 / 13, price: 4 },
			away: { shortName: 'NEW', probability: 2 / 13, price: 6 },
			teamSide: 'away',
		})
	})

	it('hands the form sheet no market for an unpriced fixture', () => {
		const markets: Array<FormMarket | null | undefined> = []
		render(
			<FixtureRow
				fixtureId="f1"
				home={{ ...MUN, form: ['W'] }}
				away={NEW}
				renderFormSheet={({ market }) => {
					markets.push(market)
					return null
				}}
			/>,
		)
		expect(markets.at(-1)).toBeNull()
	})
})
