import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: vi.fn() },
			user: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
		},
		insert: vi.fn(),
	},
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { POST } from './route'

function makeReq(body: unknown) {
	return new Request('http://localhost/api/games/g1/admin/add-player', {
		method: 'POST',
		body: JSON.stringify(body),
	})
}

const params = { params: Promise.resolve({ id: 'g1' }) }

describe('POST /api/games/[id]/admin/add-player', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-admin' } } as never)
	})

	it('returns 403 for non-admin', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-other',
			modeConfig: { startingLives: 3 },
			gameMode: 'classic',
		} as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(403)
	})

	it('returns 404 when target user not found', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-admin',
			modeConfig: { startingLives: 3 },
			gameMode: 'classic',
		} as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(404)
	})

	it('returns 409 when user already in game', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-admin',
			modeConfig: { startingLives: 3 },
			gameMode: 'classic',
		} as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue({ id: 'u-new' } as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp-exist',
			userId: 'u-new',
		} as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(409)
	})

	it('inserts gamePlayer and returns 200', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-admin',
			modeConfig: { startingLives: 3 },
			gameMode: 'classic',
		} as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue({ id: 'u-new' } as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue(undefined as never)
		const insertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: 'gp-new', userId: 'u-new' }]),
			}),
		}
		vi.mocked(db.insert).mockReturnValue(insertChain as never)

		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.gamePlayer.id).toBe('gp-new')
	})
})
