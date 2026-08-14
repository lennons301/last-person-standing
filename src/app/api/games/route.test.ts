import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { user } from '@/lib/schema/auth'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'creator' } }),
}))

vi.mock('@/lib/game/round-lifecycle', () => ({
	openRoundForGame: vi.fn().mockResolvedValue(undefined),
}))

const { dbMock, insertReturning, insertValues, updateSet, updateWhere } = vi.hoisted(() => {
	const insertReturning = vi.fn().mockResolvedValue([{ id: 'new-game' }])
	const updateWhere = vi.fn().mockResolvedValue(undefined)
	const updateSet = vi.fn(() => ({ where: updateWhere }))
	// db.insert(...).values(...) is awaited directly for gamePlayer/payment rows
	// and chained with .returning() for the game row — mirror drizzle's thenable
	// builder shape.
	const insertValues = vi.fn((_values: Record<string, unknown>) => {
		const thenable = Promise.resolve(undefined) as Promise<undefined> & {
			returning: typeof insertReturning
		}
		thenable.returning = insertReturning
		return thenable
	})
	return {
		insertReturning,
		insertValues,
		updateSet,
		updateWhere,
		dbMock: {
			query: {
				competition: { findFirst: vi.fn() },
				round: { findMany: vi.fn() },
				team: { findMany: vi.fn() },
			},
			insert: vi.fn(() => ({ values: insertValues })),
			update: vi.fn(() => ({ set: updateSet })),
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

describe('POST /api/games — visibility', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		insertReturning.mockResolvedValue([{ id: 'new-game' }])
		dbMock.query.competition.findFirst.mockResolvedValue({
			id: 'c1',
			type: 'league',
			status: 'active',
		} as never)
		dbMock.query.round.findMany.mockResolvedValue([
			{ id: 'r1', number: 1, status: 'upcoming', deadline: new Date(Date.now() + 86_400_000) },
		] as never)
	})

	// The game row is the first insert the handler makes; the creator's
	// game_player row and any payment row follow it.
	const gameRow = () => insertValues.mock.calls[0][0]

	it('is public when the request expresses no preference', async () => {
		const res = await POST(req(createBody))

		expect(res.status).toBe(201)
		expect(gameRow().visibility).toBe('public')
	})

	it('persists the creator’s private choice', async () => {
		const res = await POST(req({ ...createBody, visibility: 'private' }))

		expect(res.status).toBe(201)
		expect(gameRow().visibility).toBe('private')
	})

	it('persists an explicit public choice', async () => {
		const res = await POST(req({ ...createBody, visibility: 'public' }))

		expect(res.status).toBe(201)
		expect(gameRow().visibility).toBe('public')
	})

	it('gives a public game an invite code all the same', async () => {
		await POST(req({ ...createBody, visibility: 'public' }))

		// Public adds a second way in; it never replaces the link.
		expect(gameRow().inviteCode).toMatch(/^[A-Z0-9]+$/)
	})

	it('rejects an unrecognised visibility with 400 and creates nothing', async () => {
		const res = await POST(req({ ...createBody, visibility: 'unlisted' }))

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('invalid-visibility')
		expect(dbMock.insert).not.toHaveBeenCalled()
	})
})

describe("POST /api/games — the creator's payment handle", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		insertReturning.mockResolvedValue([{ id: 'new-game' }])
		dbMock.query.competition.findFirst.mockResolvedValue({
			id: 'c1',
			type: 'league',
			status: 'active',
		} as never)
		dbMock.query.round.findMany.mockResolvedValue([
			{ id: 'r1', number: 1, status: 'upcoming', deadline: new Date(Date.now() + 86_400_000) },
		] as never)
	})

	it('saves the handle to the creator, normalised', async () => {
		const res = await POST(
			req({ ...createBody, paymentProvider: 'monzo', paymentHandle: '@alicejones' }),
		)

		expect(res.status).toBe(201)
		expect(updateSet).toHaveBeenCalledWith({
			paymentProvider: 'monzo',
			paymentHandle: 'alicejones',
		})
	})

	it('clears the stored handle when the creator submits an empty one', async () => {
		const res = await POST(req({ ...createBody, paymentProvider: null, paymentHandle: '' }))

		expect(res.status).toBe(201)
		expect(updateSet).toHaveBeenCalledWith({ paymentProvider: null, paymentHandle: null })
	})

	it('leaves the stored handle alone when the request says nothing about it', async () => {
		const res = await POST(req(createBody))

		expect(res.status).toBe(201)
		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it('rejects an unusable handle with 400 and creates nothing', async () => {
		const res = await POST(
			req({ ...createBody, paymentProvider: 'monzo', paymentHandle: 'https://evil.example' }),
		)

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('invalid-payment-handle')
		expect(dbMock.insert).not.toHaveBeenCalled()
	})

	it('rejects an unknown provider with 400', async () => {
		const res = await POST(
			req({ ...createBody, paymentProvider: 'paypal', paymentHandle: 'alicejones' }),
		)

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('invalid-payment-handle')
	})

	it('rejects a handle with no provider chosen with 400', async () => {
		const res = await POST(req({ ...createBody, paymentProvider: null, paymentHandle: 'alice' }))

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('invalid-payment-handle')
	})

	it('leaves the stored handle untouched when game creation fails late', async () => {
		// Every round's deadline has passed, so the handler 400s after the point
		// the handle used to be written. A rejected create-game must not have
		// re-pointed where the creator's existing games collect.
		dbMock.query.round.findMany.mockResolvedValue([
			{ id: 'r1', number: 1, status: 'upcoming', deadline: new Date(Date.now() - 86_400_000) },
		] as never)

		const res = await POST(
			req({ ...createBody, paymentProvider: 'monzo', paymentHandle: 'alicejones' }),
		)

		expect(res.status).toBe(400)
		expect((await res.json()).error).toBe('no-pickable-round')
		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it("writes the handle to the session's own user row, never to a userId in the body", async () => {
		await POST(
			req({
				...createBody,
				paymentProvider: 'monzo',
				paymentHandle: 'alicejones',
				userId: 'someone-else',
			}),
		)

		// Same guarantee as the edit endpoint: the row is chosen by session id
		// alone, so create-game can't be used to point someone else's pot
		// somewhere new.
		expect(updateWhere).toHaveBeenCalledTimes(1)
		expect(updateWhere).toHaveBeenCalledWith(eq(user.id, 'creator'))
	})
})
