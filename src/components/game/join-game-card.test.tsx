// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn() }),
}))

import { JOIN_BLOCKED_COPY } from '@/lib/game/joinability'
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

describe('JoinGameCard when the join is rejected mid-flight', () => {
	/**
	 * The page renders a join button while the game is still open and the deadline
	 * passes before it's pressed. The route answers with a code in `error` and the
	 * sentence in `message` — the sentence is what the player has to see.
	 */
	it('shows the route’s message rather than its error code', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: () =>
					Promise.resolve({
						error: JOIN_BLOCKED_COPY.started.code,
						message: JOIN_BLOCKED_COPY.started.message,
					}),
			}),
		)

		render(<JoinGameCard {...baseProps} entryFee={null} payUrl={null} />)
		fireEvent.click(screen.getByRole('button', { name: 'Join game' }))

		await waitFor(() => {
			expect(screen.getByText(JOIN_BLOCKED_COPY.started.message)).toBeTruthy()
		})
		expect(screen.queryByText(JOIN_BLOCKED_COPY.started.code)).toBeNull()

		vi.unstubAllGlobals()
	})

	it('keeps the older sentence-shaped errors that carry no message', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: () => Promise.resolve({ error: 'Game is full' }),
			}),
		)

		render(<JoinGameCard {...baseProps} entryFee={null} payUrl={null} />)
		fireEvent.click(screen.getByRole('button', { name: 'Join game' }))

		await waitFor(() => {
			expect(screen.getByText('Game is full')).toBeTruthy()
		})

		vi.unstubAllGlobals()
	})
})

describe('JoinGameCard when the game has started', () => {
	const started = JOIN_BLOCKED_COPY.started

	it('says the game has started and that the admin can add you', () => {
		render(<JoinGameCard {...baseProps} entryFee="10.00" payUrl={null} blocked={started} />)

		expect(screen.getByText(started.heading)).toBeTruthy()
		expect(screen.getByText(/admin can still add you/i)).toBeTruthy()
	})

	it('offers no join button — there is nothing to join', () => {
		render(<JoinGameCard {...baseProps} entryFee="10.00" payUrl={null} blocked={started} />)

		expect(screen.queryByRole('button', { name: 'Join game' })).toBeNull()
	})

	it('asks for no payment for a game that cannot be entered', () => {
		render(
			<JoinGameCard
				{...baseProps}
				entryFee="10.00"
				payUrl="https://monzo.me/alicejones/10.00"
				blocked={started}
			/>,
		)

		expect(screen.queryByRole('link', { name: /^Pay / })).toBeNull()
		expect(screen.queryByText(/collect payment separately/i)).toBeNull()
	})

	it('still names the game, so the person following the link knows which one it was', () => {
		render(<JoinGameCard {...baseProps} entryFee={null} payUrl={null} blocked={started} />)

		expect(screen.getByRole('heading', { name: 'The Lads LPS' })).toBeTruthy()
	})

	it('says a finished game has finished rather than that it has started', () => {
		render(
			<JoinGameCard
				{...baseProps}
				entryFee={null}
				payUrl={null}
				blocked={JOIN_BLOCKED_COPY.completed}
			/>,
		)

		expect(screen.getByText(JOIN_BLOCKED_COPY.completed.heading)).toBeTruthy()
		expect(screen.queryByRole('button', { name: 'Join game' })).toBeNull()
	})
})
