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

/**
 * The six outcomes the rule can reach, one row each. Every condition is stated
 * as the facts that reach the decision — no database, no mock, no call sequence.
 */
const OUTCOME_TABLE: Array<{
	name: string
	given: Partial<NoPickDecisionInput>
	expected: ReturnType<typeof decideNoPickOutcome>
}> = [
	{
		name: '1. classic, opening round, rebuys off → exempt',
		given: {
			game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: false } },
			roundId: 'r1',
		},
		expected: { kind: 'exempt' },
	},
	{
		name: '2. classic, opening round, rebuys on → eliminate, no refund',
		given: {
			game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
			roundId: 'r1',
		},
		expected: { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false },
	},
	{
		name: '3. classic, round after starting, bought back in → eliminate the rebuy, refund it',
		given: {
			game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
			roundId: 'r2',
			paymentRowCount: 2,
			fallbackTeamId: 't-worst',
		},
		expected: { kind: 'eliminate', reason: 'missed_rebuy_pick', refund: true },
	},
	{
		name: '4. classic, an ordinary round with a team left → auto-pick',
		given: {
			game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
			roundId: 'r3',
			fallbackTeamId: 't-worst',
		},
		expected: { kind: 'auto-pick', teamId: 't-worst' },
	},
	{
		name: '5. classic, every team in the round already used → eliminate, no refund',
		given: {
			game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
			roundId: 'r3',
			fallbackTeamId: null,
		},
		expected: { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false },
	},
	{
		name: '6. turbo/cup → eliminate and refund, whatever the round',
		given: {
			game: { gameMode: 'turbo', startingRoundId: 'r1', modeConfig: null },
			roundId: 'r1',
		},
		expected: { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: true },
	},
]

describe('decideNoPickOutcome — the six reachable outcomes', () => {
	for (const row of OUTCOME_TABLE) {
		it(row.name, () => {
			expect(decideNoPickOutcome(input(row.given))).toEqual(row.expected)
		})
	}

	it('sends cup down the same unconditional path as turbo', () => {
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'cup', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
					roundId: 'r3',
					fallbackTeamId: 't-worst',
				}),
			),
		).toEqual({ kind: 'eliminate', reason: 'no_pick_no_fallback', refund: true })
	})
})

describe('decideNoPickOutcome — the f8159fa regression', () => {
	it('auto-picks for a round-after-starting no-picker who never bought back in', () => {
		// The bug: every alive no-picker in the round after the opening one was
		// eliminated, and the payment-row count only chose the elimination *string*.
		// One payment row is a player still in on merit — their entry bought this
		// round, so they take the ordinary fallback, not an exit.
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
					roundId: 'r2',
					paymentRowCount: 1,
					fallbackTeamId: 't-worst',
				}),
			),
		).toEqual({ kind: 'auto-pick', teamId: 't-worst' })
	})

	it('auto-picks a free game’s round-after-starting no-picker, who has no payment row at all', () => {
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'gw12', modeConfig: { allowRebuys: true } },
					roundId: 'gw13',
					paymentRowCount: 0,
					fallbackTeamId: 't-worst',
				}),
			),
		).toEqual({ kind: 'auto-pick', teamId: 't-worst' })
	})

	it('reads the round after the game’s own starting round, not the number after it', () => {
		// gw13 is the round after gw12 on the competition's sequence; the rebuy
		// window closed there, so a bought-back-in no-picker goes out with the money.
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'gw12', modeConfig: { allowRebuys: true } },
					roundId: 'gw13',
					paymentRowCount: 2,
					fallbackTeamId: 't-worst',
				}),
			),
		).toEqual({ kind: 'eliminate', reason: 'missed_rebuy_pick', refund: true })
	})

	it('does not read a rebuy into any later round', () => {
		// A second payment row still says "bought back in", but the window it bought
		// closed at the round after the starting one. Round 3 is an ordinary round.
		expect(
			decideNoPickOutcome(
				input({
					game: { gameMode: 'classic', startingRoundId: 'r1', modeConfig: { allowRebuys: true } },
					roundId: 'r3',
					paymentRowCount: 2,
					fallbackTeamId: 't-worst',
				}),
			),
		).toEqual({ kind: 'auto-pick', teamId: 't-worst' })
	})
})

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
