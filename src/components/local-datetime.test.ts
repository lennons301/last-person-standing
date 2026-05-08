import { describe, expect, it } from 'vitest'
import { formatLondon } from './local-datetime'

describe('formatLondon', () => {
	it('formats a UTC ISO string in Europe/London (BST in July)', () => {
		// 2026-07-15T14:00:00Z is 15:00 BST in London.
		const result = formatLondon('2026-07-15T14:00:00Z')
		expect(result).toContain('15:00')
		expect(result).toContain('Wed')
	})

	it('formats a UTC ISO string in Europe/London (GMT in January)', () => {
		// 2026-01-15T14:00:00Z is 14:00 GMT in London (no DST).
		const result = formatLondon('2026-01-15T14:00:00Z')
		expect(result).toContain('14:00')
		expect(result).toContain('Thu')
	})

	it('handles DST transitions deterministically', () => {
		// Spring forward: 2026-03-29 01:00 GMT becomes 02:00 BST.
		// A fixture at 2026-03-29T14:30:00Z is 15:30 BST (post-clock-change).
		const result = formatLondon('2026-03-29T14:30:00Z')
		expect(result).toContain('15:30')
	})

	it('accepts a Date object', () => {
		const d = new Date('2026-07-15T14:00:00Z')
		const result = formatLondon(d)
		expect(result).toContain('15:00')
	})

	it('respects custom format options', () => {
		const result = formatLondon('2026-07-15T14:00:00Z', {
			day: 'numeric',
			month: 'short',
		})
		// Should NOT contain time fields
		expect(result).not.toContain('15:00')
		expect(result).toContain('15')
		expect(result).toContain('Jul')
	})
})
