// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}))

import { type AdminPayment, PaymentsPanel } from './payments-panel'

const baseProps = {
	gameId: 'g1',
	gameName: 'Cup Tuesday',
	inviteCode: 'ABC123',
	totals: { confirmed: '30.00', pending: '0.00', total: '30.00' },
}

function row(overrides: Partial<AdminPayment>): AdminPayment {
	return {
		id: 'p1',
		userId: 'u1',
		userName: 'Alice',
		amount: '10.00',
		status: 'paid',
		isRebuy: false,
		isRebuyEligible: false,
		claimedAt: null,
		paidAt: null,
		...overrides,
	}
}

describe('PaymentsPanel synthetic (no-payment) rows', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('shows a Mark paid button for a late-added player with no payment row', () => {
		render(
			<PaymentsPanel
				{...baseProps}
				payments={[row({ id: null, status: 'unpaid', userName: 'Philip' })]}
			/>,
		)
		expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy()
	})

	it('marks a no-payment player paid via the mark-entry-paid endpoint', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ status: 'paid' }), { status: 200 }))
		render(
			<PaymentsPanel
				{...baseProps}
				payments={[row({ id: null, status: 'unpaid', userId: 'u-philip', userName: 'Philip' })]}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/admin/mark-entry-paid/u-philip', {
				method: 'POST',
			}),
		)
	})

	it('does not offer the synthetic Mark paid for a real paid row (uses Dispute instead)', () => {
		render(<PaymentsPanel {...baseProps} payments={[row({ id: 'p1', status: 'paid' })]} />)
		expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull()
		expect(screen.getByRole('button', { name: 'Dispute' })).toBeTruthy()
	})
})
