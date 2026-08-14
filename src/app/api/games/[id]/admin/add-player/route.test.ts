import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'creator' } }),
}))

const { dbMock, insertedValues } = vi.hoisted(() => {
	const insertedValues: unknown[] = []
	return {
		insertedValues,
		dbMock: {
			query: {
				game: { findFirst: vi.fn() },
				user: { findFirst: vi.fn() },
				gamePlayer: { findFirst: vi.fn() },
			},
			insert: vi.fn(() => ({
				values: (v: unknown) => {
					insertedValues.push(v)
					return { returning: () => Promise.resolve([{ id: 'gp-new', ...(v as object) }]) }
				},
			})),
		},
	}
})
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1' }) }
const post = (body: unknown) =>
	POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), ctx)

describe('admin add-player route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		insertedValues.length = 0
		vi.mocked(db.query.user.findFirst).mockResolvedValue({ id: 'late' } as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue(undefined as never)
	})

	/**
	 * The counterpart to the join route's gate: self-service entry closes when the
	 * game starts, and this route is where a friend joining late by agreement comes
	 * in. It stays completely unrestricted — a game 20 rounds deep, long past its
	 * starting round's deadline, still takes an admin add.
	 */
	it('adds a player to a game that started long ago', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'creator',
			status: 'active',
			modeConfig: {},
			startingRoundId: 'gw1',
			currentRoundId: 'gw20',
		} as never)

		const res = await post({ userId: 'late' })

		expect(res.status).toBe(200)
		expect(await res.json()).toMatchObject({ gamePlayer: { userId: 'late' } })
		expect(insertedValues[0]).toMatchObject({ gameId: 'g1', userId: 'late', status: 'alive' })
	})

	it('still refuses anyone who is not the creator', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'someone-else',
			modeConfig: {},
		} as never)

		const res = await post({ userId: 'late' })

		expect(res.status).toBe(403)
		expect(insertedValues).toEqual([])
	})

	it('still refuses a player who is already in the game', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			id: 'g1',
			createdBy: 'creator',
			modeConfig: {},
			startingRoundId: 'gw1',
			currentRoundId: 'gw20',
		} as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp-existing' } as never)

		const res = await post({ userId: 'late' })

		expect(res.status).toBe(409)
		expect(insertedValues).toEqual([])
	})
})
