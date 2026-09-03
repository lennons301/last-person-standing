import { describe, expect, it } from 'vitest'
import { decideNoPickOutcome, type NoPickDecisionInput } from './no-pick-decision'

/**
 * The competition's whole round sequence. 'gw12' is the round a mid-season game
 * starts at and 'gw13' the round after it, so the same table exercises both a
 * game that began at gameweek one and one that began in November.
 */
const COMPETITION_ROUNDS = [
	{ id: 'r1', number: 1 },
	{ id: 'r2', number: 2 },
	{ id: 'r3', number: 3 },
	{ id: 'gw12', number: 12 },
	{ id: 'gw13', number: 13 },
]

function input(overrides: Partial<NoPickDecisionInput> = {}): NoPickDecisionInput {
	return {
		game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: null },
		roundId: 'r1',
		competitionRounds: COMPETITION_ROUNDS,
		paymentRowCount: 1,
		...overrides,
	}
}

describe('decideNoPickOutcome — the game’s own opening round', () => {
	it('exempts a classic no-picker when rebuys are off', () => {
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: false } },
					roundId: 'r1',
				}),
			),
		).toEqual({ kind: 'exempt' })
	})

	it('eliminates a classic no-picker when rebuys are on', () => {
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
					roundId: 'r1',
				}),
			),
		).toEqual({ kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false })
	})

	it('follows the game’s own starting round, not the competition’s gameweek one', () => {
		// A game created in November opens at gameweek 12: that is where the
		// exemption applies, and gameweek 1 is no round of this game's at all.
		const midSeason = {
			gameMode: 'classic',
			startingRoundId: 'gw12',
			modeConfig: { allowRebuys: false },
		} as const
		expect(decideNoPickOutcome(input({ game: midSeason, roundId: 'gw12' }))).toEqual({
			kind: 'exempt',
		})
		expect(
			decideNoPickOutcome(input({ game: midSeason, roundId: 'r1', fallbackTeamId: 't-worst' })),
		).toEqual({ kind: 'auto-pick', teamId: 't-worst' })
	})
})
