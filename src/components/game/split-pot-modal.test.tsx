// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SplitPotModal } from './split-pot-modal'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('SplitPotModal', () => {
	it('Escape closes the modal', () => {
		const onClose = vi.fn()
		render(
			<SplitPotModal gameId="g1" aliveCount={3} potTotal="300.00" open={true} onClose={onClose} />,
		)
		fireEvent.keyDown(document.body, { key: 'Escape' })
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('renders dialog title for screen readers', () => {
		render(
			<SplitPotModal gameId="g1" aliveCount={3} potTotal="300.00" open={true} onClose={vi.fn()} />,
		)
		expect(screen.getByRole('dialog', { name: /split the pot/i })).toBeTruthy()
	})
})
