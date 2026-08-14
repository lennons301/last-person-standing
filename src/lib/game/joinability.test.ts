import { describe, expect, it } from 'vitest'
import { evaluateJoinability } from './joinability'

const NOW = new Date('2026-08-14T12:00:00Z')

const startingRound = { id: 'gw12', deadline: new Date('2026-08-15T11:00:00Z') }

/** A game created mid-season, still sitting on the round it began at. */
const openGame = {
	status: 'active' as const,
	currentRoundId: 'gw12',
	startingRoundId: 'gw12',
}

describe('evaluateJoinability', () => {
	it('is open before the starting round deadline', () => {
		expect(evaluateJoinability({ game: openGame, startingRound, now: NOW })).toEqual({
			joinable: true,
			reason: null,
		})
	})

	it('is closed once the starting round deadline has passed', () => {
		expect(
			evaluateJoinability({
				game: openGame,
				startingRound: { id: 'gw12', deadline: new Date('2026-08-14T11:00:00Z') },
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'started' })
	})

	it('closes on the deadline itself, not a moment after', () => {
		expect(
			evaluateJoinability({
				game: openGame,
				startingRound: { id: 'gw12', deadline: NOW },
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'started' })
	})

	it('is closed once the game has advanced past its starting round, deadline in the future or not', () => {
		expect(
			evaluateJoinability({
				game: { status: 'active', currentRoundId: 'gw13', startingRoundId: 'gw12' },
				// The starting round's own deadline is still ahead — a stale round row, or a
				// game advanced early. Advancing is what settles it.
				startingRound,
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'started' })
	})

	it('is closed once the game has completed', () => {
		expect(
			evaluateJoinability({
				game: { status: 'completed', currentRoundId: 'gw12', startingRoundId: 'gw12' },
				startingRound,
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'completed' })
	})

	it('is open when the starting round carries no deadline (WC knockouts pre-draw)', () => {
		expect(
			evaluateJoinability({
				game: openGame,
				startingRound: { id: 'gw12', deadline: null },
				now: NOW,
			}),
		).toEqual({ joinable: true, reason: null })
	})

	it('is closed while the game is still in setup', () => {
		expect(
			evaluateJoinability({
				game: { status: 'setup', currentRoundId: null, startingRoundId: null },
				startingRound: null,
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'not-open' })
	})

	it('is closed when the game records no starting round — an unplaceable game is not a fresh one', () => {
		expect(
			evaluateJoinability({
				game: { status: 'active', currentRoundId: 'gw12', startingRoundId: null },
				startingRound: null,
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'not-open' })
	})

	it('is closed when the starting round row could not be resolved', () => {
		expect(
			evaluateJoinability({
				game: openGame,
				startingRound: null,
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'not-open' })
	})

	it('ignores a round row that is not the starting round', () => {
		expect(
			evaluateJoinability({
				game: openGame,
				startingRound: { id: 'gw13', deadline: new Date('2026-08-22T11:00:00Z') },
				now: NOW,
			}),
		).toEqual({ joinable: false, reason: 'not-open' })
	})
})
