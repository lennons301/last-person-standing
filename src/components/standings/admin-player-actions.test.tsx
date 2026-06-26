// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh }),
}))
vi.mock('sonner', () => ({
	toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

import { AdminPlayerActions } from './admin-player-actions'

describe('AdminPlayerActions', () => {
	beforeEach(() => {
		refresh.mockClear()
		toastSuccess.mockClear()
		toastError.mockClear()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('links the ✎ action to the acting-as pick flow', () => {
		render(<AdminPlayerActions gameId="g1" playerId="gp1" userId="u1" playerName="Alice" />)
		const link = screen.getByTitle('Pick for Alice') as HTMLAnchorElement
		expect(link.getAttribute('href')).toBe('/game/g1?actingAs=gp1')
	})

	it('hides the ✕ remove action when there is no userId', () => {
		render(<AdminPlayerActions gameId="g1" playerId="gp1" playerName="Alice" />)
		expect(screen.queryByTitle('Remove Alice')).toBeNull()
	})

	it('removes the player via the endpoint and refreshes on success', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 200 }))
		render(<AdminPlayerActions gameId="g1" playerId="gp1" userId="u1" playerName="Alice" />)
		fireEvent.click(screen.getByTitle('Remove Alice'))
		await waitFor(() => expect(refresh).toHaveBeenCalled())
		expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/admin/remove-player/u1', {
			method: 'POST',
		})
		expect(toastSuccess).toHaveBeenCalledWith('Removed Alice')
	})

	it('does not call the endpoint when the confirm is dismissed', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false)
		const fetchMock = vi.spyOn(globalThis, 'fetch')
		render(<AdminPlayerActions gameId="g1" playerId="gp1" userId="u1" playerName="Alice" />)
		fireEvent.click(screen.getByTitle('Remove Alice'))
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('surfaces the player-has-picks error without refreshing', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ error: 'player-has-picks' }), { status: 409 }),
		)
		render(<AdminPlayerActions gameId="g1" playerId="gp1" userId="u1" playerName="Alice" />)
		fireEvent.click(screen.getByTitle('Remove Alice'))
		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith("Can't remove Alice — they've already made a pick"),
		)
		expect(refresh).not.toHaveBeenCalled()
	})
})
