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

	it('flags an available rebuy', () => {
		render(<GameStatLine stats={{ ...stats, rebuyAvailable: true }} />)
		expect(screen.getByText('Rebuy available')).toBeTruthy()
	})

	it('renders the unpaid notice inline on the line', () => {
		render(<GameStatLine stats={stats} unpaidNotice={<span>£10.00 unpaid — settle up</span>} />)
		expect(screen.getByText('£10.00 unpaid — settle up')).toBeTruthy()
	})
})
