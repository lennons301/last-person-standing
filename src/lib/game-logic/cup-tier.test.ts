import { describe, expect, it } from 'vitest'
import { computeTierDifference } from './cup-tier'

describe('computeTierDifference', () => {
	const pot1 = { externalIds: { fifa_pot: 1 } }
	const pot4 = { externalIds: { fifa_pot: 4 } }
	const pot2 = { externalIds: { fifa_pot: 2 } }
	const noPot = { externalIds: {} }

	it('returns positive when home is the stronger side (lower pot number)', () => {
		// pot 1 = strongest. Spain (pot 1) home vs Cape Verde (pot 4) away
		// → home 3 tiers stronger → +3.
		expect(computeTierDifference(pot1, pot4, 'group_knockout')).toBe(3)
		// Inverse: away is much stronger → home is 3 tiers weaker → -3.
		expect(computeTierDifference(pot4, pot1, 'group_knockout')).toBe(-3)
		// Pot 1 home vs pot 2 away: home 1 tier stronger → +1.
		expect(computeTierDifference(pot1, pot2, 'group_knockout')).toBe(1)
	})

	it('returns 0 when a pot is missing', () => {
		expect(computeTierDifference(pot1, noPot, 'group_knockout')).toBe(0)
	})

	it('returns 0 for non-cup competition types', () => {
		expect(computeTierDifference(pot1, pot4, 'league')).toBe(0)
		expect(computeTierDifference(pot1, pot4, 'knockout')).toBe(0)
	})
})
