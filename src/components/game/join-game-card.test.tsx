// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn() }),
}))

import { JoinGameCard } from './join-game-card'

const baseProps = {
	gameId: 'g1',
	name: 'The Lads LPS',
	mode: 'classic',
	competition: 'Premier League 2026/27',
	playerCount: 4,
	creatorName: 'Alice',
	payUrl: null as string | null,
}

describe('JoinGameCard pay link', () => {
	it('offers a pay link when there is an entry fee and the creator has a handle', () => {
		render(
			<JoinGameCard
				{...baseProps}
				entryFee="10.00"
				payUrl="https://monzo.me/alicejones/10.00?d=The%20Lads%20LPS%20Bob"
			/>,
		)

		const link = screen.getByRole('link', { name: 'Pay Alice £10.00' })
		expect(link.getAttribute('href')).toBe(
			'https://monzo.me/alicejones/10.00?d=The%20Lads%20LPS%20Bob',
		)
		expect(screen.queryByText(/collect payment separately/i)).toBeNull()
	})

	it('falls back to the manual text when the creator has no handle', () => {
		render(<JoinGameCard {...baseProps} entryFee="10.00" payUrl={null} />)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.getByText(/collect payment separately/i)).toBeTruthy()
	})

	it('shows no payment prompt at all when the game has no entry fee', () => {
		render(
			<JoinGameCard {...baseProps} entryFee={null} payUrl="https://monzo.me/alicejones/10.00" />,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.queryByText(/collect payment separately/i)).toBeNull()
	})

	it('never gates joining on payment — the join button stands on its own', () => {
		render(<JoinGameCard {...baseProps} entryFee="10.00" payUrl="https://monzo.me/a/10.00" />)

		const join = screen.getByRole('button', { name: 'Join game' })
		expect(join.hasAttribute('disabled')).toBe(false)
	})
})
