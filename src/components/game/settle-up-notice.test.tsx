// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SettleUpNotice } from './settle-up-notice'

const baseProps = {
	gameId: 'g1',
	paymentId: 'p1',
	amount: '10.00',
	creatorName: 'Alice',
}

function openDialog() {
	fireEvent.click(screen.getByRole('button', { name: /settle up/i }))
}

describe('SettleUpNotice pay link', () => {
	it('offers the pay link alongside "I\'ve paid" while the payment is pending', () => {
		render(
			<SettleUpNotice
				{...baseProps}
				status="pending"
				payUrl="https://monzo.me/alicejones/10.00?d=The%20Lads%20LPS%20Bob"
			/>,
		)
		openDialog()

		const link = screen.getByRole('link', { name: 'Pay Alice £10.00' })
		expect(link.getAttribute('href')).toBe(
			'https://monzo.me/alicejones/10.00?d=The%20Lads%20LPS%20Bob',
		)
		expect(screen.getByRole('button', { name: /I've paid/ })).toBeTruthy()
	})

	it('shows no pay link when the creator has saved no handle', () => {
		render(<SettleUpNotice {...baseProps} status="pending" payUrl={null} />)
		openDialog()

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByRole('button', { name: /I've paid/ })).toBeTruthy()
	})

	it('drops the pay link once the player has claimed the payment', () => {
		render(
			<SettleUpNotice {...baseProps} status="claimed" payUrl="https://monzo.me/alicejones/10.00" />,
		)
		openDialog()

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
	})
})
