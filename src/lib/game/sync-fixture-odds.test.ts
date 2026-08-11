import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbQueryRoundFindMany, dbInsertFn, dbInsertValues, dbOnConflictDoUpdate, fetchOddsMock } =
	vi.hoisted(() => {
		const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
		const values = vi.fn((_row: Record<string, unknown>) => ({ onConflictDoUpdate }))
		return {
			dbQueryRoundFindMany: vi.fn().mockResolvedValue([]),
			dbInsertFn: vi.fn(() => ({ values })),
			dbInsertValues: values,
			dbOnConflictDoUpdate: onConflictDoUpdate,
			fetchOddsMock: vi.fn().mockResolvedValue([]),
		}
	})

vi.mock('@/lib/db', () => ({
	db: {
		query: { round: { findMany: dbQueryRoundFindMany } },
		insert: dbInsertFn,
	},
}))

vi.mock('@/lib/data/odds-api', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/data/odds-api')>()),
	// biome-ignore lint/complexity/useArrowFunction: vi.fn().mockImplementation needs a constructable function for `new OddsApiAdapter()`
	OddsApiAdapter: vi.fn().mockImplementation(function () {
		return { fetchOdds: fetchOddsMock }
	}),
}))

import { OddsApiAdapter } from '@/lib/data/odds-api'
import { syncFixtureOdds } from './sync-fixture-odds'

const PL = {
	id: 'comp-pl',
	externalId: null,
	dataSource: 'fpl' as const,
	status: 'active' as const,
}

const NOW = new Date('2026-08-14T12:00:00Z')

/** One de-vigged market, as the adapter hands it over. */
const MARKET = {
	eventId: 'evt-1',
	homeTeam: 'Manchester United',
	awayTeam: 'Newcastle United',
	commenceTime: new Date('2026-08-15T14:00:00Z'),
	bookmaker: 'betfair_ex_uk',
	asOf: new Date('2026-08-14T11:30:00Z'),
	homePrice: 1.5,
	drawPrice: 4,
	awayPrice: 6,
	homeProbability: 8 / 13,
	drawProbability: 3 / 13,
	awayProbability: 2 / 13,
}

/** Our fixture for the same match, with FPL's abbreviated team names. */
function plRound(deadline: Date | null) {
	return [
		{
			id: 'round-1',
			number: 1,
			deadline,
			fixtures: [
				{
					id: 'fx-1',
					homeTeam: { id: 't-mun', name: 'Man Utd', shortName: 'MUN' },
					awayTeam: { id: 't-new', name: 'Newcastle', shortName: 'NEW' },
				},
			],
		},
	]
}

describe('syncFixtureOdds', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		fetchOddsMock.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
	})

	it('persists the de-vigged market against the fixture it belongs to', async () => {
		fetchOddsMock.mockResolvedValue([MARKET])
		dbQueryRoundFindMany.mockResolvedValue(plRound(new Date('2026-08-15T12:30:00Z')))

		const summary = await syncFixtureOdds(PL, 'key-123', { now: NOW })

		expect(summary.matched).toBe(1)
		expect(dbInsertValues).toHaveBeenCalledTimes(1)
		expect(dbInsertValues.mock.calls[0][0]).toMatchObject({
			fixtureId: 'fx-1',
			bookmaker: 'betfair_ex_uk',
			homePrice: 1.5,
			drawPrice: 4,
			awayPrice: 6,
			asOf: MARKET.asOf,
		})
		const written = dbInsertValues.mock.calls[0][0] as { homeProbability: number }
		expect(written.homeProbability).toBeCloseTo(8 / 13, 10)
		// Re-running the sync must refresh the same row, not stack duplicates.
		expect(dbOnConflictDoUpdate).toHaveBeenCalledTimes(1)
	})

	it('freezes the odds once the round deadline has passed', async () => {
		// The number every player sees must stop moving at the deadline: after it,
		// picks are locked and a drifting probability would rewrite the market a
		// player made their decision against.
		fetchOddsMock.mockResolvedValue([MARKET])
		dbQueryRoundFindMany.mockResolvedValue(plRound(new Date('2026-08-14T11:00:00Z')))

		const summary = await syncFixtureOdds(PL, 'key-123', { now: NOW })

		expect(summary.frozen).toBe(1)
		expect(summary.matched).toBe(0)
		expect(dbInsertValues).not.toHaveBeenCalled()
	})

	it('writes nothing for a market that matches no fixture', async () => {
		fetchOddsMock.mockResolvedValue([{ ...MARKET, homeTeam: 'Real Madrid', awayTeam: 'Barcelona' }])
		dbQueryRoundFindMany.mockResolvedValue(plRound(new Date('2026-08-15T12:30:00Z')))

		const summary = await syncFixtureOdds(PL, 'key-123', { now: NOW })

		expect(summary.matched).toBe(0)
		expect(summary.unmatched).toEqual(['Real Madrid v Barcelona'])
		expect(dbInsertValues).not.toHaveBeenCalled()
	})

	it('does not call the source at all for a competition we have no odds sport for', async () => {
		// A cup or a competition the source doesn't cover: no odds, no request, and
		// the selector simply renders no win-probability.
		const summary = await syncFixtureOdds(
			{ id: 'comp-wc', externalId: 'WC', dataSource: 'football_data', status: 'active' },
			'key-123',
			{ now: NOW },
		)

		expect(summary).toMatchObject({ matched: 0, frozen: 0 })
		expect(vi.mocked(OddsApiAdapter)).not.toHaveBeenCalled()
		expect(fetchOddsMock).not.toHaveBeenCalled()
	})

	it('never touches an archived competition', async () => {
		const summary = await syncFixtureOdds({ ...PL, status: 'archived' }, 'key-123', { now: NOW })

		expect(summary.matched).toBe(0)
		expect(fetchOddsMock).not.toHaveBeenCalled()
	})
})
