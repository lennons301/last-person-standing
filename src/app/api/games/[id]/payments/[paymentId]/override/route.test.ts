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

function req(body: unknown): Request {
	return new Request('http://x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

describe('admin payment override route (paymentId-keyed)', () => {
	beforeEach(() => vi.clearAllMocks())

	it('403s if caller is not the creator', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone' } as never)
		const res = await POST(req({ status: 'paid' }), ctx)
		expect(res.status).toBe(403)
	})

	it('400s on invalid status (claimed no longer allowed)', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		const res = await POST(req({ status: 'claimed' }), ctx)
		expect(res.status).toBe(400)
	})

	it('404s if payment does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(req({ status: 'paid' }), ctx)
		expect(res.status).toBe(404)
	})

	it('sets status=paid with paidAt', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
		const res = await POST(req({ status: 'paid' }), ctx)
		expect(res.status).toBe(200)
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall?.status).toBe('paid')
		expect(setCall?.paidAt).toBeInstanceOf(Date)
	})

	it('sets status=pending with paidAt=null', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
		const res = await POST(req({ status: 'pending' }), ctx)
		expect(res.status).toBe(200)
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({ status: 'pending', paidAt: null })
	})

	it('sets status=refunded with refundedAt', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
		const res = await POST(req({ status: 'refunded' }), ctx)
		expect(res.status).toBe(200)
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall?.status).toBe('refunded')
		expect(setCall?.refundedAt).toBeInstanceOf(Date)
	})
})
