import { describe, expect, it } from 'vitest'
import { type IsRebuyEligibleArgs, isRebuyEligible } from './rebuy'

function base(overrides: Partial<IsRebuyEligibleArgs> = {}): IsRebuyEligibleArgs {
	return {
		modeConfig: { mode: 'classic', allowRebuys: true },
		gamePlayer: {
			status: 'eliminated',
			eliminatedRoundId: 'gw12',
		},
		// The game's own opening round — 'gw12' rather than 'r1', because a game that
		// started in November is the case this rule has to get right (#203).
		startingRound: { id: 'gw12' },
		roundAfterStarting: { deadline: new Date('2026-05-10T12:00:00Z') },
		paymentRowCount: 1,
		now: new Date('2026-05-08T12:00:00Z'),
		...overrides,
	}
}

describe('isRebuyEligible', () => {
	it('returns true on the happy path', () => {
		expect(isRebuyEligible(base())).toBe(true)
	})

	it('false when the mode is not classic', () => {
		expect(isRebuyEligible(base({ modeConfig: { mode: 'turbo', numberOfPicks: 10 } }))).toBe(false)
	})

	it('false when allowRebuys is not true', () => {
		expect(isRebuyEligible(base({ modeConfig: { mode: 'classic', allowRebuys: false } }))).toBe(
			false,
		)
	})

	it('false when player is still alive', () => {
		expect(
			isRebuyEligible(base({ gamePlayer: { status: 'alive', eliminatedRoundId: null } })),
		).toBe(false)
	})

	it('false when eliminated in a round other than the starting round', () => {
		expect(
			isRebuyEligible(base({ gamePlayer: { status: 'eliminated', eliminatedRoundId: 'gw13' } })),
		).toBe(false)
	})

	it("false when eliminated in the competition's round 1, which this game never played", () => {
		// A mid-season game's opening round is gameweek 12. An elimination carrying
		// the competition's gameweek-1 round can't be an exit from *this* game's
		// opening round, so it buys nothing back.
		expect(
			isRebuyEligible(base({ gamePlayer: { status: 'eliminated', eliminatedRoundId: 'gw1' } })),
		).toBe(false)
	})

	it('false when now >= the deadline of the round after the starting round', () => {
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
