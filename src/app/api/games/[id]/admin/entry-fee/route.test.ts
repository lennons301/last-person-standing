import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock, txUpdate } = vi.hoisted(() => {
	const txUpdate = vi.fn(() => ({
		set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
	}))
	return {
		txUpdate,
		dbMock: {
			query: { game: { findFirst: vi.fn() } },
			transaction: vi.fn(async (cb: (tx: { update: typeof txUpdate }) => unknown) =>
				cb({ update: txUpdate }),
			),
		},
	}
})

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { POST } from './route'

const ctx = (gameId = 'g1') => ({ params: Promise.resolve({ id: gameId }) })
const req = (body: unknown) =>
	new Request('http://localhost/entry-fee', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'admin', status: 'active' })
})

describe('POST admin/entry-fee', () => {
	it('rejects a non-admin with 403', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			createdBy: 'other',
			status: 'active',
		})
		expect((await POST(req({ entryFee: '15' }), ctx())).status).toBe(403)
	})

	it('404s when the game does not exist', async () => {
		dbMock.query.game.findFirst.mockResolvedValue(undefined)
		expect((await POST(req({ entryFee: '15' }), ctx())).status).toBe(404)
	})

	it('rejects an invalid (negative / non-numeric) entry fee with 400', async () => {
		expect((await POST(req({ entryFee: '-5' }), ctx())).status).toBe(400)
		expect((await POST(req({ entryFee: 'abc' }), ctx())).status).toBe(400)
		expect((await POST(req({}), ctx())).status).toBe(400)
	})

	it('refuses to change the fee on a completed game', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			createdBy: 'admin',
			status: 'completed',
		})
		const res = await POST(req({ entryFee: '15' }), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('game-completed')
	})

	it('updates the fee and bumps existing payments (normalised to 2dp)', async () => {
		const res = await POST(req({ entryFee: '15' }), ctx())
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.entryFee).toBe('15.00')
		// One transaction, two updates inside it: game.entryFee + payment.amount.
		expect(dbMock.transaction).toHaveBeenCalledOnce()
		expect(txUpdate).toHaveBeenCalledTimes(2)
	})
})
