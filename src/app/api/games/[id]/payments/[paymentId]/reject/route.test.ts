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

const ctx = { params: Promise.resolve({ id: 'g1', paymentId: 'p1' }) }

describe('admin payment reject route (paymentId-keyed)', () => {
	beforeEach(() => vi.clearAllMocks())

	it('404s if game not found', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('403s if caller is not the creator', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('404s if payment row does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('400s if payment is not currently paid', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			gameId: 'g1',
			status: 'pending',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(400)
	})

	it('200s and flips paid → pending, clearing paidAt', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			gameId: 'g1',
			status: 'paid',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({ status: 'pending', paidAt: null })
	})
})
