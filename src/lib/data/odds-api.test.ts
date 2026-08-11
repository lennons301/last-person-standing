import { describe, expect, it, vi } from 'vitest'
import { OddsApiAdapter, parseOddsEvents } from './odds-api'

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

describe('parseOddsEvents with unusable markets', () => {
	it('yields nothing for an event no bookmaker has priced', () => {
		// A fixture the source knows about but nobody is quoting. It must produce
		// no market at all rather than a zeroed one — the selector renders no
		// win-probability for it.
		expect(parseOddsEvents([{ ...MOCK_PAYLOAD[0], bookmakers: [] }])).toEqual([])
		expect(parseOddsEvents([{ ...MOCK_PAYLOAD[0], bookmakers: undefined }])).toEqual([])
	})

	it('skips a bookmaker with an incomplete 1X2 market and reads the next complete one', () => {
		const partial = {
			key: 'partial_book',
			last_update: '2026-08-14T11:00:00Z',
			markets: [
				{
					key: 'h2h',
					last_update: '2026-08-14T11:00:00Z',
					// No draw price — de-vigging this would overstate both win sides.
					outcomes: [
						{ name: 'Manchester United', price: 1.5 },
						{ name: 'Newcastle United', price: 6.0 },
					],
				},
			],
		}
		const markets = parseOddsEvents([
			{ ...MOCK_PAYLOAD[0], bookmakers: [partial, ...(MOCK_PAYLOAD[0].bookmakers ?? [])] },
		])

		expect(markets).toHaveLength(1)
		expect(markets[0].bookmaker).toBe('betfair_ex_uk')
	})

	it('ignores markets other than 1X2', () => {
		const totalsOnly = {
			key: 'totals_book',
			last_update: '2026-08-14T11:00:00Z',
			markets: [
				{
					key: 'totals',
					last_update: '2026-08-14T11:00:00Z',
					outcomes: [
						{ name: 'Over', price: 1.9 },
						{ name: 'Under', price: 1.9 },
					],
				},
			],
		}
		expect(parseOddsEvents([{ ...MOCK_PAYLOAD[0], bookmakers: [totalsOnly] }])).toEqual([])
	})
})

describe('OddsApiAdapter', () => {
	it('requests UK decimal 1X2 prices for the sport and returns de-vigged markets', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify(MOCK_PAYLOAD)))

		const markets = await new OddsApiAdapter('soccer_epl', 'key-123').fetchOdds()

		const [url] = fetchMock.mock.calls[0]
		const requested = new URL(typeof url === 'string' ? url : url.toString())
		expect(requested.pathname).toBe('/v4/sports/soccer_epl/odds')
		expect(requested.searchParams.get('apiKey')).toBe('key-123')
		expect(requested.searchParams.get('regions')).toBe('uk')
		expect(requested.searchParams.get('markets')).toBe('h2h')
		expect(requested.searchParams.get('oddsFormat')).toBe('decimal')
		expect(markets).toHaveLength(1)
		expect(markets[0].homeProbability).toBeCloseTo(8 / 13, 10)
		fetchMock.mockRestore()
	})
})

describe('parseOddsEvents when the source omits its update stamp', () => {
	const UNSTAMPED = [
		{
			...MOCK_PAYLOAD[0],
			bookmakers: [
				{
					key: 'no_stamp_book',
					markets: [
						{
							key: 'h2h',
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

	it('stamps the market with when it was read, never with the kickoff', () => {
		// The row prints this as "Odds as of {time}". Falling back to the fixture's
		// commence time would claim the market was read in the future — the one
		// thing worse than showing no odds is showing a wrong one.
		const readAt = new Date('2026-08-14T12:00:00Z')
		const [market] = parseOddsEvents(UNSTAMPED, { readAt })

		expect(market.asOf).toEqual(readAt)
		expect(market.asOf.getTime()).toBeLessThan(market.commenceTime.getTime())
	})
})
