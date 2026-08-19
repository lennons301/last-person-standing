import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDeadline } from './format'

/**
 * `formatDeadline` reads `new Date()` itself, so the clock is injected with
 * vitest's fake timers rather than by argument: every deadline below is built
 * as an offset from `NOW`, which never moves during the run.
 */
const NOW = new Date('2026-08-19T12:00:00.000Z')

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A deadline `ms` from the frozen now (negative for the past). */
function deadlineIn(ms: number): Date {
	return new Date(NOW.getTime() + ms)
}

describe('formatDeadline', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe('a deadline in the past', () => {
		it('reads Passed', () => {
			expect(formatDeadline(deadlineIn(-5 * MINUTE))).toBe('Passed')
		})

		it('reads Passed a whole day after the deadline', () => {
			expect(formatDeadline(deadlineIn(-3 * DAY))).toBe('Passed')
		})

		it('reads Passed one millisecond after the deadline', () => {
			expect(formatDeadline(deadlineIn(-1))).toBe('Passed')
		})
	})

	describe('under an hour', () => {
		it('reads whole minutes', () => {
			expect(formatDeadline(deadlineIn(45 * MINUTE))).toBe('45m')
		})

		it('floors part-minutes rather than rounding', () => {
			expect(formatDeadline(deadlineIn(45 * MINUTE + 59 * SECOND))).toBe('45m')
		})

		it('reads 0m on the deadline itself', () => {
			expect(formatDeadline(deadlineIn(0))).toBe('0m')
		})

		it('reads 0m with under a minute to go', () => {
			expect(formatDeadline(deadlineIn(59 * SECOND))).toBe('0m')
		})

		it('reads 59m at the last moment under the hour', () => {
			expect(formatDeadline(deadlineIn(HOUR - 1))).toBe('59m')
		})
	})

	describe('under a day', () => {
		it('reads hours and minutes', () => {
			expect(formatDeadline(deadlineIn(5 * HOUR + 30 * MINUTE))).toBe('5h 30m')
		})

		it('reads 1h 0m at the hour boundary', () => {
			expect(formatDeadline(deadlineIn(HOUR))).toBe('1h 0m')
		})

		it('keeps a zero minute component', () => {
			expect(formatDeadline(deadlineIn(7 * HOUR))).toBe('7h 0m')
		})

		it('floors part-minutes rather than rounding', () => {
			expect(formatDeadline(deadlineIn(2 * HOUR + 15 * MINUTE + 59 * SECOND))).toBe('2h 15m')
		})

		it('reads 23h 59m at the last moment under the day', () => {
			expect(formatDeadline(deadlineIn(DAY - 1))).toBe('23h 59m')
		})
	})

	describe('a day or more', () => {
		it('reads 1d at the day boundary', () => {
			expect(formatDeadline(deadlineIn(DAY))).toBe('1d')
		})

		it('drops the hours once past a day', () => {
			expect(formatDeadline(deadlineIn(DAY + 13 * HOUR))).toBe('1d')
		})

		it('still reads 1d at the last moment under two days', () => {
			expect(formatDeadline(deadlineIn(2 * DAY - 1))).toBe('1d')
		})

		it('reads 2d at the two-day boundary', () => {
			expect(formatDeadline(deadlineIn(2 * DAY))).toBe('2d')
		})

		it('floors whole days for a distant deadline', () => {
			expect(formatDeadline(deadlineIn(38 * DAY + 6 * HOUR))).toBe('38d')
		})
	})
})
