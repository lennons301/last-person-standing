import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: { query: { competition: { findMany: vi.fn() } } },
}))

vi.mock('@/lib/game/bootstrap-competitions', () => ({
	syncCompetition: vi.fn().mockResolvedValue({ rounds: 0, fixtures: 0 }),
}))

import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
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
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(syncCompetition).toHaveBeenCalledTimes(2)
	})
})
