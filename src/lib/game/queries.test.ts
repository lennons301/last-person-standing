import { describe, expect, it } from 'vitest'
import { isPastGame } from '@/lib/game/queries'

function game(overrides: Partial<Parameters<typeof isPastGame>[0]> = {}) {
	return {
		status: 'active' as const,
		myStatus: 'alive' as const,
		isRebuyEligible: false,
		...overrides,
	}
}

describe('isPastGame', () => {
	it('is true for a completed game', () => {
		expect(isPastGame(game({ status: 'completed' }))).toBe(true)
	})

	it('is true for a plain elimination', () => {
		expect(isPastGame(game({ myStatus: 'eliminated' }))).toBe(true)
	})

	it('is false for a week-1 elimination that is still rebuy-eligible', () => {
		expect(isPastGame(game({ myStatus: 'eliminated', isRebuyEligible: true }))).toBe(false)
	})

	it('is false for a live game', () => {
		expect(isPastGame(game())).toBe(false)
	})

	it('is false for a winner', () => {
		expect(isPastGame(game({ myStatus: 'winner' }))).toBe(false)
	})
})
