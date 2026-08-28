// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'
import { type FormMarket, TeamFormPanel } from './team-form-panel'

afterEach(cleanup)

const DETAIL: TeamFormDetail = {
	team: {
		id: 't1',
		name: 'Manchester United',
		shortName: 'MUN',
		badgeUrl: null,
		leaguePosition: 4,
	},
	splits: {
		overall: {
			played: 26,
			wins: 14,
			draws: 6,
			losses: 6,
			goalsFor: 45,
			goalsAgainst: 30,
			form: ['W', 'D', 'L'],
		},
		home: {
			played: 13,
			wins: 10,
			draws: 2,
			losses: 1,
			goalsFor: 29,
			goalsAgainst: 11,
			form: ['W', 'W'],
		},
		away: {
			played: 13,
			wins: 4,
			draws: 4,
			losses: 5,
			goalsFor: 16,
			goalsAgainst: 19,
			form: ['D', 'L'],
		},
	},
	recent: [],
}

const MARKET: FormMarket = {
	home: { shortName: 'MUN', probability: 8 / 13, price: 1.5 },
	draw: { probability: 3 / 13, price: 4 },
	away: { shortName: 'NEW', probability: 2 / 13, price: 6 },
	asOf: '2026-02-21T11:30:00.000Z',
	teamSide: 'home',
}

const PREVIEW = { name: 'Manchester United', shortName: 'MUN' }
const HREF = '/competition/comp-pl/team/t1?opponent=t2'

describe('TeamFormPanel home/away split', () => {
	it('shows each venue’s record, not just the combined one', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} />)

		expect(screen.getByText('Home')).toBeTruthy()
		expect(screen.getByText('Away')).toBeTruthy()
		expect(screen.getByText('10-2-1')).toBeTruthy()
		expect(screen.getByText('4-4-5')).toBeTruthy()
		expect(screen.getByText('14-6-6')).toBeTruthy()
	})

	it('shows goals for and against per venue', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} />)

		expect(screen.getByText('29-11')).toBeTruthy()
		expect(screen.getByText('16-19')).toBeTruthy()
		expect(screen.getByText('45-30')).toBeTruthy()
	})

	it('marks an unplayed venue with a dash rather than an empty cell', () => {
		const nothingAway = {
			...DETAIL,
			splits: {
				...DETAIL.splits,
				away: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: [] },
			},
		}
		render(<TeamFormPanel detail={nothingAway} teamPreview={PREVIEW} />)

		expect(screen.getByText('—')).toBeTruthy()
	})
})

describe('TeamFormPanel head-to-head', () => {
	it('shows no head-to-head section — that lives on the form guide', () => {
		// Scoped to one competition, the sheet could only ever show this season's
		// meetings, which isn't what a player means by head-to-head. The guide
		// (#165) has previous seasons in scope; the sheet doesn't even query it.
		const { container } = render(
			<TeamFormPanel detail={DETAIL} market={MARKET} teamPreview={PREVIEW} formGuideHref={HREF} />,
		)

		expect(container.textContent).not.toContain('meetings')
		expect(container.textContent).not.toContain('No previous meetings this season')
	})
})

describe('TeamFormPanel match odds', () => {
	it('shows the full home/draw/away market, the draw included', () => {
		render(<TeamFormPanel detail={DETAIL} market={MARKET} teamPreview={PREVIEW} />)

		expect(screen.getByText('MUN win')).toBeTruthy()
		expect(screen.getByText('Draw')).toBeTruthy()
		expect(screen.getByText('NEW win')).toBeTruthy()
		expect(screen.getByText('62%')).toBeTruthy()
		expect(screen.getByText('23%')).toBeTruthy()
		expect(screen.getByText('15%')).toBeTruthy()
		expect(screen.getByText('1.50')).toBeTruthy()
		expect(screen.getByText('4.00')).toBeTruthy()
		expect(screen.getByText('6.00')).toBeTruthy()
	})

	it('stamps when the market was read', () => {
		const { container } = render(
			<TeamFormPanel detail={DETAIL} market={MARKET} teamPreview={PREVIEW} />,
		)
		expect(container.textContent).toContain('as of')
	})

	it('renders no market at all for an unpriced fixture', () => {
		// Same rule as the row: nothing beats a zero, which would read as "no chance".
		const { container } = render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} />)

		expect(container.textContent).not.toContain('Match odds')
		expect(container.textContent).not.toContain('%')
	})

	it('shows the market while the form is still loading, and after it fails', () => {
		const loading = render(
			<TeamFormPanel detail={null} loading market={MARKET} teamPreview={PREVIEW} />,
		)
		expect(loading.container.textContent).toContain('Match odds')
		cleanup()

		const failed = render(
			<TeamFormPanel
				detail={null}
				error="Could not load team form"
				market={MARKET}
				teamPreview={PREVIEW}
			/>,
		)
		expect(failed.container.textContent).toContain('Match odds')
	})
})

describe('TeamFormPanel fixture summary', () => {
	it('shows the opponent and kickoff before the match — no score yet', () => {
		render(
			<TeamFormPanel
				detail={DETAIL}
				teamPreview={PREVIEW}
				fixtureSummary={{
					statusLabel: 'Kicks off',
					opponentShortName: 'NEW',
					homeAway: 'H',
					kickoff: '2026-03-01T15:00:00.000Z',
					score: null,
				}}
			/>,
		)
		expect(screen.getByText(/NEW/)).toBeTruthy()
		expect(screen.getByText('Kicks off')).toBeTruthy()
		expect(screen.queryByText('2-1')).toBeNull()
	})

	it('marks venue with (H)/(A) rather than the American "@" notation', () => {
		const { container, unmount } = render(
			<TeamFormPanel
				detail={DETAIL}
				teamPreview={PREVIEW}
				fixtureSummary={{
					statusLabel: 'Kicks off',
					opponentShortName: 'NEW',
					homeAway: 'H',
					kickoff: '2026-03-01T15:00:00.000Z',
					score: null,
				}}
			/>,
		)
		expect(container.textContent).not.toContain('@')
		expect(screen.getByText('NEW (H)')).toBeTruthy()
		unmount()

		render(
			<TeamFormPanel
				detail={DETAIL}
				teamPreview={PREVIEW}
				fixtureSummary={{
					statusLabel: 'Full-time',
					opponentShortName: 'NEW',
					homeAway: 'A',
					kickoff: '2026-03-01T15:00:00.000Z',
					score: '2-1',
				}}
			/>,
		)
		expect(screen.getByText('NEW (A)')).toBeTruthy()
	})

	it('shows the final score once the match has a result, not the kickoff time', () => {
		render(
			<TeamFormPanel
				detail={DETAIL}
				teamPreview={PREVIEW}
				fixtureSummary={{
					statusLabel: 'Full-time',
					opponentShortName: 'NEW',
					homeAway: 'A',
					kickoff: '2026-03-01T15:00:00.000Z',
					score: '2-1',
				}}
			/>,
		)
		expect(screen.getByText('Full-time')).toBeTruthy()
		expect(screen.getByText('2-1')).toBeTruthy()
	})

	it('renders no fixture summary block when none is supplied', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} />)
		expect(screen.queryByText('Kicks off')).toBeNull()
		expect(screen.queryByText('Full-time')).toBeNull()
	})
})

describe('TeamFormPanel — recent results', () => {
	it('marks venue with (H)/(A) rather than the American "@" notation', () => {
		const withRecent: TeamFormDetail = {
			...DETAIL,
			recent: [
				{
					roundNumber: 26,
					roundLabel: 'GW26',
					opponentShortName: 'NEW',
					opponentName: 'Newcastle United',
					opponentBadgeUrl: null,
					home: true,
					goalsFor: 2,
					goalsAgainst: 1,
					result: 'W',
				},
				{
					roundNumber: 25,
					roundLabel: 'GW25',
					opponentShortName: 'EVE',
					opponentName: 'Everton',
					opponentBadgeUrl: null,
					home: false,
					goalsFor: 0,
					goalsAgainst: 0,
					result: 'D',
				},
			],
		}
		const { container } = render(<TeamFormPanel detail={withRecent} teamPreview={PREVIEW} />)

		expect(container.textContent).not.toContain('@')
		expect(screen.getByText('NEW (H)')).toBeTruthy()
		expect(screen.getByText('EVE (A)')).toBeTruthy()
	})
})

describe('TeamFormPanel — the way through to the full guide', () => {
	it('links on to the form guide, from the footer and from the badge', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} formGuideHref={HREF} />)
		expect(screen.getByRole('link', { name: 'Full form guide' }).getAttribute('href')).toBe(HREF)
		expect(screen.getByRole('link', { name: 'MUN form guide' }).getAttribute('href')).toBe(HREF)
	})

	it('offers the guide while the sheet is still loading — the page does not depend on the sheet', () => {
		render(<TeamFormPanel detail={null} loading teamPreview={PREVIEW} formGuideHref={HREF} />)
		expect(screen.getByRole('link', { name: 'Full form guide' })).toBeTruthy()
	})

	it('renders no link at all when no guide route was supplied', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} />)
		expect(screen.queryByRole('link')).toBeNull()
	})
})
