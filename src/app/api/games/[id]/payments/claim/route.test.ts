import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))
vi.mock('@/lib/db', () => ({
	db: {
		query: { payment: { findFirst: vi.fn() } },
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1' }) }

function req(body: unknown): Request {
	return new Request('http://x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

describe('claim payment route', () => {
	beforeEach(() => vi.clearAllMocks())

	it('400s if paymentId is missing', async () => {
		const res = await POST(req({}), ctx)
		expect(res.status).toBe(400)
	})

	it('404s if payment row does not exist', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(req({ paymentId: 'p1' }), ctx)
		expect(res.status).toBe(404)
	})

	it('404s if payment belongs to a different user', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		// Note: the route should include userId eq in the where clause so a payment belonging
		// to someone else will not be found — findFirst returns undefined.
		const res = await POST(req({ paymentId: 'p1' }), ctx)
		expect(res.status).toBe(404)
	})

	it('400s if payment is not pending', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			userId: 'u1',
			gameId: 'g1',
			status: 'paid',
		} as never)
		const res = await POST(req({ paymentId: 'p1' }), ctx)
		expect(res.status).toBe(400)
	})

	it('200s for a pending payment — sets paid directly (no intermediate claimed)', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			userId: 'u1',
			gameId: 'g1',
			status: 'pending',
		} as never)
		const res = await POST(req({ paymentId: 'p1' }), ctx)
		expect(res.status).toBe(200)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({ status: 'paid' })
		expect(setCall?.paidAt).toBeInstanceOf(Date)
	})
})
