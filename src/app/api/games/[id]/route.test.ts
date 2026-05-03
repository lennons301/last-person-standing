import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))

const txMock = {
	query: {
		gamePlayer: { findMany: vi.fn() },
	},
	delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
}

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: vi.fn() },
			payment: { findMany: vi.fn() },
		},
		transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => {
			await cb(txMock)
		}),
	},
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { DELETE } from './route'

const params = { params: Promise.resolve({ id: 'g1' }) }

describe('DELETE /api/games/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-admin' } } as never)
		txMock.delete.mockClear()
		txMock.query.gamePlayer.findMany.mockReset()
	})

	it('returns 404 when game does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params)
		expect(res.status).toBe(404)
	})

	it('returns 403 when caller is not the game creator', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-someone-else',
		} as never)
		const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params)
		expect(res.status).toBe(403)
	})

	it('runs deletes inside a transaction in deepest-first order when admin', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-admin',
		} as never)
		txMock.query.gamePlayer.findMany.mockResolvedValue([{ id: 'gp-1' }, { id: 'gp-2' }] as never)

		const res = await DELETE(new Request('http://x', { method: 'DELETE' }), params)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.deleted).toBe(true)

		// 6 deletes: plannedPick, pick, payment, payout, gamePlayer, game.
		expect(txMock.delete).toHaveBeenCalledTimes(6)
	})

	it('skips the plannedPick delete when the game has no players', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'u-admin',
		} as never)
		txMock.query.gamePlayer.findMany.mockResolvedValue([] as never)

		await DELETE(new Request('http://x', { method: 'DELETE' }), params)
		// 5 deletes: pick, payment, payout, gamePlayer, game (plannedPick skipped).
		expect(txMock.delete).toHaveBeenCalledTimes(5)
	})
})
