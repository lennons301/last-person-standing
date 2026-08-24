import { describe, expect, it } from 'vitest'
import { arePicksLocked, deriveGameRoundStatus } from './round-status'

const ROUND = {
	id: 'r5',
	number: 5,
	status: 'upcoming' as const,
	deadline: new Date('2026-06-15T12:00:00Z'),
}

describe('deriveGameRoundStatus', () => {
	it("returns 'open' when round is the game's current round and deadline is in the future", () => {
		const status = deriveGameRoundStatus({
			round: ROUND,
			game: { currentRoundId: 'r5', currentRoundNumber: 5 },
			now: new Date('2026-05-01T12:00:00Z'), // long before deadline
		})
		expect(status).toBe('open')
	})

	it("returns 'active' when round is current and deadline has passed", () => {
		const status = deriveGameRoundStatus({
			round: ROUND,
			game: { currentRoundId: 'r5', currentRoundNumber: 5 },
			now: new Date('2026-06-15T13:00:00Z'), // past deadline
		})
		expect(status).toBe('active')
	})

	it("returns 'completed' when round.status is 'completed' even if it's still currentRoundId", () => {
		const status = deriveGameRoundStatus({
			round: { ...ROUND, status: 'completed' },
			game: { currentRoundId: 'r5', currentRoundNumber: 5 },
			now: new Date('2026-06-15T12:00:00Z'),
		})
		expect(status).toBe('completed')
	})

	it("returns 'upcoming' when round is in the game's future (number > currentRoundNumber)", () => {
		const status = deriveGameRoundStatus({
			round: ROUND,
			game: { currentRoundId: 'r1', currentRoundNumber: 1 },
			now: new Date('2026-05-01T12:00:00Z'),
		})
		expect(status).toBe('upcoming')
	})

	it("returns 'completed' when round is in the game's past (number < currentRoundNumber)", () => {
		const status = deriveGameRoundStatus({
			round: ROUND,
			game: { currentRoundId: 'r10', currentRoundNumber: 10 },
			now: new Date('2026-06-15T12:00:00Z'),
		})
		expect(status).toBe('completed')
	})

	it("returns 'completed' when game is over (currentRoundId is null)", () => {
		const status = deriveGameRoundStatus({
			round: ROUND,
			game: { currentRoundId: null, currentRoundNumber: null },
			now: new Date('2026-06-15T12:00:00Z'),
		})
		expect(status).toBe('completed')
	})

	it("returns 'open' when there is no deadline (defensive case)", () => {
		const status = deriveGameRoundStatus({
			round: { ...ROUND, deadline: null },
			game: { currentRoundId: 'r5', currentRoundNumber: 5 },
			now: new Date('2026-06-15T12:00:00Z'),
		})
		expect(status).toBe('open')
	})

	it('treats different round id and matching number as past round (game has advanced)', () => {
		// game's currentRound is 'r6' number 6 — but ROUND with number 5 is in the past.
		const status = deriveGameRoundStatus({
			round: ROUND, // number 5
			game: { currentRoundId: 'r6', currentRoundNumber: 6 },
			now: new Date('2026-05-01T12:00:00Z'),
		})
		expect(status).toBe('completed')
	})
})

describe('arePicksLocked', () => {
	const NOW = new Date('2026-06-15T12:00:00Z')

	it('locks a round whose own deadline has gone', () => {
		expect(
			arePicksLocked({ status: 'active', deadline: new Date('2026-06-15T11:00:00Z') }, NOW),
		).toBe(true)
	})

	it('locks a processed round even with no deadline recorded', () => {
		expect(arePicksLocked({ status: 'completed', deadline: null }, NOW)).toBe(true)
	})

	it('leaves a round whose deadline is still to come unlocked', () => {
		expect(
			arePicksLocked({ status: 'upcoming', deadline: new Date('2026-06-15T13:00:00Z') }, NOW),
		).toBe(false)
	})

	it('leaves a round with no deadline recorded unlocked — nothing has closed', () => {
		expect(arePicksLocked({ status: 'upcoming', deadline: null }, NOW)).toBe(false)
	})

	it('stays keyed on the round when the game is over (#225)', () => {
		// A completed game has no currentRoundId, so deriveGameRoundStatus reports
		// 'completed' for every round — including a future gameweek still carrying
		// an advance pick. This rule reads the round itself and says otherwise.
		const future = {
			id: 'r13',
			number: 13,
			status: 'upcoming' as const,
			deadline: new Date('2026-08-15T12:00:00Z'),
		}
		expect(
			deriveGameRoundStatus({
				round: future,
				game: { currentRoundId: null, currentRoundNumber: null },
				now: NOW,
			}),
		).toBe('completed')
		expect(arePicksLocked(future, NOW)).toBe(false)
	})
})
