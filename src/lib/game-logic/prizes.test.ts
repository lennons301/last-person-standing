import { describe, expect, it } from 'vitest'
import { calculatePayouts, calculatePot } from './prizes'

describe('calculatePot', () => {
	it('multiplies entry fee by player count', () => {
		expect(calculatePot('10.00', 12)).toBe('120.00')
	})
	it('returns 0 when no entry fee', () => {
		expect(calculatePot(null, 12)).toBe('0.00')
	})
	it('handles decimal entry fees', () => {
		expect(calculatePot('7.50', 8)).toBe('60.00')
	})
})

describe('calculatePayouts', () => {
	it('gives full pot to single winner', () => {
		const payouts = calculatePayouts('100.00', ['w1'])
		expect(payouts).toEqual([{ userId: 'w1', amount: '100.00', isSplit: false }])
	})
	it('splits equally among multiple winners', () => {
		const payouts = calculatePayouts('100.00', ['w1', 'w2'])
		expect(payouts).toEqual([
			{ userId: 'w1', amount: '50.00', isSplit: true },
			{ userId: 'w2', amount: '50.00', isSplit: true },
		])
	})
	it('handles uneven splits with rounding', () => {
		const payouts = calculatePayouts('100.00', ['w1', 'w2', 'w3'])
		expect(payouts[0].amount).toBe('33.34')
		expect(payouts[1].amount).toBe('33.33')
		expect(payouts[2].amount).toBe('33.33')
	})
	it('returns empty for no winners', () => {
		expect(calculatePayouts('100.00', [])).toEqual([])
	})
})
