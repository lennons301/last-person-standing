import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'creator' } }),
}))

vi.mock('@/lib/game/round-lifecycle', () => ({
	openRoundForGame: vi.fn().mockResolvedValue(undefined),
}))

const { dbMock, insertReturning } = vi.hoisted(() => {
	const insertReturning = vi.fn().mockResolvedValue([{ id: 'new-game' }])
	// db.insert(...).values(...) is awaited directly for gamePlayer/payment rows
	// and chained with .returning() for the game row — mirror drizzle's thenable
	// builder shape.
	const insertValues = vi.fn(() => {
		const thenable = Promise.resolve(undefined) as Promise<undefined> & {
			returning: typeof insertReturning
		}
		thenable.returning = insertReturning
		return thenable
	})
	return {
		insertReturning,
		dbMock: {
			query: {
				competition: { findFirst: vi.fn() },
				round: { findMany: vi.fn() },
				team: { findMany: vi.fn() },
			},
			insert: vi.fn(() => ({ values: insertValues })),
		},
	}
})

vi.mock('@/lib/db', () => ({ db: dbMock }))

import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { POST } from './route'

const req = (body: unknown) =>
	new Request('http://localhost/api/games', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

const createBody = { name: 'GW1 survivors', competitionId: 'c1', gameMode: 'classic' }

describe('POST /api/games', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		insertReturning.mockResolvedValue([{ id: 'new-game' }])
		dbMock.query.competition.findFirst.mockResolvedValue({
			id: 'c1',
			type: 'league',
			status: 'active',
		} as never)
		dbMock.query.round.findMany.mockResolvedValue([
			{
				id: 'r1',
				number: 1,
				status: 'upcoming',
				deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
			},
		] as never)
	})

	it('404s when the competition does not exist', async () => {
		dbMock.query.competition.findFirst.mockResolvedValue(undefined as never)
		const res = await POST(req(createBody))
		expect(res.status).toBe(404)
	})

	it('rejects an archived competition with 400 and creates nothing', async () => {
		dbMock.query.competition.findFirst.mockResolvedValue({
			id: 'c1',
			type: 'league',
			status: 'archived',
		} as never)

		const res = await POST(req(createBody))

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('competition-archived')
		expect(dbMock.insert).not.toHaveBeenCalled()
		expect(openRoundForGame).not.toHaveBeenCalled()
	})

	it('creates a game on an active competition and opens its first round', async () => {
		const res = await POST(req(createBody))

		expect(res.status).toBe(201)
		expect((await res.json()).id).toBe('new-game')
		expect(openRoundForGame).toHaveBeenCalledWith('r1')
	})
})
