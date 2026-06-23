import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => {
	const setWhere = { set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }
	return {
		dbMock: {
			query: {
				game: { findFirst: vi.fn() },
				gamePlayer: { findFirst: vi.fn() },
				pick: { findFirst: vi.fn() },
			},
			update: vi.fn(() => setWhere),
			transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
				cb({ update: vi.fn(() => setWhere) }),
			),
		},
	}
})

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { POST } from './route'

const ctx = (gameId = 'g1', userId = 'u-target') => ({
	params: Promise.resolve({ id: gameId, userId }),
})
const req = () => new Request('http://localhost/remove', { method: 'POST' })

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'admin' })
	dbMock.query.gamePlayer.findFirst.mockResolvedValue({ id: 'gp1', userId: 'u-target' })
	dbMock.query.pick.findFirst.mockResolvedValue(undefined)
})

describe('POST remove-player', () => {
	it('rejects a non-admin with 403', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'someone-else' })
		const res = await POST(req(), ctx())
		expect(res.status).toBe(403)
	})

	it('404s when the player is not in the game', async () => {
		dbMock.query.gamePlayer.findFirst.mockResolvedValue(undefined)
		const res = await POST(req(), ctx())
		expect(res.status).toBe(404)
	})

	it('refuses to remove a player who has already picked', async () => {
		dbMock.query.pick.findFirst.mockResolvedValue({ id: 'pick1' })
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('player-has-picks')
	})

	it('removes a no-pick player (status flip + transaction)', async () => {
		const res = await POST(req(), ctx())
		expect(res.status).toBe(200)
		expect((await res.json()).status).toBe('removed')
		expect(dbMock.transaction).toHaveBeenCalledOnce()
	})
})
