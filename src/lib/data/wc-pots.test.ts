import { describe, expect, it } from 'vitest'
import { FD_NAME_TO_WC_POT_NAME, getPotFor, potForTeamName, WC_2026_POTS } from './wc-pots'

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

	it('potForTeamName returns null for an unknown name', () => {
		expect(potForTeamName('Italy')).toBeNull()
	})

	describe('FD_NAME_TO_WC_POT_NAME alias map', () => {
		it('every alias target is a real WC_2026_POTS name', () => {
			// A typo in a value would make the alias resolve to nothing — guard it.
			const potNames = new Set(WC_2026_POTS.map((t) => t.name.toLowerCase()))
			for (const [alias, target] of Object.entries(FD_NAME_TO_WC_POT_NAME)) {
				expect(potNames.has(target.toLowerCase()), `alias "${alias}" → "${target}"`).toBe(true)
			}
		})

		it('every alias resolves to a pot via potForTeamName', () => {
			for (const alias of Object.keys(FD_NAME_TO_WC_POT_NAME)) {
				expect(potForTeamName(alias), `alias "${alias}"`).not.toBeNull()
			}
		})

		it('keys are stored lower-cased so case-insensitive lookup hits them', () => {
			for (const key of Object.keys(FD_NAME_TO_WC_POT_NAME)) {
				expect(key).toBe(key.toLowerCase())
			}
		})

		it('resolves the known assumed mismatches to the right pot', () => {
			// Spot-check the headline cases from issue #67. These spellings are
			// ASSUMPTIONS pending the #65 spike (see TODO in wc-pots.ts).
			expect(potForTeamName('Korea Republic')).toBe(potForTeamName('South Korea'))
			expect(potForTeamName('Czech Republic')).toBe(potForTeamName('Czechia'))
			expect(potForTeamName('Türkiye')).toBe(potForTeamName('Turkey'))
			expect(potForTeamName('Cape Verde')).toBe(potForTeamName('Cape Verde Islands'))
			expect(potForTeamName('DR Congo')).toBe(potForTeamName('Congo DR'))
			expect(potForTeamName('Bosnia and Herzegovina')).toBe(potForTeamName('Bosnia-Herzegovina'))
			expect(potForTeamName('Curacao')).toBe(potForTeamName('Curaçao'))
		})
	})
})
