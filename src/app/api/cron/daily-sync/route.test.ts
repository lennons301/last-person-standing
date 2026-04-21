import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: { findMany: vi.fn() },
			team: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			round: { findFirst: vi.fn() },
			fixture: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'new' }]) })),
		})),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

const fplFetchTeams = vi.fn().mockResolvedValue([])
const fplFetchRounds = vi.fn().mockResolvedValue([])
vi.mock('@/lib/data/fpl', () => ({
	FplAdapter: vi.fn().mockImplementation(function FplAdapter() {
		return {
			fetchTeams: fplFetchTeams,
			fetchRounds: fplFetchRounds,
		}
	}),
}))

const fdFetchTeams = vi.fn().mockResolvedValue([])
const fdFetchRounds = vi.fn().mockResolvedValue([])
vi.mock('@/lib/data/football-data', () => ({
	FootballDataAdapter: vi.fn().mockImplementation(function FootballDataAdapter() {
		return {
			fetchTeams: fdFetchTeams,
			fetchRounds: fdFetchRounds,
		}
	}),
}))

import { db } from '@/lib/db'
import { POST } from './route'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-key'
	})

	it('returns 401 without auth', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('invokes the FPL adapter for fpl competitions', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1', dataSource: 'fpl', externalId: null },
		] as never)
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(fplFetchTeams).toHaveBeenCalled()
		expect(fplFetchRounds).toHaveBeenCalled()
	})

	it('invokes the football-data adapter for football_data competitions', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c2', dataSource: 'football_data', externalId: 'WC' },
		] as never)
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(fdFetchTeams).toHaveBeenCalled()
		expect(fdFetchRounds).toHaveBeenCalled()
	})
})
