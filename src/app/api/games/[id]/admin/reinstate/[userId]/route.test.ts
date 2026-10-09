import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
		},
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { POST } from './route'

const ctx = () => ({ params: Promise.resolve({ id: 'g1', userId: 'u-target' }) })
const req = () => new Request('http://localhost/reinstate', { method: 'POST' })

/** The patch the route wrote to `game_player`, or undefined if it wrote none. */
function playerPatch(): unknown {
	return dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0]
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'admin' })
	dbMock.query.gamePlayer.findFirst.mockResolvedValue({
		id: 'gp1',
		userId: 'u-target',
		status: 'eliminated',
		eliminatedReason: 'loss',
		eliminatedRoundId: 'r7',
	})
})

describe('POST admin/reinstate', () => {
	it('rejects a non-admin with 403', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({ id: 'g1', createdBy: 'someone-else' })
		expect((await POST(req(), ctx())).status).toBe(403)
		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it('404s when the game does not exist', async () => {
		dbMock.query.game.findFirst.mockResolvedValue(undefined)
		expect((await POST(req(), ctx())).status).toBe(404)
	})

	it('404s when the player is not in the game', async () => {
		dbMock.query.gamePlayer.findFirst.mockResolvedValue(undefined)
		expect((await POST(req(), ctx())).status).toBe(404)
	})

	it('puts an eliminated player back in and takes no money', async () => {
		const res = await POST(req(), ctx())
		expect(res.status).toBe(200)
		expect((await res.json()).status).toBe('alive')
		expect(playerPatch()).toEqual({
			status: 'alive',
			eliminatedReason: null,
			eliminatedRoundId: null,
		})
		// No payment row: the entry this undoes has already been settled. Charging
		// a second fee is what the rebuy routes are for.
		expect((dbMock as { insert?: unknown }).insert).toBeUndefined()
	})

	it('reinstates whatever took the player out, window or no window', async () => {
		// No round is read at all — this is the deliberate admin act, past the
		// rebuy window as much as inside it (#280).
		dbMock.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundId: 'r30',
		})
		expect((await POST(req(), ctx())).status).toBe(200)
		expect(playerPatch()).toMatchObject({ status: 'alive' })
	})

	it('400s on an alive player rather than reporting a silent success', async () => {
		dbMock.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'alive',
			eliminatedReason: null,
			eliminatedRoundId: null,
		})
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('not-eliminated')
		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it('refuses an admin-removed player', async () => {
		dbMock.query.gamePlayer.findFirst.mockResolvedValue({
			id: 'gp1',
			userId: 'u-target',
			status: 'eliminated',
			eliminatedReason: 'admin_removed',
			eliminatedRoundId: null,
		})
		const res = await POST(req(), ctx())
		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('player-removed')
		expect(dbMock.update).not.toHaveBeenCalled()
	})
})
