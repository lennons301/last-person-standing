// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateGameForm } from './create-game-form'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const competitions = [{ id: 'c1', name: 'Premier League 2026/27', type: 'league' }]

/** Fill the form far enough for the later steps (visibility included) to show. */
function fillToStep3() {
	render(<CreateGameForm competitions={competitions} />)
	fireEvent.change(screen.getByLabelText('Game name'), { target: { value: 'The Lads LPS' } })
	// The competition select is a shadcn Select; its trigger opens a listbox.
	fireEvent.click(screen.getByRole('combobox', { name: /competition/i }))
	fireEvent.click(screen.getByRole('option', { name: 'Premier League 2026/27' }))
	fireEvent.click(screen.getByRole('button', { name: /classic/i }))
}

function submittedBody() {
	const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
	return JSON.parse(fetchMock.mock.calls[0][1].body)
}

describe('CreateGameForm — visibility', () => {
	beforeEach(() => {
		// jsdom implements none of these and Radix's Select reaches for all of them
		// when its listbox opens. Stubbing them is what lets the competition step —
		// and so everything downstream of it — be driven from a test.
		Element.prototype.scrollIntoView = vi.fn()
		Element.prototype.hasPointerCapture = vi.fn(() => false)
		Element.prototype.releasePointerCapture = vi.fn()
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		)
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'g1' }) }),
		)
	})

	it('offers both options with public selected on load', () => {
		fillToStep3()

		const publicOption = screen.getByRole('radio', { name: /public/i }) as HTMLInputElement
		const privateOption = screen.getByRole('radio', { name: /private/i }) as HTMLInputElement
		expect(publicOption.checked).toBe(true)
		expect(privateOption.checked).toBe(false)
	})

	it('sends public when the creator leaves the default alone', async () => {
		fillToStep3()

		fireEvent.click(screen.getByRole('button', { name: /create game/i }))

		await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
		expect(submittedBody().visibility).toBe('public')
	})

	it('sends private once the creator picks it', async () => {
		fillToStep3()

		fireEvent.click(screen.getByRole('radio', { name: /private/i }))
		fireEvent.click(screen.getByRole('button', { name: /create game/i }))

		await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
		expect(submittedBody().visibility).toBe('private')
	})
})
