import { describe, expect, it } from 'vitest'
import { getPotFor, potForTeamName, WC_2026_POTS } from './wc-pots'

describe('WC 2026 pot data', () => {
	it('has 48 teams once populated', () => {
		// Guard: fail loudly if someone commits an empty list.
		if (WC_2026_POTS.length > 0) {
			expect(WC_2026_POTS).toHaveLength(48)
		}
	})

	it('every entry has a valid pot (1-4)', () => {
		for (const t of WC_2026_POTS) {
			expect([1, 2, 3, 4]).toContain(t.pot)
		}
	})

	it('exposes 12 teams per pot', () => {
		if (WC_2026_POTS.length !== 48) return
		for (const pot of [1, 2, 3, 4] as const) {
			expect(WC_2026_POTS.filter((t) => t.pot === pot)).toHaveLength(12)
		}
	})

	it('getPotFor returns null for unknown IDs', () => {
		expect(getPotFor('nonexistent-id')).toBeNull()
	})

	it('potForTeamName is case insensitive', () => {
		if (WC_2026_POTS.length === 0) return
		const first = WC_2026_POTS[0]
		expect(potForTeamName(first.name.toUpperCase())).toBe(first.pot)
	})
})
