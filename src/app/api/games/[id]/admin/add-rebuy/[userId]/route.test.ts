import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => {
	const dbMock: Record<string, never> | Record<string, unknown> = {
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
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
		transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(dbMock)),
	}
	return { dbMock }
})

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { POST } from './route'

const ctx = (gameId = 'g1', userId = 'u-target') => ({
	params: Promise.resolve({ id: gameId, userId }),
})
const req = () => new Request('http://localhost/add-rebuy', { method: 'POST' })

const db = dbMock as {
	query: {
		game: { findFirst: ReturnType<typeof vi.fn> }
		gamePlayer: { findFirst: ReturnType<typeof vi.fn> }
		payment: { findFirst: ReturnType<typeof vi.fn> }
	}
	insert: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
	transaction: ReturnType<typeof vi.fn>
}

/** The patch the route wrote to `game_player`, or undefined if it wrote none. */
function playerPatch(): unknown {
	return db.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
}

beforeEach(() => {
	vi.clearAllMocks()
	db.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'admin', entryFee: '10.00' })
	db.query.gamePlayer.findFirst.mockResolvedValue({
		id: 'gp1',
		userId: 'u-target',
		status: 'alive',
		eliminatedReason: null,
	})
	db.query.payment.findFirst.mockResolvedValue(undefined)
})

describe('POST add-rebuy', () => {
	it('rejects a non-admin with 403', async () => {
		db.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'someone-else' })
		expect((await POST(req(), ctx())).status).toBe(403)
	})

	it('404s when the player is not in the game', async () => {
		db.query.gamePlayer.findFirst.mockResolvedValue(undefined)
		expect((await POST(req(), ctx())).status).toBe(404)
	})

	it('refuses to stack a second outstanding entry', async () => {
		db.query.payment.findFirst.mockResolvedValue({ id: 'p-pending', status: 'pending' })
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('pending-entry-exists')
	})

	it('creates a pending rebuy entry', async () => {
		const res = await POST(req(), ctx())
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.status).toBe('pending')
		expect(body.paymentId).toBe('pay-new')
		expect(db.insert).toHaveBeenCalledOnce()
	})

	it('leaves an alive player alone — there is nothing to reinstate', async () => {
		const res = await POST(req(), ctx())
		expect((await res.json()).reinstated).toBe(false)
		expect(db.update).not.toHaveBeenCalled()
	})

	it('puts an eliminated player back in the game, whatever took them out (#280)', async () => {
		// The trap this closes: the entry was recorded and paid, the player stayed
		// eliminated, and the second payment row then made `isRebuyEligible` false
		// so no other route would reactivate them either.
		db.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'eliminated',
			eliminatedReason: 'loss',
			eliminatedRoundId: 'r7',
		})
		const res = await POST(req(), ctx())
		expect(res.status).toBe(200)
		expect((await res.json()).reinstated).toBe(true)
		expect(playerPatch()).toEqual({
			status: 'alive',
			eliminatedReason: null,
			eliminatedRoundId: null,
		})
	})

	it('writes the payment row and the reinstatement in one transaction', async () => {
		db.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'eliminated',
			eliminatedReason: 'missed_rebuy_pick',
			eliminatedRoundId: 'r2',
		})
		await POST(req(), ctx())
		expect(db.transaction).toHaveBeenCalledOnce()
	})

	it('refuses an admin-removed player rather than selling them back in', async () => {
		db.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'eliminated',
			eliminatedReason: 'admin_removed',
			eliminatedRoundId: null,
		})
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('player-removed')
		expect(db.insert).not.toHaveBeenCalled()
		expect(db.update).not.toHaveBeenCalled()
	})
})
