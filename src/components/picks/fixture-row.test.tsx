// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FixtureRow, type FixtureTeamInfo } from './fixture-row'

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
				home={{ ...MUN, leaguePosition: 4 }}
				away={{ ...NEW, leaguePosition: 9 }}
				competitionId="c1"
			/>,
		)
		expect(screen.getByText('4th')).toBeTruthy()
		expect(screen.getByText('9th')).toBeTruthy()
	})

	it('labels a form-less side explicitly rather than leaving it blank', () => {
		render(<FixtureRow home={{ ...MUN, leaguePosition: 4 }} away={NEW} competitionId="c1" />)
		expect(screen.getAllByText('No form yet')).toHaveLength(2)
	})

	it('still renders form alongside position', () => {
		render(
			<FixtureRow
				home={{ ...MUN, leaguePosition: 4, form: ['W', 'D'] }}
				away={NEW}
				competitionId="c1"
			/>,
		)
		expect(screen.getByText('4th')).toBeTruthy()
		// One dot per result on the home side, plus the away side's placeholder.
		expect(screen.getAllByText('W')).toHaveLength(1)
		expect(screen.getAllByText('No form yet')).toHaveLength(1)
	})

	it('drops the bottom bar entirely when the row has neither form nor position', () => {
		// Cup fixtures carry neither, and an unconditional "No form yet" there would
		// assert something about the teams the row has no basis for.
		const { container } = render(<FixtureRow home={MUN} away={NEW} competitionId="c1" />)
		expect(container.textContent).not.toContain('No form yet')
		expect(screen.queryByLabelText(/Open form details/)).toBeNull()
	})
})

describe('FixtureRow "both used" label', () => {
	it('renders the label outside the dimmed card so it stays legible and steals no width', () => {
		const { container } = render(
			<FixtureRow home={MUN} away={NEW} usedSide="both" usedLabel="Both used" />,
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
			<FixtureRow home={MUN} away={NEW} homeState={{ kind: 'auto-locked' }} />,
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
