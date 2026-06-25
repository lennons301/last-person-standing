import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
			payment: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ id: 'pay-new' }]),
			})),
		})),
	},
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { POST } from './route'

const ctx = (gameId = 'g1', userId = 'u-target') => ({
	params: Promise.resolve({ id: gameId, userId }),
})
const req = () => new Request('http://localhost/mark-entry-paid', { method: 'POST' })

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.query.game.findFirst.mockResolvedValue({
		id: 'g1',
		createdBy: 'admin',
		entryFee: '10.00',
	})
	dbMock.query.gamePlayer.findFirst.mockResolvedValue({ id: 'gp1', userId: 'u-target' })
	dbMock.query.payment.findFirst.mockResolvedValue(undefined)
})

describe('POST mark-entry-paid', () => {
	it('rejects a non-admin with 403', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'someone-else' })
		expect((await POST(req(), ctx())).status).toBe(403)
	})

	it('404s when the game does not exist', async () => {
		dbMock.query.game.findFirst.mockResolvedValue(undefined)
		expect((await POST(req(), ctx())).status).toBe(404)
	})

	it('404s when the player is not in the game', async () => {
		dbMock.query.gamePlayer.findFirst.mockResolvedValue(undefined)
		const res = await POST(req(), ctx())
		expect(res.status).toBe(404)
		expect((await res.json()).error).toBe('not-in-game')
	})

	it('refuses when the player already has a non-refunded payment row', async () => {
		// Such a player isn't a synthetic "unpaid" row — the admin should use the
		// existing row's Mark paid / Dispute controls instead of creating a dup.
		dbMock.query.payment.findFirst.mockResolvedValue({ id: 'p1', status: 'pending' })
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('entry-exists')
	})

	it('creates a paid entry for a player with no payment row', async () => {
		const res = await POST(req(), ctx())
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.status).toBe('paid')
		expect(body.paymentId).toBe('pay-new')
		expect(dbMock.insert).toHaveBeenCalledOnce()
	})
})
