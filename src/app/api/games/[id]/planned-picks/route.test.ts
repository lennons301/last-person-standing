import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			gamePlayer: { findFirst: vi.fn() },
			game: { findFirst: vi.fn() },
			round: { findFirst: vi.fn() },
			pick: { findMany: vi.fn().mockResolvedValue([]) },
			plannedPick: { findMany: vi.fn().mockResolvedValue([]) },
		},
		delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'plan-1' }]) })),
		})),
	},
}))

import { db } from '@/lib/db'
import { GET, POST } from './route'

function makeReq(body: unknown, method: 'GET' | 'POST' = 'POST'): Request {
	return new Request('http://x/api/games/g1/planned-picks', {
		method,
		headers: { 'content-type': 'application/json' },
		body: method === 'POST' ? JSON.stringify(body) : undefined,
	})
}

const ctx = { params: Promise.resolve({ id: 'g1' }) }

describe('planned-picks route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('GET returns 403 if not a member', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue(undefined as never)
		const res = await GET(makeReq(null, 'GET'), ctx)
		expect(res.status).toBe(403)
	})

	it('POST rejects non-classic games', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'turbo' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			status: 'upcoming',
			number: 5,
		} as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: false }), ctx)
		expect(res.status).toBe(400)
		expect(await res.json()).toEqual({ error: 'planner is classic-only' })
	})

	it('POST rejects starting rounds', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'classic' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ status: 'open', number: 5 } as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: false }), ctx)
		expect(res.status).toBe(400)
	})

	it('POST succeeds for valid plan', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'classic' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			status: 'upcoming',
			number: 5,
		} as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: true }), ctx)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ plan: { id: 'plan-1' } })
	})
})
