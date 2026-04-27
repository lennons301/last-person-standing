// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddPlayerModal } from './add-player-modal'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('AddPlayerModal', () => {
	it('Escape closes the modal', () => {
		const onClose = vi.fn()
		render(<AddPlayerModal gameId="g1" open={true} onClose={onClose} />)
		fireEvent.keyDown(document.body, { key: 'Escape' })
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('renders dialog title for screen readers', () => {
		render(<AddPlayerModal gameId="g1" open={true} onClose={vi.fn()} />)
		expect(screen.getByRole('dialog', { name: /add player/i })).toBeTruthy()
	})
})
