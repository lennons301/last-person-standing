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
	entryFee: '10.00',
	gameStatus: 'active',
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
		canReinstate: false,
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

describe('PaymentsPanel reinstatement (#280)', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('offers no reinstatement for a player who is in the game', () => {
		render(<PaymentsPanel {...baseProps} payments={[row({ status: 'paid' })]} />)
		expect(screen.queryByRole('button', { name: 'Put back in' })).toBeNull()
	})

	it('puts an eliminated player back in without creating an entry', async () => {
		// The paid-rebuy dead end: the money is in, the player is out, and the
		// rebuy routes refuse because a second payment row already exists.
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ status: 'alive' }), { status: 200 }))
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(
			<PaymentsPanel
				{...baseProps}
				payments={[
					row({ userId: 'u-martin', userName: 'Martin', status: 'paid', canReinstate: true }),
				]}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Put back in' }))
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/admin/reinstate/u-martin', {
				method: 'POST',
			}),
		)
		// Nothing else was called — in particular no add-rebuy, which would charge
		// a second entry fee to undo the first one.
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('does nothing if the admin backs out of the confirm', () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch')
		vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(
			<PaymentsPanel {...baseProps} payments={[row({ status: 'paid', canReinstate: true })]} />,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Put back in' }))
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe('PaymentsPanel entry-fee editor', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('shows the current entry fee', () => {
		render(<PaymentsPanel {...baseProps} entryFee="10.00" payments={[]} />)
		expect(screen.getByText('£10.00')).toBeTruthy()
	})

	it('posts the new fee to the entry-fee endpoint on save', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ ok: true, entryFee: '15.00' }), { status: 200 }),
			)
		render(<PaymentsPanel {...baseProps} entryFee="10.00" payments={[]} />)
		fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
		fireEvent.change(screen.getByLabelText('New entry fee'), { target: { value: '15' } })
		fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/admin/entry-fee', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ entryFee: '15' }),
			}),
		)
	})

	it('hides the Edit control once the game is completed', () => {
		render(<PaymentsPanel {...baseProps} gameStatus="completed" entryFee="10.00" payments={[]} />)
		expect(screen.getByText('£10.00')).toBeTruthy()
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
	})
})

describe('PaymentsPanel pay-me handle editor', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('shows the saved handle players are pointed at', () => {
		render(
			<PaymentsPanel
				{...baseProps}
				paymentProvider="monzo"
				paymentHandle="alicejones"
				payments={[]}
			/>,
		)
		expect(screen.getByText('monzo.me/alicejones')).toBeTruthy()
	})

	it('says no link is set up when the creator has saved no handle', () => {
		render(
			<PaymentsPanel {...baseProps} paymentProvider={null} paymentHandle={null} payments={[]} />,
		)
		expect(screen.getByText(/no payment link/i)).toBeTruthy()
	})

	it('saves an edited handle to the owner-only endpoint', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ provider: 'revolut', handle: 'bobsmith' }), { status: 200 }),
			)
		render(
			<PaymentsPanel
				{...baseProps}
				paymentProvider="monzo"
				paymentHandle="alicejones"
				payments={[]}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Edit payment link' }))
		fireEvent.click(screen.getByLabelText('Revolut'))
		fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'bobsmith' } })
		fireEvent.click(screen.getByRole('button', { name: 'Save payment link' }))

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/me/payment-handle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: 'revolut', handle: 'bobsmith' }),
			}),
		)
	})

	it('clears the handle when the creator empties the field', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ provider: null, handle: null }), { status: 200 }),
			)
		render(
			<PaymentsPanel
				{...baseProps}
				paymentProvider="monzo"
				paymentHandle="alicejones"
				payments={[]}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Edit payment link' }))
		fireEvent.change(screen.getByLabelText(/username/i), { target: { value: '' } })
		fireEvent.click(screen.getByRole('button', { name: 'Save payment link' }))

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/me/payment-handle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: null, handle: '' }),
			}),
		)
	})
})
