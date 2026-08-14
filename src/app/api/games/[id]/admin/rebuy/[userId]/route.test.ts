import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
			round: { findMany: vi.fn() },
			payment: { findMany: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([{ id: 'pnew', status: 'pending' }]),
			})),
		})),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
		transaction: vi.fn(async (cb) => cb(dbMock)),
	},
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1', userId: 'target' }) }

function happyPathMocks() {
	vi.mocked(db.query.game.findFirst).mockResolvedValue({
		id: 'g1',
		createdBy: 'admin',
		gameMode: 'classic',
		modeConfig: { allowRebuys: true },
		entryFee: '10.00',
		competitionId: 'c1',
		// Created at the competition's gameweek one — the common case.
		startingRoundId: 'r1',
	} as never)
	vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
		id: 'gp-target',
		userId: 'target',
		status: 'eliminated',
		eliminatedRoundId: 'r1',
	} as never)
	vi.mocked(db.query.round.findMany).mockResolvedValue([
		{ id: 'r1', number: 1, deadline: new Date('2026-05-01') },
		{ id: 'r2', number: 2, deadline: new Date('2026-05-10T12:00:00Z') },
		{ id: 'gw12', number: 12, deadline: new Date('2026-05-04') },
		{ id: 'gw13', number: 13, deadline: new Date('2026-05-11T12:00:00Z') },
	] as never)
	vi.mocked(db.query.payment.findMany).mockResolvedValue([
		{ id: 'p1', userId: 'target', gameId: 'g1' },
	] as never)
}

describe('admin rebuy route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))
	})

	it('403s if caller is not the creator', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone-else' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('403s if target is not eligible', async () => {
		happyPathMocks()
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp-target',
			userId: 'target',
			status: 'alive',
			eliminatedRoundId: null,
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('200s for a game that started mid-season, on its own opening round (#203)', async () => {
		// A game created in November: its round one is gameweek 12 and the window
		// shuts at the gameweek-13 deadline. Before #203 the route looked for the
		// competition's round 1 and refused every mid-season game.
		happyPathMocks()
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'admin',
			gameMode: 'classic',
			modeConfig: { allowRebuys: true },
			entryFee: '10.00',
			competitionId: 'c1',
			startingRoundId: 'gw12',
		} as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp-target',
			userId: 'target',
			status: 'eliminated',
			eliminatedRoundId: 'gw12',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
	})

	it('200s on happy path and flips target to alive', async () => {
		happyPathMocks()
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
		expect(db.transaction).toHaveBeenCalledTimes(1)
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'alive',
			eliminatedRoundId: null,
			eliminatedReason: null,
		})
	})
})
