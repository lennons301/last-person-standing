import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { user } from '@/lib/schema/auth'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'alice' } }),
}))

const { dbMock, updateSet, updateWhere } = vi.hoisted(() => {
	const updateWhere = vi.fn().mockResolvedValue(undefined)
	const updateSet = vi.fn(() => ({ where: updateWhere }))
	return {
		updateSet,
		updateWhere,
		dbMock: { update: vi.fn(() => ({ set: updateSet })) },
	}
})

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { requireSession } from '@/lib/auth-helpers'
import { POST } from './route'

const req = (body: unknown) =>
	new Request('http://localhost/api/me/payment-handle', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(requireSession).mockResolvedValue({ user: { id: 'alice' } } as never)
})

describe('POST /api/me/payment-handle', () => {
	it("saves the caller's own handle, normalised", async () => {
		const res = await POST(req({ provider: 'revolut', handle: 'revolut.me/alicejones' }))

		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ provider: 'revolut', handle: 'alicejones' })
		expect(updateSet).toHaveBeenCalledWith({
			paymentProvider: 'revolut',
			paymentHandle: 'alicejones',
		})
	})

	it('clears the handle when both fields are empty', async () => {
		const res = await POST(req({ provider: null, handle: '' }))

		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ provider: null, handle: null })
		expect(updateSet).toHaveBeenCalledWith({ paymentProvider: null, paymentHandle: null })
	})

	it('rejects an unusable handle with 400 and writes nothing', async () => {
		const res = await POST(req({ provider: 'monzo', handle: 'https://monzo.me/alice' }))

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('invalid-payment-handle')
		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it('writes only to the authenticated user, never to a userId in the body', async () => {
		await POST(req({ provider: 'monzo', handle: 'alicejones', userId: 'bob' }))

		// The row is chosen by the session id alone — a userId in the body has no
		// path to the query.
		expect(updateWhere).toHaveBeenCalledTimes(1)
		expect(updateWhere).toHaveBeenCalledWith(eq(user.id, 'alice'))
	})

	it('requires a session', async () => {
		vi.mocked(requireSession).mockRejectedValue(new Error('redirect to /login'))
		await expect(POST(req({ provider: 'monzo', handle: 'alicejones' }))).rejects.toThrow()
		expect(dbMock.update).not.toHaveBeenCalled()
	})
})
