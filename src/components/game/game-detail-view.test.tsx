// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import type { GameViewDescriptor } from '@/lib/game/game-view'
import { GameDetailView } from './game-detail-view'
import type { AdminPayment } from './payments-panel'

// The fold lives well below the hero, so these tests pin the hero to its
// no-variant case: the page falls back to its pre-redesign top-of-page chrome
// and nothing above the fold interferes with the assertions.
const view: GameViewDescriptor = {
	hero: { kind: 'none', mode: 'classic', round: null, reason: 'no-round' },
	stats: {
		potConfirmed: '30.00',
		potPending: '10.00',
		potTotal: '40.00',
		potUnpaid: '10.00',
		potTarget: '50.00',
		aliveCount: 4,
		playerCount: 4,
		rebuyAvailable: false,
	},
	demote: { roundStrip: false },
}

const adminPayments: AdminPayment[] = [
	{
		id: 'p1',
		userId: 'u1',
		userName: 'Alice',
		amount: '10.00',
		status: 'pending',
		isRebuy: false,
		isRebuyEligible: false,
		claimedAt: null,
		paidAt: null,
	},
]

function game(overrides: Record<string, unknown> = {}) {
	return {
		id: 'g1',
		name: 'Cup Tuesday',
		gameMode: 'classic',
		competition: 'Premier League 2026/27',
		pot: { confirmed: '30.00', pending: '10.00', total: '40.00' },
		entryFee: '10.00',
		aliveCount: 4,
		status: 'active',
		inviteCode: 'ABC123',
		creatorName: 'Alice',
		isAdmin: true,
		myPayment: null,
		myPaymentPayUrl: null,
		adminPayments,
		myCurrentRoundPick: null,
		currentRound: null,
		defaultShareVariant: 'standings' as const,
		liveShareAvailable: false,
		winnerShareAvailable: false,
		...overrides,
	}
}

describe('GameDetailView management fold', () => {
	beforeEach(() => {
		// LiveProvider polls /api/games/[id]/live on mount — hand it an empty
		// but well-formed payload so the poll settles instead of throwing.
		const livePayload = {
			gameId: 'g1',
			gameMode: 'classic',
			roundId: null,
			fixtures: [],
			picks: [],
			players: [],
			viewerUserId: 'u1',
			updatedAt: '2026-08-04T00:00:00.000Z',
		}
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(livePayload), { status: 200 }),
		)
	})

	it('renders the collapsed Manage game fold for admins', () => {
		render(<GameDetailView game={game()} view={view} pickSection={null} />)

		const toggle = screen.getByRole('button', { name: /manage game/i })
		expect(toggle.getAttribute('aria-expanded')).toBe('false')
		expect(screen.queryByRole('button', { name: '+ Add player' })).toBeNull()
		expect(screen.queryByText('Payments')).toBeNull()
	})

	it('tops the page with the identity bar and the stat line, and nothing else', () => {
		render(<GameDetailView game={game()} view={view} pickSection={null} />)

		expect(screen.getByRole('heading', { name: 'Cup Tuesday' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'How classic mode works' })).toBeTruthy()
		expect(screen.getByRole('button', { name: /£30\.00 pot/ })).toBeTruthy()
		expect(screen.getByText(/of\s+4 in/)).toBeTruthy()
		// Invite code and entry fee left the persistent page for the share flow
		// and the rules dialog; the pot breakdown is behind the disclosure.
		expect(screen.queryByText('ABC123')).toBeNull()
		expect(screen.queryByText(/entry/i)).toBeNull()
		expect(screen.queryByText('Target')).toBeNull()
	})

	it('names the round on its own strip while no hero owns it', () => {
		const currentRound = {
			label: 'GW7',
			longLabel: 'Gameweek 7',
			deadline: new Date('2026-08-08T17:30:00.000Z'),
			deadlinePassed: true,
			roundCompleted: false,
		}
		render(<GameDetailView game={game({ currentRound })} view={view} pickSection={null} />)
		expect(screen.getByText('Gameweek 7')).toBeTruthy()
		expect(screen.getByText('Locked')).toBeTruthy()
	})

	it('drops the round strip once a hero owns the round', () => {
		const currentRound = {
			label: 'GW7',
			longLabel: 'Gameweek 7',
			deadline: new Date('2026-08-08T17:30:00.000Z'),
			deadlinePassed: false,
			roundCompleted: false,
		}
		render(
			<GameDetailView
				game={game({ currentRound })}
				view={{ ...view, demote: { roundStrip: true } }}
				pickSection={null}
			/>,
		)
		expect(screen.queryByText('Gameweek 7')).toBeNull()
	})

	it('hangs an unpaid balance off the stat line instead of a band', () => {
		render(
			<GameDetailView
				game={game({ myPayment: { id: 'pay1', status: 'pending', amount: '10.00' } })}
				view={view}
				pickSection={null}
			/>,
		)

		const notice = screen.getByRole('button', { name: /£10\.00 unpaid — settle up/ })
		const statLine = screen.getByRole('button', { name: /£30\.00 pot/ }).parentElement
		expect(statLine?.contains(notice)).toBe(true)
	})

	it('never renders the fold for non-admins', () => {
		render(
			<GameDetailView
				game={game({ isAdmin: false, adminPayments: undefined })}
				view={view}
				pickSection={null}
			/>,
		)

		expect(screen.queryByRole('button', { name: /manage game/i })).toBeNull()
	})
})
