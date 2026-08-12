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
	headToHead: null,
}

const MARKET: FormMarket = {
	home: { shortName: 'MUN', probability: 8 / 13, price: 1.5 },
	draw: { probability: 3 / 13, price: 4 },
	away: { shortName: 'NEW', probability: 2 / 13, price: 6 },
	asOf: '2026-02-21T11:30:00.000Z',
	teamSide: 'home',
}

const PREVIEW = { name: 'Manchester United', shortName: 'MUN' }

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
