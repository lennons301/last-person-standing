import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			gamePlayer: { findMany: vi.fn() },
			pick: { findMany: vi.fn() },
			round: { findFirst: vi.fn() },
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

import { checkClassicCompletion, checkCupCompletion, checkTurboCompletion } from './auto-complete'

describe('checkClassicCompletion', () => {
	beforeEach(() => vi.clearAllMocks())

	it('completes with last-alive winner when exactly 1 alive', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
			{ id: 'p2', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 5)
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'last-alive',
		})
	})

	it('handles mass extinction with goals tiebreaker', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'p2', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'p3', status: 'eliminated', eliminatedRoundId: 'r0', livesRemaining: 0 },
		] as never)
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 3 },
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 2 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 4 },
			{ gamePlayerId: 'p2', result: 'loss', goalsScored: 0 },
			{ gamePlayerId: 'p3', result: 'win', goalsScored: 99 },
		] as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 5)
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'mass-extinction',
		})
	})

	it('splits when mass extinction tied on goals', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'p2', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 5 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 5 },
		] as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 5)
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('mass-extinction')
		expect(result.winnerPlayerIds.sort()).toEqual(['p1', 'p2'])
	})

	it('completes with rounds-exhausted when >1 alive and no next round', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
			{ id: 'p2', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
		] as never)
		dbMock.query.round.findFirst.mockResolvedValue(null as never)
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 12 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 7 },
		] as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 38)
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'rounds-exhausted',
		})
	})

	it('does not complete when >1 alive and a next round exists', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
			{ id: 'p2', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
		] as never)
		dbMock.query.round.findFirst.mockResolvedValue({ id: 'r2', number: 6 } as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 5)
		expect(result.completed).toBe(false)
	})

	it('does not complete when 0 alive and no eliminated cohort this round (degenerate state)', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'eliminated', eliminatedRoundId: 'r-old', livesRemaining: 0 },
		] as never)

		const result = await checkClassicCompletion('g1', 'c1', 'r1', 5)
		expect(result.completed).toBe(false)
	})
})

describe('checkTurboCompletion', () => {
	it('always completes', () => {
		const result = checkTurboCompletion([
			{ gamePlayerId: 'p1', streak: 7, goalsInStreak: 12 },
			{ gamePlayerId: 'p2', streak: 5, goalsInStreak: 99 },
		])
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('turbo-single-round')
		expect(result.winnerPlayerIds).toEqual(['p1'])
	})

	it('splits on full tie', () => {
		const result = checkTurboCompletion([
			{ gamePlayerId: 'p1', streak: 5, goalsInStreak: 8 },
			{ gamePlayerId: 'p2', streak: 5, goalsInStreak: 8 },
		])
		expect(result.completed).toBe(true)
		expect(result.winnerPlayerIds.sort()).toEqual(['p1', 'p2'])
	})

	it('completes with empty winners when no players', () => {
		const result = checkTurboCompletion([])
		expect(result.completed).toBe(true)
		expect(result.winnerPlayerIds).toEqual([])
	})
})

describe('checkCupCompletion (single gameweek — longest streak)', () => {
	beforeEach(() => vi.clearAllMocks())

	it('crowns the longest streak across all players (tiebreak streak→lives→goals)', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'p2', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		// both streak 5; p1 = 7 goals, p2 = 12 goals → p2 on the goals tiebreak
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 3 },
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 2 },
			{ gamePlayerId: 'p1', result: 'draw', goalsScored: 1 },
			{ gamePlayerId: 'p1', result: 'saved_by_life', goalsScored: 1 },
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 0 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 4 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 4 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 4 },
			{ gamePlayerId: 'p2', result: 'draw', goalsScored: 0 },
			{ gamePlayerId: 'p2', result: 'saved_by_life', goalsScored: 0 },
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})

	it('a long BROKEN streak beats a short unbroken (alive) one — status is irrelevant, streak length wins', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p-alive', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
			{ id: 'p-broke', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		// p-alive: 3 correct, never broke. p-broke: 5 correct then a loss (streak 5).
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p-alive', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-alive', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-alive', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p-broke', result: 'loss', goalsScored: 0 },
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.winnerPlayerIds).toEqual(['p-broke'])
	})

	it('tiebreaks equal streaks by lives', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'alive', eliminatedRoundId: null, livesRemaining: 1 },
			{ id: 'p2', status: 'alive', eliminatedRoundId: null, livesRemaining: 3 },
		] as never)
		// equal streak 3; p2 has more lives → p2
		dbMock.query.pick.findMany.mockResolvedValue([
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 5 },
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 5 },
			{ gamePlayerId: 'p1', result: 'win', goalsScored: 5 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 1 },
			{ gamePlayerId: 'p2', result: 'win', goalsScored: 1 },
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})
})
