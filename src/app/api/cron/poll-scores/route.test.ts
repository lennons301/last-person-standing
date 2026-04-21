import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: { game: { findMany: vi.fn() } },
		select: vi.fn(),
		update: vi.fn(),
	},
}))

vi.mock('@/lib/data/match-window', () => ({
	hasActiveFixture: vi.fn(() => false),
}))

import { hasActiveFixture } from '@/lib/data/match-window'
import { db } from '@/lib/db'
import { POST } from './route'

describe('poll-scores short-circuit', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-key'
	})

	it('returns 401 when auth missing', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('short-circuits when no active rounds', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([] as never)
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		const body = await res.json()
		expect(body).toEqual({ updated: 0, reason: 'no-active-rounds' })
	})

	it('short-circuits when no fixtures are in their live window', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{ currentRoundId: 'r1', competition: { externalId: 'PL', dataSource: 'fpl' } },
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({ where: () => Promise.resolve([{ id: 'f1', kickoff: null, roundId: 'r1' }]) }),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(false)
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		const body = await res.json()
		expect(body.reason).toBe('no-active-fixtures')
	})
})
