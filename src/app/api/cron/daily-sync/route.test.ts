import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: { query: { competition: { findMany: vi.fn() } } },
}))

vi.mock('@/lib/game/bootstrap-competitions', () => ({
	syncCompetition: vi.fn().mockResolvedValue({ rounds: 0, fixtures: 0, transitionedRoundIds: [] }),
}))

vi.mock('@/lib/game/no-pick-handler', () => ({
	processDeadlineLock: vi
		.fn()
		.mockResolvedValue({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 }),
}))

import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { POST } from './route'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
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
			transitionedRoundIds: [],
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
			transitionedRoundIds: [],
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
			.mockResolvedValueOnce({ rounds: 2, fixtures: 20, transitionedRoundIds: ['r1', 'r2'] })
			.mockResolvedValueOnce({ rounds: 1, fixtures: 10, transitionedRoundIds: ['r3'] })

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
