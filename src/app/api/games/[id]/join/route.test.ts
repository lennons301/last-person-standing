import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'joiner' } }),
}))

const { dbMock, insertedInto, insertedValues } = vi.hoisted(() => {
	const insertedInto: unknown[] = []
	const insertedValues: unknown[] = []
	return {
		insertedInto,
		insertedValues,
		dbMock: {
			query: {
				game: { findFirst: vi.fn() },
			},
			insert: vi.fn((table: unknown) => {
				insertedInto.push(table)
				return {
					values: (v: unknown) => {
						insertedValues.push(v)
						// `values()` is awaited directly for the payment row and chained with
						// `.returning()` for the player row — the mock has to answer both.
						const result = Promise.resolve([{ id: 'gp-new', ...(v as object) }]) as Promise<
							unknown[]
						> & { returning: () => Promise<unknown[]> }
						result.returning = () => Promise.resolve([{ id: 'gp-new', ...(v as object) }])
						return result
					},
				}
			}),
		},
	}
})
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { db } from '@/lib/db'
import { gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1' }) }
const post = () => POST(new Request('http://x', { method: 'POST' }), ctx)

/**
 * A game created mid-season: it began at gameweek 12, still sits there, and that
 * round's deadline is tomorrow.
 */
function openGame(overrides: Record<string, unknown> = {}) {
	return {
		id: 'g1',
		status: 'active',
		gameMode: 'classic',
		modeConfig: {},
		entryFee: null,
		maxPlayers: null,
		currentRoundId: 'gw12',
		startingRoundId: 'gw12',
		startingRound: { id: 'gw12', deadline: new Date('2026-08-15T11:00:00Z') },
		players: [{ userId: 'creator' }],
		...overrides,
	}
}

describe('join route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		insertedInto.length = 0
		insertedValues.length = 0
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('404s when the game does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const res = await post()
		expect(res.status).toBe(404)
	})

	it('adds the player before the starting round deadline', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(openGame() as never)

		const res = await post()

		expect(res.status).toBe(201)
		expect(insertedInto).toEqual([gamePlayer])
		expect(insertedValues[0]).toMatchObject({ gameId: 'g1', userId: 'joiner', livesRemaining: 0 })
	})

	it('takes the entry fee payment row along with the player', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(openGame({ entryFee: '10.00' }) as never)

		const res = await post()

		expect(res.status).toBe(201)
		expect(insertedInto).toEqual([gamePlayer, payment])
		expect(insertedValues[1]).toMatchObject({ gameId: 'g1', userId: 'joiner', amount: '10.00' })
	})

	it('honours modeConfig.startingLives', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({ modeConfig: { startingLives: 2 } }) as never,
		)

		await post()

		expect(insertedValues[0]).toMatchObject({ livesRemaining: 2 })
	})

	it('rejects once the starting round deadline has passed', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({
				startingRound: { id: 'gw12', deadline: new Date('2026-08-14T11:00:00Z') },
			}) as never,
		)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-started' })
		expect(insertedInto).toEqual([])
	})

	it('rejects once the game has advanced past its starting round, deadline ahead or not', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({ currentRoundId: 'gw13' }) as never,
		)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-started' })
		expect(insertedInto).toEqual([])
	})

	// The rule reads no game mode at all, which is what makes it the same rule for
	// all three; these pin it from the outside. Turbo and cup are the modes where a
	// late join is worst — one round, one deadline, so a joiner past it gets nothing
	// whatsoever for their entry fee.
	it.each([
		'classic',
		'turbo',
		'cup',
	] as const)('rejects a late join to a %s game', async (gameMode) => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({
				gameMode,
				entryFee: '10.00',
				startingRound: { id: 'gw12', deadline: new Date('2026-08-14T11:00:00Z') },
			}) as never,
		)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-started' })
		expect(insertedInto).toEqual([])
	})

	it('takes no payment row from a rejected join', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({ entryFee: '10.00', currentRoundId: 'gw13' }) as never,
		)

		await post()

		expect(insertedInto).toEqual([])
	})

	it('rejects a completed game', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(openGame({ status: 'completed' }) as never)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-completed' })
	})

	it('rejects a game still in setup', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(openGame({ status: 'setup' }) as never)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-not-open' })
	})

	it('rejects a game with no starting round recorded', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({ startingRoundId: null, startingRound: null }) as never,
		)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'game-not-open' })
	})

	it('rejects a full game', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(openGame({ maxPlayers: 1 }) as never)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'Game is full' })
	})

	it('rejects someone who is already a member', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(
			openGame({ players: [{ userId: 'creator' }, { userId: 'joiner' }] }) as never,
		)

		const res = await post()

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({ error: 'Already a member of this game' })
	})
})
