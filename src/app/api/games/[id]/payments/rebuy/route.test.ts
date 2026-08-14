import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
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

const ctx = { params: Promise.resolve({ id: 'g1' }) }

function happyPathMocks() {
	vi.mocked(db.query.game.findFirst).mockResolvedValue({
		id: 'g1',
		gameMode: 'classic',
		modeConfig: { allowRebuys: true },
		entryFee: '10.00',
		competitionId: 'c1',
		// Created at the competition's gameweek one — the common case.
		startingRoundId: 'r1',
	} as never)
	vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
		id: 'gp1',
		userId: 'u1',
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
		{ id: 'p1', userId: 'u1', gameId: 'g1' },
	] as never)
}

describe('player rebuy route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))
	})

	it('404s if game does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('403s if game does not have allowRebuys=true', async () => {
		happyPathMocks()
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			gameMode: 'classic',
			modeConfig: { allowRebuys: false },
			entryFee: '10.00',
			competitionId: 'c1',
			startingRoundId: 'r1',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('403s if player is still alive', async () => {
		happyPathMocks()
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp1',
			userId: 'u1',
			status: 'alive',
			eliminatedRoundId: null,
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('403s if player is eliminated in a round other than round 1', async () => {
		happyPathMocks()
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp1',
			userId: 'u1',
			status: 'eliminated',
			eliminatedRoundId: 'r2',
		} as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('403s if now >= round 2 deadline', async () => {
		happyPathMocks()
		vi.setSystemTime(new Date('2026-05-10T12:00:01Z'))
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('403s if already rebought (paymentRowCount >= 2)', async () => {
		happyPathMocks()
		vi.mocked(db.query.payment.findMany).mockResolvedValue([
			{ id: 'p1', userId: 'u1', gameId: 'g1' },
			{ id: 'p2', userId: 'u1', gameId: 'g1' },
		] as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	/** A game created in November: round one is gameweek 12, round two gameweek 13. */
	function midSeasonGameMocks() {
		happyPathMocks()
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			gameMode: 'classic',
			modeConfig: { allowRebuys: true },
			entryFee: '10.00',
			competitionId: 'c1',
			startingRoundId: 'gw12',
		} as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
			id: 'gp1',
			userId: 'u1',
			status: 'eliminated',
			eliminatedRoundId: 'gw12',
		} as never)
	}

	it("200s for a game that started mid-season, within its own second round's deadline (#203)", async () => {
		// Before #203 this route wanted the competition's round 1 and its round 2
		// deadline — months past for a November game — so no rebuy was ever possible.
		midSeasonGameMocks()
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
	})

	it("403s once the deadline of the round after the game's opening one has passed", async () => {
		midSeasonGameMocks()
		vi.setSystemTime(new Date('2026-05-11T12:00:01Z'))
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(403)
	})

	it('200s on happy path and runs inside a transaction', async () => {
		happyPathMocks()
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
		expect(db.transaction).toHaveBeenCalledTimes(1)

		// New payment row inserted
		expect(db.insert).toHaveBeenCalled()
		// Game player flipped to alive
		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'alive',
			eliminatedRoundId: null,
			eliminatedReason: null,
		})

		// Response includes paymentId
		const json = await res.json()
		expect(json).toMatchObject({ paymentId: 'pnew', status: 'pending' })
	})
})
