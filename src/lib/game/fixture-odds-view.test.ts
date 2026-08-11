import { describe, expect, it } from 'vitest'
import { toFixtureOddsView } from './fixture-odds-view'

const ROW = {
	homePrice: 1.5,
	drawPrice: 4,
	awayPrice: 6,
	homeProbability: 8 / 13,
	drawProbability: 3 / 13,
	awayProbability: 2 / 13,
	asOf: new Date('2026-08-14T11:30:00Z'),
}

describe('toFixtureOddsView', () => {
	it('pairs each side’s persisted probability with the price it came from', () => {
		expect(toFixtureOddsView(ROW)).toEqual({
			home: { probability: 8 / 13, price: 1.5 },
			away: { probability: 2 / 13, price: 6 },
			asOf: '2026-08-14T11:30:00.000Z',
		})
	})

	it('is null for a fixture with no persisted odds', () => {
		// Nothing rendered beats a zero: the pick selector must not imply a team
		// has no chance because nobody priced the match.
		expect(toFixtureOddsView(null)).toBeNull()
		expect(toFixtureOddsView(undefined)).toBeNull()
	})
})
