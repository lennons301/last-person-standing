// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CupPickFixture } from '@/lib/game/pick-view-types'
import { CupPick } from './cup-pick'

afterEach(cleanup)

const FIXTURES: CupPickFixture[] = [
	{
		id: 'cf-1',
		homeTeamId: 't-mun',
		awayTeamId: 't-new',
		homeShort: 'MUN',
		homeName: 'Manchester United',
		homeColor: null,
		// Badge URLs so the row renders images rather than initials: the initials'
		// font size is locked to the badge diameter, which is TeamBadge's geometry
		// problem rather than part of the row's type hierarchy.
		homeBadgeUrl: '/mun.png',
		awayShort: 'NEW',
		awayName: 'Newcastle United',
		awayColor: null,
		awayBadgeUrl: '/new.png',
		kickoff: new Date('2099-01-02T15:00:00.000Z'),
		// Home is two tiers up: home is restricted, away is the underdog worth +2.
		tierDifference: 2,
	},
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof CupPick>> = {}) {
	return render(
		<CupPick
			fixtures={FIXTURES}
			numberOfPicks={6}
			livesRemaining={2}
			maxLives={3}
			initialSlots={[]}
			onSubmit={vi.fn()}
			competitionId="c1"
			roundNumber={4}
			{...overrides}
		/>,
	)
}

/** The `FixtureRow` subtree for a fixture, top strip included. */
function rowFor(teamName: string): HTMLElement {
	const card = screen.getByText(teamName).closest('div.rounded-lg')
	const row = card?.parentElement
	if (!row) throw new Error(`no fixture row found for ${teamName}`)
	return row as HTMLElement
}

describe('CupPick — no duplication of the hero', () => {
	it('renders no deadline and no "rank N picks" line', () => {
		// Both belong to the game hero directly above this card: it names the round,
		// counts the deadline down and states how many predictions to rank.
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('Deadline')
		expect(container.textContent).not.toMatch(/rank \d+ picks/i)
	})

	it('keeps the lives summary and the two pick columns', () => {
		// The de-dup takes the hero's chrome out, not the card's own content.
		renderPicker()
		expect(screen.getByText('Lives')).toBeTruthy()
		expect(screen.getByText('2 of 3')).toBeTruthy()
		expect(screen.getByText('Available fixtures')).toBeTruthy()
		expect(screen.getByText('Your picks, ranked')).toBeTruthy()
		// The ranked column is where the count now lives — the only place it does.
		expect(screen.getByText('0 of 6 selected — need 1')).toBeTruthy()
	})
})

describe('CupPick — inherited FixtureRow legibility (#135)', () => {
	it('renders the mobile short code unclipped and only truncates the full name', () => {
		const { container } = renderPicker()
		const shortCode = [...container.querySelectorAll('span')].find(
			(el) => el.textContent === 'NEW' && el.className.includes('sm:hidden'),
		)
		expect(shortCode).toBeTruthy()
		expect(shortCode?.className).toContain('whitespace-nowrap')
		expect(shortCode?.className).not.toContain('truncate')
		expect(screen.getByText('Newcastle United').className).toContain('truncate')
	})

	it('puts the +N lives chip on the underdog and the reason on the restricted side', () => {
		renderPicker()
		// The bonus belongs to the team that earns it, not the fixture strip.
		const underdogButton = screen.getByText('Newcastle United').closest('button')
		expect(underdogButton?.textContent).toContain('+2 lives')
		const restrictedButton = screen.getByText('Manchester United').closest('button')
		expect(restrictedButton?.textContent).toContain('Restricted — opponent is 2 tiers lower')
		expect(restrictedButton?.disabled).toBe(true)
	})

	it('drops the form bar — cup sources neither form nor league position', () => {
		// Not a gap to fill here: cup's form is cross-competition (a team's league,
		// not the cup), deferred to the FA-Cup effort. The row must stay silent about
		// what it wasn't given rather than claiming "No form yet".
		const { container } = renderPicker()
		expect(container.textContent).not.toContain('No form yet')
		expect(screen.queryByLabelText(/Open form details/)).toBeNull()
	})

	it('uses only named scale steps in the fixture rows — no ad-hoc bracket font sizes', () => {
		renderPicker()
		const bracketSizes = [...rowFor('Manchester United').querySelectorAll('[class]')]
			// `getAttribute` rather than `.className` — on SVG elements the latter is an
			// SVGAnimatedString, not a string.
			.flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
			.filter((c) => /^text-\[[\d.]+(rem|px|em)\]$/.test(c))
		expect(bracketSizes).toEqual([])
	})
})
