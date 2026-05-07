import { beforeEach, describe, expect, it, vi } from 'vitest'

const { processClassicRoundMock } = vi.hoisted(() => ({
	processClassicRoundMock: vi.fn(),
}))
vi.mock('@/lib/game-logic/classic', () => ({
	processClassicRound: processClassicRoundMock,
}))

// Minimal Drizzle mock — mirrors structure used in the real callers.
const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			round: { findFirst: vi.fn() },
			pick: { findMany: vi.fn() },
			gamePlayer: { findMany: vi.fn() },
			payment: { findMany: vi.fn() },
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		})),
		insert: vi.fn(() => ({
			values: vi.fn().mockResolvedValue(undefined),
		})),
	},
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { advanceGameIfReady, processGameRound } from './process-round'

function makeClassicGameAndRound(opts: { roundNumber: number; allowRebuys?: boolean }) {
	dbMock.query.game.findFirst.mockResolvedValue({
		id: 'g1',
		gameMode: 'classic',
		modeConfig: opts.allowRebuys ? { allowRebuys: true } : {},
		players: [],
		competition: { type: 'standard' },
		competitionId: 'c1',
	} as never)
	dbMock.query.round.findFirst.mockResolvedValue({
		id: 'r1',
		number: opts.roundNumber,
		fixtures: [{ status: 'finished', homeScore: 0, awayScore: 0 }],
	} as never)
	dbMock.query.pick.findMany.mockResolvedValue([])
	dbMock.query.gamePlayer.findMany.mockResolvedValue([])
	dbMock.query.payment.findMany.mockResolvedValue([])
	processClassicRoundMock.mockReturnValue({ results: [] })
}

describe('processGameRound: isStartingRound derivation', () => {
	beforeEach(() => vi.clearAllMocks())

	it('passes isStartingRound=true when round 1 and allowRebuys is not set', async () => {
		makeClassicGameAndRound({ roundNumber: 1 })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: true }),
		)
	})

	it('passes isStartingRound=false when round 1 but allowRebuys=true', async () => {
		makeClassicGameAndRound({ roundNumber: 1, allowRebuys: true })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: false }),
		)
	})

	it('passes isStartingRound=false for round 2 regardless of allowRebuys', async () => {
		makeClassicGameAndRound({ roundNumber: 2, allowRebuys: true })
		await processGameRound('g1', 'r1')
		expect(processClassicRoundMock).toHaveBeenCalledWith(
			expect.objectContaining({ isStartingRound: false }),
		)
	})
})

describe('advanceGameIfReady', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns not-active when game status is not active', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'completed',
			competitionId: 'c1',
			currentRound: { id: 'r1', number: 5, status: 'completed', deadline: null },
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'not-active' })
	})

	it('returns no-current-round when game has none', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: null,
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'no-current-round' })
	})

	it('returns round-not-completed for healthy in-progress games', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: { id: 'r1', number: 5, status: 'open', deadline: new Date() },
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'round-not-completed' })
	})

	it('refuses to advance to round with no fixtures (TBD knockout)', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: { id: 'r1', number: 3, status: 'completed', deadline: new Date() },
		} as never)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r2',
			number: 4,
			fixtures: [],
			deadline: null,
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'next-round-tbd' })
	})

	it('refuses to advance to round with null deadline even if it has fixtures', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: { id: 'r1', number: 3, status: 'completed', deadline: new Date() },
		} as never)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r2',
			number: 4,
			fixtures: [{ id: 'f1' }],
			deadline: null,
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'next-round-tbd' })
	})

	it('advances when next round has fixtures and deadline', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: { id: 'r1', number: 3, status: 'completed', deadline: new Date() },
		} as never)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r2',
			number: 4,
			fixtures: [{ id: 'f1' }],
			deadline: new Date('2026-06-15T15:00:00Z'),
		} as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: true, reason: 'advanced' })
	})

	it('reports no-next-round when none exists (and clears currentRoundId)', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			competitionId: 'c1',
			currentRound: { id: 'r-final', number: 38, status: 'completed', deadline: new Date() },
		} as never)
		dbMock.query.round.findFirst.mockResolvedValue(undefined as never)
		const r = await advanceGameIfReady('g1')
		expect(r).toEqual({ advanced: false, reason: 'no-next-round' })
	})
})
