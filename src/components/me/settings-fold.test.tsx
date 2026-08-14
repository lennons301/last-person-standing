// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}))

import { SettingsFold } from './settings-fold'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

function open() {
	fireEvent.click(screen.getByRole('button', { name: /settings/i }))
}

describe('SettingsFold', () => {
	it('starts collapsed — the handle is not on the page until it is opened', () => {
		render(<SettingsFold paymentProvider="monzo" paymentHandle="alicejones" />)

		expect(screen.queryByText('monzo.me/alicejones')).toBeNull()
		expect(screen.getByRole('button', { name: /settings/i }).getAttribute('aria-expanded')).toBe(
			'false',
		)
	})

	it('shows the saved handle when opened', () => {
		render(<SettingsFold paymentProvider="monzo" paymentHandle="alicejones" />)
		open()

		expect(screen.getByText('monzo.me/alicejones')).toBeTruthy()
	})

	it('says no link is set when the player has never saved one', () => {
		render(<SettingsFold paymentProvider={null} paymentHandle={null} />)
		open()

		expect(screen.getByText(/no payment link/i)).toBeTruthy()
	})

	// The point of the fold: a player who has never created a game can set the
	// handle here, through the endpoint that already existed.
	it('saves a first handle to the owner-only endpoint', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ provider: 'monzo', handle: 'bobsmith' }), { status: 200 }),
			)
		render(<SettingsFold paymentProvider={null} paymentHandle={null} />)
		open()

		fireEvent.click(screen.getByRole('button', { name: 'Edit payment link' }))
		fireEvent.click(screen.getByLabelText('Monzo'))
		fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'bobsmith' } })
		fireEvent.click(screen.getByRole('button', { name: 'Save payment link' }))

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/me/payment-handle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: 'monzo', handle: 'bobsmith' }),
			}),
		)
		// The page behind this is a server component, so the saved line has to come
		// from the response rather than from a re-render of the page.
		await waitFor(() => expect(screen.getByText('monzo.me/bobsmith')).toBeTruthy())
	})

	it('clears the handle when the field is emptied', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ provider: null, handle: null }), { status: 200 }),
			)
		render(<SettingsFold paymentProvider="monzo" paymentHandle="alicejones" />)
		open()

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
		await waitFor(() => expect(screen.getByText(/no payment link/i)).toBeTruthy())
	})

	it('opens on render only when the gallery asks it to', () => {
		render(<SettingsFold paymentProvider="revolut" paymentHandle="carol" defaultOpen />)

		expect(screen.getByText('revolut.me/carol')).toBeTruthy()
	})
})
