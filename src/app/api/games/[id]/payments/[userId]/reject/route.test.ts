import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))
vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: vi.fn() },
			payment: { findFirst: vi.fn() },
		},
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1', userId: 'u1' }) }

describe('reject payment route', () => {
	beforeEach(() => vi.clearAllMocks())

	it('404s if game does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('403s if caller is not the admin', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone-else' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('404s if payment row does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('400s if payment is not in claimed state', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			status: 'paid',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(400)
	})

	it('200s for a claimed payment', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			status: 'claimed',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
	})
})
