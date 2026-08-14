// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { RebuyOfferNotice, RebuyPendingNotice } from './rebuy-actions'

// Ported from the deleted rebuy-banner.test.tsx: the pay-the-creator link
// (#142) now rides the rebuy notices / hero action instead of the old banner.
describe('rebuy pay link', () => {
	it('offers a pay link for the rebuy amount once a rebuy is pending', () => {
		render(
			<RebuyPendingNotice
				gameId="g1"
				entryFee="10.00"
				pendingPayment={{ id: 'p1', amount: '10.00' }}
				creatorName="Alice"
				payUrl="https://revolut.me/alicejones"
			/>,
		)

		const link = screen.getByRole('link', { name: 'Pay Alice £10.00' })
		expect(link.getAttribute('href')).toBe('https://revolut.me/alicejones')
		expect(screen.getByRole('button', { name: /claim paid/i })).toBeTruthy()
	})

	it('keeps the claim button alone when the creator has no handle', () => {
		render(
			<RebuyPendingNotice
				gameId="g1"
				entryFee="10.00"
				pendingPayment={{ id: 'p1', amount: '10.00' }}
				creatorName="Alice"
				payUrl={null}
			/>,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByRole('button', { name: /claim paid/i })).toBeTruthy()
	})

	it('shows no pay link on the standing offer, before a rebuy has been started', () => {
		render(
			<RebuyOfferNotice
				gameId="g1"
				entryFee="10.00"
				closesAt={new Date('2026-08-20T18:00:00Z')}
				creatorName="Alice"
			/>,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByRole('button', { name: /Rebuy £10.00/ })).toBeTruthy()
	})

	// The offer is time-boxed, so the deadline is the one detail worth keeping
	// from the old banner (review finding on PR #145).
	it('names the round-2 deadline on the standing offer', () => {
		render(
			<RebuyOfferNotice
				gameId="g1"
				entryFee="10.00"
				closesAt={new Date('2026-08-20T18:00:00Z')}
				creatorName="Alice"
			/>,
		)

		expect(screen.getByText(/it closes/)).toBeTruthy()
		// LocalDateTime's default format is weekday/day/month + time (no year),
		// rendered en-GB / Europe/London on first paint.
		expect(screen.getByText(/20 Aug/)).toBeTruthy()
	})
})
