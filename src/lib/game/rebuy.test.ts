import { describe, expect, it } from 'vitest'
import { type IsRebuyEligibleArgs, isRebuyEligible } from './rebuy'

function base(overrides: Partial<IsRebuyEligibleArgs> = {}): IsRebuyEligibleArgs {
	return {
		game: {
			gameMode: 'classic',
			modeConfig: { allowRebuys: true },
		},
		gamePlayer: {
			status: 'eliminated',
			eliminatedRoundId: 'r1',
		},
		round1: { id: 'r1' },
		round2: { deadline: new Date('2026-05-10T12:00:00Z') },
		paymentRowCount: 1,
		now: new Date('2026-05-08T12:00:00Z'),
		...overrides,
	}
}

describe('isRebuyEligible', () => {
	it('returns true on the happy path', () => {
		expect(isRebuyEligible(base())).toBe(true)
	})

	it('false when gameMode !== classic', () => {
		expect(
			isRebuyEligible(base({ game: { gameMode: 'turbo', modeConfig: { allowRebuys: true } } })),
		).toBe(false)
	})

	it('false when allowRebuys is not true', () => {
		expect(isRebuyEligible(base({ game: { gameMode: 'classic', modeConfig: {} } }))).toBe(false)
		expect(
			isRebuyEligible(base({ game: { gameMode: 'classic', modeConfig: { allowRebuys: false } } })),
		).toBe(false)
	})

	it('false when player is still alive', () => {
		expect(
			isRebuyEligible(base({ gamePlayer: { status: 'alive', eliminatedRoundId: null } })),
		).toBe(false)
	})

	it('false when eliminated in a round other than round 1', () => {
		expect(
			isRebuyEligible(base({ gamePlayer: { status: 'eliminated', eliminatedRoundId: 'r2' } })),
		).toBe(false)
	})

	it('false when now >= round 2 deadline', () => {
		expect(isRebuyEligible(base({ now: new Date('2026-05-10T12:00:00Z') }))).toBe(false)
		expect(isRebuyEligible(base({ now: new Date('2026-05-10T12:00:01Z') }))).toBe(false)
	})

	it('false when paymentRowCount >= 2 (already rebought)', () => {
		expect(isRebuyEligible(base({ paymentRowCount: 2 }))).toBe(false)
		expect(isRebuyEligible(base({ paymentRowCount: 3 }))).toBe(false)
	})

	it('true when paymentRowCount is 0 (admin-added player, no initial payment)', () => {
		expect(isRebuyEligible(base({ paymentRowCount: 0 }))).toBe(true)
	})
})
