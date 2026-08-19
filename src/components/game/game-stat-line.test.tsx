// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameStatLine } from '@/components/game/game-stat-line'
import type { GameViewStats } from '@/lib/game/game-view'

const stats: GameViewStats = {
	potConfirmed: '150.00',
	potPending: '20.00',
	potTotal: '170.00',
	potUnpaid: '30.00',
	potTarget: '200.00',
	aliveCount: 8,
	playerCount: 12,
	rebuyAvailable: false,
}

describe('GameStatLine', () => {
	it('shows the pot and how many players are still in', () => {
		render(<GameStatLine stats={stats} />)
		expect(screen.getByText('£150.00')).toBeTruthy()
		expect(screen.getByText('8')).toBeTruthy()
		expect(screen.getByText(/of\s+12 in/)).toBeTruthy()
	})

	it('keeps the pot breakdown behind a tap', () => {
		render(<GameStatLine stats={stats} />)

		expect(screen.queryByText('Confirmed')).toBeNull()

		const toggle = screen.getByRole('button', { name: /£150\.00 pot/ })
		expect(toggle.getAttribute('aria-expanded')).toBe('false')
		fireEvent.click(toggle)

		expect(toggle.getAttribute('aria-expanded')).toBe('true')
		for (const label of ['Confirmed', 'Pending', 'Unpaid', 'Target']) {
			expect(screen.getByText(label)).toBeTruthy()
		}
		expect(screen.getByText('£20.00')).toBeTruthy()
		expect(screen.getByText('£30.00')).toBeTruthy()
		expect(screen.getByText('£200.00')).toBeTruthy()

		fireEvent.click(toggle)
		expect(screen.queryByText('Confirmed')).toBeNull()
	})

	it('reports refunded money in the breakdown, below the rows that add up', () => {
		render(<GameStatLine stats={stats} refunded="25.00" />)
		fireEvent.click(screen.getByRole('button', { name: /£150\.00 pot/ }))

		const label = screen.getByText('Refunded to players')
		expect(label.nextElementSibling?.textContent).toBe('£25.00')
		// It's an aside, not part of the pot: the four rows that do add up keep
		// their figures, and the refunded one sits below them.
		const labels = Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent)
		expect(labels).toEqual(['Confirmed', 'Pending', 'Unpaid', 'Target', 'Refunded to players'])
	})

	// The wipeout shape, and the reason the row matters most: nobody got a pick
	// right, every stake went back, and `calculatePot` reports a pot of nothing.
	// Without this row the page reads as a game that was played for free.
	it('carries the only money on the line when a wipeout refunded every stake', () => {
		render(
			<GameStatLine
				stats={{
					...stats,
					potConfirmed: '0.00',
					potPending: '0.00',
					potTotal: '0.00',
					potUnpaid: '200.00',
				}}
				refunded="200.00"
			/>,
		)

		expect(screen.getByRole('button', { name: /£0\.00 pot/ })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: /£0\.00 pot/ }))

		const amounts = Array.from(document.querySelectorAll('dd')).map((dd) => dd.textContent)
		expect(amounts).toEqual(['£0.00', '£0.00', '£200.00', '£200.00', '£200.00'])
		expect(screen.getByText('Refunded to players').nextElementSibling?.textContent).toBe('£200.00')
	})

	it('omits the refunded line for a game that refunded nothing', () => {
		render(<GameStatLine stats={stats} refunded="0.00" />)
		fireEvent.click(screen.getByRole('button', { name: /£150\.00 pot/ }))

		expect(screen.getByText('Confirmed')).toBeTruthy()
		expect(screen.queryByText(/refunded/i)).toBeNull()
	})

	it('flags an available rebuy', () => {
		render(<GameStatLine stats={{ ...stats, rebuyAvailable: true }} />)
		expect(screen.getByText('Rebuy available')).toBeTruthy()
	})

	it('renders the unpaid notice inline on the line', () => {
		render(<GameStatLine stats={stats} unpaidNotice={<span>£10.00 unpaid — settle up</span>} />)
		expect(screen.getByText('£10.00 unpaid — settle up')).toBeTruthy()
	})
})
