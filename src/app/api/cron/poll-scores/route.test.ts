import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findMany: vi.fn() },
			round: { findFirst: vi.fn() },
			fixture: { findMany: vi.fn() },
		},
		select: vi.fn(),
		update: vi.fn(),
	},
}))

vi.mock('@/lib/data/match-window', () => ({
	hasActiveFixture: vi.fn(() => false),
}))

vi.mock('@/lib/data/qstash', () => ({
	enqueueProcessRound: vi.fn().mockResolvedValue(undefined),
	enqueuePollScores: vi.fn().mockResolvedValue(undefined),
}))

const footballDataAdapterCtor = vi.fn()
const fetchLiveScoresMock = vi.fn()

vi.mock('@/lib/data/football-data', async () => {
	const actual = await vi.importActual<typeof import('@/lib/data/football-data')>(
		'@/lib/data/football-data',
	)
	class MockFootballDataAdapter {
		constructor(code: string, apiKey: string) {
			footballDataAdapterCtor(code, apiKey)
		}
		fetchLiveScores = fetchLiveScoresMock
	}
	return {
		...actual,
		FootballDataAdapter: MockFootballDataAdapter,
	}
})

import { hasActiveFixture } from '@/lib/data/match-window'
import { enqueuePollScores, enqueueProcessRound } from '@/lib/data/qstash'
import { db } from '@/lib/db'
import { POST } from './route'

function authedRequest() {
	return new Request('http://x', {
		method: 'POST',
		headers: { authorization: 'Bearer test-secret' },
	})
}

describe('poll-scores short-circuit', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-key'
		// Default: hasActiveFixture short-circuits unless overridden per test.
		vi.mocked(hasActiveFixture).mockReturnValue(false)
		// Default round-fixtures lookup: not all finished — prevents stray enqueues.
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([{ status: 'live' }] as never)
	})

	it('returns 401 when auth missing', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('short-circuits when no active rounds', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([] as never)
		const res = await POST(authedRequest())
		const body = await res.json()
		expect(body).toEqual({ updated: 0, reason: 'no-active-rounds' })
	})

	it('short-circuits when no fixtures are in their live window', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{
				currentRoundId: 'r1',
				competition: { externalId: 'PL', dataSource: 'fpl' },
			},
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ id: 'f1', kickoff: null, roundId: 'r1' }]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(false)
		const res = await POST(authedRequest())
		const body = await res.json()
		expect(body.reason).toBe('no-active-fixtures')
	})

	it('dispatches adapter and updates fixtures when live fixtures exist', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{
				currentRoundId: 'r1',
				competition: { externalId: 'PL', dataSource: 'football_data' },
			},
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ id: 'f1', kickoff: new Date(), roundId: 'r1' }]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(true)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ id: 'r1', number: 5 } as never)
		fetchLiveScoresMock.mockResolvedValue([
			{ externalId: 'm1', homeScore: 1, awayScore: 0, status: 'live' },
			{ externalId: 'm2', homeScore: 2, awayScore: 2, status: 'finished' },
		])
		const whereMock = vi.fn().mockResolvedValue(undefined)
		const setMock = vi.fn(() => ({ where: whereMock }))
		vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

		const res = await POST(authedRequest())
		const body = await res.json()

		expect(footballDataAdapterCtor).toHaveBeenCalledTimes(1)
		expect(footballDataAdapterCtor).toHaveBeenCalledWith('PL', 'fd-key')
		expect(db.update).toHaveBeenCalled()
		expect(setMock).toHaveBeenCalledTimes(2)
		expect(body).toEqual({ updated: 2, chained: true })
	})

	it('enqueues the next poll-scores call when fixtures are active (chain)', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{ currentRoundId: 'r1', competition: { externalId: 'PL', dataSource: 'football_data' } },
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ id: 'f1', kickoff: new Date(), roundId: 'r1' }]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(true)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ id: 'r1', number: 1 } as never)
		fetchLiveScoresMock.mockResolvedValue([])
		const whereMock = vi.fn().mockResolvedValue(undefined)
		const setMock = vi.fn(() => ({ where: whereMock }))
		vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

		await POST(authedRequest())

		expect(enqueuePollScores).toHaveBeenCalledTimes(1)
	})

	it('does NOT enqueue the next call when no active fixtures (chain terminates)', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{ currentRoundId: 'r1', competition: { externalId: 'PL', dataSource: 'football_data' } },
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ id: 'f1', kickoff: null, roundId: 'r1' }]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(false)

		await POST(authedRequest())

		expect(enqueuePollScores).not.toHaveBeenCalled()
	})

	it('enqueues process_round when the last fixture transitions to finished', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{
				id: 'game-1',
				currentRoundId: 'r1',
				competition: { externalId: 'PL', dataSource: 'football_data' },
			},
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () => Promise.resolve([{ id: 'fx-1-internal', status: 'live', roundId: 'r1' }]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(true)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ id: 'r1', number: 7 } as never)
		fetchLiveScoresMock.mockResolvedValue([
			{ externalId: 'fx-1', homeScore: 2, awayScore: 1, status: 'finished' },
		])
		// All fixtures in r1 are finished — triggers enqueue.
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([
			{ status: 'finished' },
			{ status: 'finished' },
		] as never)
		const whereMock = vi.fn().mockResolvedValue(undefined)
		const setMock = vi.fn(() => ({ where: whereMock }))
		vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

		await POST(authedRequest())

		expect(enqueueProcessRound).toHaveBeenCalledTimes(1)
		expect(enqueueProcessRound).toHaveBeenCalledWith('game-1', 'r1')
	})

	it('constructs one adapter per distinct competition code', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{
				currentRoundId: 'r-pl',
				competition: { externalId: 'PL', dataSource: 'football_data' },
			},
			{
				currentRoundId: 'r-wc',
				competition: { externalId: 'WC', dataSource: 'football_data' },
			},
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({
				where: () =>
					Promise.resolve([
						{ id: 'f-pl', kickoff: new Date(), roundId: 'r-pl' },
						{ id: 'f-wc', kickoff: new Date(), roundId: 'r-wc' },
					]),
			}),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(true)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r-any',
			number: 1,
		} as never)
		fetchLiveScoresMock.mockResolvedValue([])
		const whereMock = vi.fn().mockResolvedValue(undefined)
		const setMock = vi.fn(() => ({ where: whereMock }))
		vi.mocked(db.update).mockReturnValue({ set: setMock } as never)

		await POST(authedRequest())

		expect(footballDataAdapterCtor).toHaveBeenCalledTimes(2)
		const codes = footballDataAdapterCtor.mock.calls.map((c) => c[0]).sort()
		expect(codes).toEqual(['PL', 'WC'])
	})
})
