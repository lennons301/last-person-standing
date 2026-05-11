import { describe, expect, it } from 'vitest'
import { getPotFor, potForTeamName, WC_2026_POTS } from './wc-pots'

describe('WC 2026 pot data', () => {
	it('has exactly 48 teams', () => {
		expect(WC_2026_POTS).toHaveLength(48)
	})

	it('every entry has a valid pot (1-4)', () => {
		for (const t of WC_2026_POTS) {
			expect([1, 2, 3, 4]).toContain(t.pot)
		}
	})

	it('exposes 12 teams per pot', () => {
		for (const pot of [1, 2, 3, 4] as const) {
			expect(WC_2026_POTS.filter((t) => t.pot === pot)).toHaveLength(12)
		}
	})

	it('has no tbd placeholders — playoffs resolved March 2026', () => {
		expect(WC_2026_POTS.filter((t) => t.tbd)).toHaveLength(0)
	})

	it('has no placeholder names', () => {
		const placeholders = WC_2026_POTS.filter((t) => /playoff winner|tbd|placeholder/i.test(t.name))
		expect(placeholders).toEqual([])
	})

	it('has no duplicate team names', () => {
		const names = WC_2026_POTS.map((t) => t.name.toLowerCase())
		expect(new Set(names).size).toBe(names.length)
	})

	it('getPotFor returns null for unknown IDs', () => {
		expect(getPotFor('nonexistent-id')).toBeNull()
	})

	it('potForTeamName is case insensitive', () => {
		const first = WC_2026_POTS[0]
		expect(potForTeamName(first.name.toUpperCase())).toBe(first.pot)
	})
})
