// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { ManageGameFold } from './manage-game-fold'
import type { AdminPayment } from './payments-panel'

const payments: AdminPayment[] = [
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

const baseProps = {
	gameId: 'g1',
	gameName: 'Cup Tuesday',
	inviteCode: 'ABC123',
	entryFee: '10.00',
	gameStatus: 'active',
	aliveCount: 4,
	pot: { confirmed: '30.00', pending: '10.00', total: '40.00' },
	payments,
}

function toggle() {
	return screen.getByRole('button', { name: /manage game/i })
}

describe('ManageGameFold', () => {
	it('is collapsed by default — no admin or payment tooling rendered', () => {
		render(<ManageGameFold {...baseProps} />)

		expect(toggle().getAttribute('aria-expanded')).toBe('false')
		expect(screen.queryByText('Game actions')).toBeNull()
		expect(screen.queryByText('Payments')).toBeNull()
		expect(screen.queryByRole('button', { name: '+ Add player' })).toBeNull()
	})

	it('reveals both the admin panel and the payments panel when opened', () => {
		render(<ManageGameFold {...baseProps} />)

		fireEvent.click(toggle())

		expect(toggle().getAttribute('aria-expanded')).toBe('true')
		// Admin panel tooling
		expect(screen.getByText('Game actions')).toBeTruthy()
		expect(screen.getByRole('button', { name: '+ Add player' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Split pot (4 alive)' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Delete game' })).toBeTruthy()
		// Payments panel tooling
		expect(screen.getByText('Payments')).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
	})

	it('still shows the admin panel when the game has no payment rows', () => {
		render(<ManageGameFold {...baseProps} payments={[]} />)

		fireEvent.click(toggle())

		expect(screen.getByRole('button', { name: '+ Add player' })).toBeTruthy()
		expect(screen.queryByText('Payments')).toBeNull()
	})
})
