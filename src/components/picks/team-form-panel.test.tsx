// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'
import { TeamFormPanel } from './team-form-panel'

afterEach(cleanup)

const DETAIL: TeamFormDetail = {
	team: {
		id: 'team-ars',
		name: 'Arsenal',
		shortName: 'ARS',
		badgeUrl: null,
		leaguePosition: 3,
	},
	seasonRecord: { wins: 6, draws: 3, losses: 3 },
	recent: [],
	headToHead: null,
}

const PREVIEW = { name: 'Arsenal', shortName: 'ARS' }
const HREF = '/competition/comp-pl/team/team-ars?opponent=team-mci'

describe('TeamFormPanel — the way through to the full guide', () => {
	it('links on to the form guide, from the footer and from the badge', () => {
		render(<TeamFormPanel detail={DETAIL} teamPreview={PREVIEW} formGuideHref={HREF} />)
		expect(screen.getByRole('link', { name: 'Full form guide' }).getAttribute('href')).toBe(HREF)
		expect(screen.getByRole('link', { name: 'ARS form guide' }).getAttribute('href')).toBe(HREF)
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
