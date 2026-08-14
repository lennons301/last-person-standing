import { describe, expect, it } from 'vitest'
import {
	isGameStartingRound,
	resolveRoundAfterStarting,
	resolveStartingRound,
} from './starting-round'

/** A league season's rounds, as the competition sequence hands them over. */
const ROUNDS = [
	{ id: 'gw1', number: 1 },
	{ id: 'gw2', number: 2 },
	{ id: 'gw12', number: 12 },
	{ id: 'gw13', number: 13 },
	{ id: 'gw38', number: 38 },
]

describe('resolveStartingRound', () => {
	it('finds the round the game was created on, wherever in the season that is', () => {
		expect(resolveStartingRound({ startingRoundId: 'gw12' }, ROUNDS)).toEqual({
			id: 'gw12',
			number: 12,
		})
	})

	it('finds gameweek one for a game that started there', () => {
		expect(resolveStartingRound({ startingRoundId: 'gw1' }, ROUNDS)).toEqual({
			id: 'gw1',
			number: 1,
		})
	})

	it('is null for a game with no starting round recorded', () => {
		expect(resolveStartingRound({ startingRoundId: null }, ROUNDS)).toBeNull()
		expect(resolveStartingRound({}, ROUNDS)).toBeNull()
	})

	it("is null when the round isn't in the sequence handed over", () => {
		expect(resolveStartingRound({ startingRoundId: 'other-competition' }, ROUNDS)).toBeNull()
	})
})

describe('resolveRoundAfterStarting', () => {
	it('is the next round in the sequence, not the starting number plus one', () => {
		// gw12 → gw13 is the ordinary case; gw2 → gw12 is what makes the point, since
		// a competition's round numbers need not be contiguous.
		expect(resolveRoundAfterStarting({ startingRoundId: 'gw12' }, ROUNDS)).toMatchObject({
			id: 'gw13',
		})
		expect(resolveRoundAfterStarting({ startingRoundId: 'gw2' }, ROUNDS)).toMatchObject({
			id: 'gw12',
		})
	})

	it('is round 2 for a game that started at gameweek one — the old behaviour', () => {
		expect(resolveRoundAfterStarting({ startingRoundId: 'gw1' }, ROUNDS)).toMatchObject({
			id: 'gw2',
		})
	})

	it('does not depend on the order the rounds arrive in', () => {
		const shuffled = [...ROUNDS].reverse()
		expect(resolveRoundAfterStarting({ startingRoundId: 'gw12' }, shuffled)).toMatchObject({
			id: 'gw13',
		})
	})

	it('is null when the starting round is the last one, or there is none', () => {
		expect(resolveRoundAfterStarting({ startingRoundId: 'gw38' }, ROUNDS)).toBeNull()
		expect(resolveRoundAfterStarting({ startingRoundId: null }, ROUNDS)).toBeNull()
	})
})

describe('isGameStartingRound', () => {
	it('is an id match against the game’s own starting round', () => {
		expect(isGameStartingRound({ startingRoundId: 'gw12' }, 'gw12')).toBe(true)
		expect(isGameStartingRound({ startingRoundId: 'gw12' }, 'gw13')).toBe(false)
	})

	it("is false for the competition's gameweek one when the game started later", () => {
		expect(isGameStartingRound({ startingRoundId: 'gw12' }, 'gw1')).toBe(false)
	})

	it('is false with nothing to compare', () => {
		expect(isGameStartingRound({ startingRoundId: null }, 'gw1')).toBe(false)
		expect(isGameStartingRound({ startingRoundId: 'gw12' }, null)).toBe(false)
	})
})
