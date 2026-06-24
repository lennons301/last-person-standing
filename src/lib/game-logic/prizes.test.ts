import { describe, expect, it } from 'vitest'
import { calculatePayouts, calculatePot, expectedEntryCount } from './prizes'

describe('expectedEntryCount', () => {
	it('counts one entry per player when there are no rebuys', () => {
		// c has no payment row yet but still owes the original entry.
		expect(
			expectedEntryCount(
				['a', 'b', 'c'],
				[
					{ userId: 'a', status: 'paid' },
					{ userId: 'b', status: 'pending' },
				],
			),
		).toBe(3)
	})
	it('counts a rebuy as a second entry for that player', () => {
		expect(
			expectedEntryCount(
				['a', 'b'],
				[
					{ userId: 'a', status: 'paid' },
					{ userId: 'a', status: 'pending' }, // rebuy
					{ userId: 'b', status: 'paid' },
				],
			),
		).toBe(3)
	})
	it('excludes refunded rows', () => {
		expect(
			expectedEntryCount(
				['a'],
				[
					{ userId: 'a', status: 'paid' },
					{ userId: 'a', status: 'refunded' },
				],
			),
		).toBe(1)
	})
})

describe('calculatePot', () => {
	it('returns all zeros on empty input', () => {
		expect(calculatePot([])).toEqual({ confirmed: '0.00', pending: '0.00', total: '0.00' })
	})

	it('sums paid rows into confirmed', () => {
		expect(
			calculatePot([
				{ amount: '10.00', status: 'paid' },
				{ amount: '10.00', status: 'paid' },
			]),
		).toEqual({ confirmed: '20.00', pending: '0.00', total: '20.00' })
	})

	it('separates claimed into pending', () => {
		expect(
			calculatePot([
				{ amount: '10.00', status: 'paid' },
				{ amount: '10.00', status: 'claimed' },
			]),
		).toEqual({ confirmed: '10.00', pending: '10.00', total: '20.00' })
	})

	it('ignores pending and refunded', () => {
		expect(
			calculatePot([
				{ amount: '10.00', status: 'paid' },
				{ amount: '10.00', status: 'pending' },
				{ amount: '10.00', status: 'refunded' },
			]),
		).toEqual({ confirmed: '10.00', pending: '0.00', total: '10.00' })
	})

	it('handles multiple payments per player (rebuy pre-wiring)', () => {
		expect(
			calculatePot([
				{ amount: '10.00', status: 'paid' },
				{ amount: '10.00', status: 'paid' }, // rebuy
			]),
		).toEqual({ confirmed: '20.00', pending: '0.00', total: '20.00' })
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
