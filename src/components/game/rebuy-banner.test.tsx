// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { RebuyBanner } from './rebuy-banner'

const baseProps = {
	gameId: 'g1',
	entryFee: '10.00',
	round2Deadline: new Date('2026-08-20T18:00:00Z'),
	creatorName: 'Alice',
}

describe('RebuyBanner pay link', () => {
	it('offers a pay link for the rebuy amount once a rebuy is pending', () => {
		render(
			<RebuyBanner
				{...baseProps}
				pendingPayment={{ id: 'p1', amount: '10.00' }}
				payUrl="https://revolut.me/alicejones/10.00gbp"
			/>,
		)

		const link = screen.getByRole('link', { name: 'Pay Alice £10.00' })
		expect(link.getAttribute('href')).toBe('https://revolut.me/alicejones/10.00gbp')
		expect(screen.getByRole('button', { name: /claim paid/i })).toBeTruthy()
	})

	it('keeps the claim button alone when the creator has no handle', () => {
		render(
			<RebuyBanner {...baseProps} pendingPayment={{ id: 'p1', amount: '10.00' }} payUrl={null} />,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByRole('button', { name: /claim paid/i })).toBeTruthy()
	})

	it('shows no pay link before a rebuy has been started', () => {
		render(
			<RebuyBanner
				{...baseProps}
				pendingPayment={null}
				payUrl="https://revolut.me/alicejones/10.00gbp"
			/>,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByRole('button', { name: /Rebuy £10.00/ })).toBeTruthy()
	})
})
