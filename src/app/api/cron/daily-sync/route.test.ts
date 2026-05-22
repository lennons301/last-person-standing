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

import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { POST } from './route'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		cronRunInsertValues.mockClear()
		cronRunInsertValues.mockResolvedValue(undefined)
		process.env.CRON_SECRET = 'test-secret'
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
