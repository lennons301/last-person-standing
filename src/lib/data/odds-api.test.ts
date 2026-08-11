import { describe, expect, it } from 'vitest'
import { parseOddsEvents } from './odds-api'

/**
 * A the-odds-api v4 `/sports/{sport}/odds` payload, trimmed to the shape we
 * read. Prices are chosen so the de-vigged answers are exact thirteenths:
 * 1.5 / 4.0 / 6.0 imply 2/3 + 1/4 + 1/6 = 13/12 (an 8.33% overround), so the
 * normalised probabilities are 8/13, 3/13 and 2/13.
 */
const MOCK_PAYLOAD = [
	{
		id: 'evt-1',
		sport_key: 'soccer_epl',
		commence_time: '2026-08-15T14:00:00Z',
		home_team: 'Manchester United',
		away_team: 'Newcastle United',
		bookmakers: [
			{
				key: 'betfair_ex_uk',
				title: 'Betfair',
				last_update: '2026-08-14T12:03:24Z',
				markets: [
					{
						key: 'h2h',
						last_update: '2026-08-14T12:03:24Z',
						outcomes: [
							{ name: 'Manchester United', price: 1.5 },
							{ name: 'Newcastle United', price: 6.0 },
							{ name: 'Draw', price: 4.0 },
						],
					},
				],
			},
		],
	},
]

describe('parseOddsEvents', () => {
	it('de-vigs the 1X2 prices into probabilities that sum to 1', () => {
		const [market] = parseOddsEvents(MOCK_PAYLOAD)

		expect(market.homeProbability).toBeCloseTo(8 / 13, 10)
		expect(market.drawProbability).toBeCloseTo(3 / 13, 10)
		expect(market.awayProbability).toBeCloseTo(2 / 13, 10)
		expect(market.homeProbability + market.drawProbability + market.awayProbability).toBeCloseTo(
			1,
			10,
		)
	})

	it('carries the raw win prices and the identity of the market it read', () => {
		const [market] = parseOddsEvents(MOCK_PAYLOAD)

		expect(market).toMatchObject({
			homeTeam: 'Manchester United',
			awayTeam: 'Newcastle United',
			bookmaker: 'betfair_ex_uk',
			homePrice: 1.5,
			drawPrice: 4.0,
			awayPrice: 6.0,
		})
		expect(market.commenceTime).toEqual(new Date('2026-08-15T14:00:00Z'))
		expect(market.asOf).toEqual(new Date('2026-08-14T12:03:24Z'))
	})
})
