// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { GameDetailView } from './game-detail-view'
import type { AdminPayment } from './payments-panel'

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
		target: '40.00',
		unpaid: '10.00',
		entryFee: '10.00',
		playerCount: 4,
		aliveCount: 4,
		status: 'active',
		inviteCode: 'ABC123',
		creatorName: 'Alice',
		isAdmin: true,
		myPayment: null,
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
		render(<GameDetailView game={game()} pickSection={null} />)

		const toggle = screen.getByRole('button', { name: /manage game/i })
		expect(toggle.getAttribute('aria-expanded')).toBe('false')
		expect(screen.queryByRole('button', { name: '+ Add player' })).toBeNull()
		expect(screen.queryByText('Payments')).toBeNull()
	})

	it('never renders the fold for non-admins', () => {
		render(
			<GameDetailView
				game={game({ isAdmin: false, adminPayments: undefined })}
				pickSection={null}
			/>,
		)

		expect(screen.queryByRole('button', { name: /manage game/i })).toBeNull()
	})
})
