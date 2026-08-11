import { beforeEach, describe, expect, it, vi } from 'vitest'

const cronRunInsertValues = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: { findMany: vi.fn() },
			game: { findMany: vi.fn().mockResolvedValue([]) },
		},
		insert: vi.fn(() => ({ values: cronRunInsertValues })),
	},
}))

vi.mock('@/lib/game/bootstrap-competitions', () => ({
	syncCompetition: vi.fn().mockResolvedValue({
		rounds: 0,
		fixtures: 0,
		deadlinePassedRoundIds: [],
		settledFixtureIds: [],
	}),
	mergeFootballDataIds: vi.fn().mockResolvedValue(undefined),
	scheduleUpcomingFixturePolls: vi.fn().mockResolvedValue(undefined),
	ensureCurrentPlSeasonCompetition: vi.fn().mockResolvedValue({
		id: 'c-pl',
		dataSource: 'fpl',
		season: '2026/27',
		status: 'active',
	}),
}))

vi.mock('@/lib/game/no-pick-handler', () => ({
	processDeadlineLock: vi
		.fn()
		.mockResolvedValue({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 }),
}))

vi.mock('@/lib/game/process-round', () => ({
	advanceGameIfReady: vi.fn().mockResolvedValue({ advanced: false, reason: 'not-active' }),
}))

vi.mock('@/lib/game/round-lifecycle', () => ({
	openRoundForGame: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/game/sync-fixture-odds', () => ({
	syncFixtureOdds: vi.fn().mockResolvedValue({ matched: 0, frozen: 0, unmatched: [] }),
}))

vi.mock('@/lib/game/reconcile', () => ({
	reconcileAllActiveGames: vi
		.fn()
		.mockResolvedValue({ checked: 0, settled: 0, advanced: 0, stuckFixturesSettled: 0 }),
}))

import { db } from '@/lib/db'
import {
	ensureCurrentPlSeasonCompetition,
	syncCompetition,
} from '@/lib/game/bootstrap-competitions'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { syncFixtureOdds } from '@/lib/game/sync-fixture-odds'
import { POST } from './route'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		cronRunInsertValues.mockClear()
		cronRunInsertValues.mockResolvedValue(undefined)
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-test-key'
		vi.mocked(ensureCurrentPlSeasonCompetition).mockResolvedValue({
			id: 'c-pl',
			dataSource: 'fpl',
			season: '2026/27',
			status: 'active',
		} as never)
	})

	it('runs season detection/rollover with the pre-fetched payload before syncing anything', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		const fplPayload = { bootstrap: { teams: [], events: [] }, fixtures: [] }
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: {
					authorization: 'Bearer test-secret',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ fpl: fplPayload }),
			}),
		)
		expect(ensureCurrentPlSeasonCompetition).toHaveBeenCalledWith({
			footballDataApiKey: 'fd-test-key',
			fplData: fplPayload,
		})
		// Detection must complete before the first competition sync — a season
		// failure has to abort the run with zero sync writes.
		expect(vi.mocked(ensureCurrentPlSeasonCompetition).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(syncCompetition).mock.invocationCallOrder[0],
		)
	})

	it('aborts the whole run — no competition syncs — when season detection fails', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(ensureCurrentPlSeasonCompetition).mockRejectedValue(
			new Error('season disagreement: football-data says 2026 but FPL says 2025'),
		)
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(res.status).toBe(500)
		const body = (await res.json()) as { error: { message: string } }
		expect(body.error.message).toContain('season disagreement')
		expect(syncCompetition).not.toHaveBeenCalled()
		expect(cronRunInsertValues.mock.calls[0][0]).toMatchObject({ status: 'failure' })
	})

	it('records a success cron_run when the body completes', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(res.status).toBe(200)
		expect(cronRunInsertValues).toHaveBeenCalledTimes(1)
		expect(cronRunInsertValues.mock.calls[0][0]).toMatchObject({
			route: '/api/cron/daily-sync',
			status: 'success',
			error: null,
		})
	})

	it('returns 500 with a serialized error and records a failure cron_run when an adapter throws', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncCompetition).mockRejectedValue(new Error('upstream blew up'))
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(res.status).toBe(500)
		const body = (await res.json()) as { error: { message: string } }
		expect(body.error.message).toBe('upstream blew up')
		expect(cronRunInsertValues).toHaveBeenCalledTimes(1)
		expect(cronRunInsertValues.mock.calls[0][0]).toMatchObject({
			route: '/api/cron/daily-sync',
			status: 'failure',
			error: 'upstream blew up',
		})
	})

	it('threads pre-fetched FPL data from the POST body into syncCompetition', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		const fplPayload = { bootstrap: { teams: [], events: [] }, fixtures: [] }
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: {
					authorization: 'Bearer test-secret',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ fpl: fplPayload }),
			}),
		)
		expect(syncCompetition).toHaveBeenCalledWith(
			{ id: 'c1' },
			expect.objectContaining({ fplData: fplPayload }),
		)
	})

	it('treats an empty body as "no pre-fetched data" without erroring', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(res.status).toBe(200)
		expect(syncCompetition).toHaveBeenCalledWith(
			{ id: 'c1' },
			expect.objectContaining({ fplData: undefined }),
		)
	})

	it('returns 401 without auth', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('calls syncCompetition for every active competition', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1' },
			{ id: 'c2' },
		] as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(syncCompetition).toHaveBeenCalledTimes(2)
	})

	it('does not call processDeadlineLock when no rounds transitioned', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 1,
			fixtures: 10,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(processDeadlineLock).not.toHaveBeenCalled()
	})

	it('does not open upcoming rounds for games on an archived competition', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{
				id: 'g-archived',
				status: 'active',
				competition: { id: 'c-old', status: 'archived' },
				currentRound: { id: 'r-old', status: 'upcoming' },
			},
			{
				id: 'g-live',
				status: 'active',
				competition: { id: 'c-new', status: 'active' },
				currentRound: { id: 'r-new', status: 'upcoming' },
			},
		] as never)

		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)

		expect(res.status).toBe(200)
		expect(openRoundForGame).toHaveBeenCalledTimes(1)
		expect(openRoundForGame).toHaveBeenCalledWith('r-new')
		const body = (await res.json()) as { reconciledRoundIds: string[] }
		expect(body.reconciledRoundIds).toEqual(['r-new'])
	})

	it('invokes processDeadlineLock once with all transitioned round ids across competitions', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1' },
			{ id: 'c2' },
		] as never)
		vi.mocked(syncCompetition)
			.mockResolvedValueOnce({
				rounds: 2,
				fixtures: 20,
				deadlinePassedRoundIds: ['r1', 'r2'],
				settledFixtureIds: [],
			})
			.mockResolvedValueOnce({
				rounds: 1,
				fixtures: 10,
				deadlinePassedRoundIds: ['r3'],
				settledFixtureIds: [],
			})

		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)

		expect(processDeadlineLock).toHaveBeenCalledTimes(1)
		expect(processDeadlineLock).toHaveBeenCalledWith(['r1', 'r2', 'r3'])
		const body = (await res.json()) as { deadlineLock: unknown }
		expect(body.deadlineLock).toEqual({
			autoPicksInserted: 0,
			playersEliminated: 0,
			paymentsRefunded: 0,
		})
	})
})

describe('daily-sync odds refresh', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		cronRunInsertValues.mockResolvedValue(undefined)
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-test-key'
		process.env.ODDS_API_KEY = 'odds-test-key'
		vi.mocked(ensureCurrentPlSeasonCompetition).mockResolvedValue({
			id: 'c-pl',
			dataSource: 'fpl',
			season: '2026/27',
			status: 'active',
		} as never)
		vi.mocked(syncCompetition).mockResolvedValue({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		vi.mocked(syncFixtureOdds).mockResolvedValue({ matched: 0, frozen: 0, unmatched: [] })
	})

	async function run() {
		return POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
	}

	it('refreshes odds for every active competition on the daily cadence', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1' },
			{ id: 'c2' },
		] as never)
		vi.mocked(syncFixtureOdds).mockResolvedValue({ matched: 10, frozen: 2, unmatched: [] })

		const res = await run()

		expect(syncFixtureOdds).toHaveBeenCalledTimes(2)
		expect(syncFixtureOdds).toHaveBeenCalledWith({ id: 'c1' }, 'odds-test-key')
		const body = await res.json()
		expect(body.competitions[0].odds).toEqual({ matched: 10, frozen: 2, unmatched: [] })
	})

	it('skips the odds refresh entirely when no ODDS_API_KEY is configured', async () => {
		// The key lands via Doppler; until it does, everything else must still run.
		process.env.ODDS_API_KEY = ''
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)

		const res = await run()

		expect(syncFixtureOdds).not.toHaveBeenCalled()
		expect(res.status).toBe(200)
	})

	it('records an odds failure without failing the sync run', async () => {
		// Odds are enrichment; the settlement pipeline this cron also drives must
		// not go red because a free-tier odds provider had a bad minute.
		vi.mocked(db.query.competition.findMany).mockResolvedValue([{ id: 'c1' }] as never)
		vi.mocked(syncFixtureOdds).mockRejectedValue(new Error('odds provider 502'))

		const res = await run()

		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.competitions[0].odds).toEqual({ error: 'odds provider 502' })
		expect(cronRunInsertValues).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }))
	})
})
