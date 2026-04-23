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

describe('claim payment route', () => {
	beforeEach(() => vi.clearAllMocks())

	it('404s if no payment row exists', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('400s if payment is already claimed or paid', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ status: 'paid' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(400)
	})

	it('200s for a pending payment', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'p1',
			status: 'pending',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
	})
})
