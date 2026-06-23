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
	// Build a turbo player from [rank, correct, goals] tuples.
	const tp = (
		gamePlayerId: string,
		picks: Array<[rank: number, correct: boolean, goals?: number]>,
	) => ({
		gamePlayerId,
		livesRemaining: 0,
		picks: picks.map(([rank, correct, goals = 0]) => ({ rank, correct, goals })),
	})

	it('crowns the longest streak and always completes', () => {
		const result = checkTurboCompletion([
			tp('p1', [
				[1, true, 4],
				[2, true, 4],
				[3, true, 4],
			]),
			tp('p2', [
				[1, true, 9],
				[2, false],
			]),
		])
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('turbo-single-round')
		expect(result.winnerPlayerIds).toEqual(['p1'])
	})

	it('tiebreaks equal streaks by goals (no lives in turbo)', () => {
		const result = checkTurboCompletion([
			tp('p1', [
				[1, true, 1],
				[2, true, 1],
			]),
			tp('p2', [
				[1, true, 5],
				[2, true, 5],
			]),
		])
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})

	it('splits on full tie', () => {
		const result = checkTurboCompletion([
			tp('p1', [
				[1, true, 4],
				[2, true, 4],
			]),
			tp('p2', [
				[1, true, 4],
				[2, true, 4],
			]),
		])
		expect(result.completed).toBe(true)
		expect(result.winnerPlayerIds.sort()).toEqual(['p1', 'p2'])
	})

	it('skips a leading universal-loss rank, then crowns the rebased streak', () => {
		const result = checkTurboCompletion([
			tp('p1', [
				[1, false],
				[2, true, 2],
				[3, true, 3],
			]),
			tp('p2', [
				[1, false],
				[2, false],
			]),
		])
		expect(result.reason).toBe('turbo-single-round')
		expect(result.winnerPlayerIds).toEqual(['p1'])
	})

	it('refunds (no winner) on a total wipeout — everyone got every pick wrong', () => {
		const result = checkTurboCompletion([
			tp('p1', [
				[1, false],
				[2, false],
			]),
			tp('p2', [
				[1, false],
				[2, false],
			]),
		])
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('turbo-total-wipeout')
		expect(result.refund).toBe(true)
		expect(result.winnerPlayerIds).toEqual([])
	})

	it('completes with empty winners (no refund) when no players', () => {
		const result = checkTurboCompletion([])
		expect(result.completed).toBe(true)
		expect(result.winnerPlayerIds).toEqual([])
		expect(result.refund).toBeFalsy()
	})
})

describe('checkCupCompletion (single gameweek — longest streak)', () => {
	beforeEach(() => vi.clearAllMocks())

	// Cup pick rows carry a confidenceRank; the streak is now rank-ordered.
	const cupPick = (
		gamePlayerId: string,
		confidenceRank: number,
		result: string,
		goalsScored = 0,
	) => ({ gamePlayerId, confidenceRank, result, goalsScored })

	it('crowns the longest streak across all players (tiebreak streak→lives→goals)', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'p2', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		// both streak 5; p1 = 7 goals, p2 = 12 goals → p2 on the goals tiebreak
		dbMock.query.pick.findMany.mockResolvedValue([
			cupPick('p1', 1, 'win', 3),
			cupPick('p1', 2, 'win', 2),
			cupPick('p1', 3, 'draw', 1),
			cupPick('p1', 4, 'saved_by_life', 1),
			cupPick('p1', 5, 'win', 0),
			cupPick('p2', 1, 'win', 4),
			cupPick('p2', 2, 'win', 4),
			cupPick('p2', 3, 'win', 4),
			cupPick('p2', 4, 'draw', 0),
			cupPick('p2', 5, 'saved_by_life', 0),
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
			cupPick('p-alive', 1, 'win', 1),
			cupPick('p-alive', 2, 'win', 1),
			cupPick('p-alive', 3, 'win', 1),
			cupPick('p-broke', 1, 'win', 1),
			cupPick('p-broke', 2, 'win', 1),
			cupPick('p-broke', 3, 'win', 1),
			cupPick('p-broke', 4, 'win', 1),
			cupPick('p-broke', 5, 'win', 1),
			cupPick('p-broke', 6, 'loss', 0),
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.winnerPlayerIds).toEqual(['p-broke'])
	})

	it('does NOT count wins that come after the streak broke (the d8360e69 mis-crowning)', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p-steady', status: 'alive', eliminatedRoundId: null, livesRemaining: 0 },
			{ id: 'p-scattered', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		// p-scattered won 4 picks total but BROKE at rank 2 → real streak is 1.
		// p-steady won ranks 1 & 2 cleanly → streak 2. p-steady must win.
		dbMock.query.pick.findMany.mockResolvedValue([
			cupPick('p-steady', 1, 'win', 1),
			cupPick('p-steady', 2, 'win', 1),
			cupPick('p-scattered', 1, 'win', 9),
			cupPick('p-scattered', 2, 'loss', 0),
			cupPick('p-scattered', 3, 'win', 9),
			cupPick('p-scattered', 4, 'win', 9),
			cupPick('p-scattered', 5, 'win', 9),
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.winnerPlayerIds).toEqual(['p-steady'])
	})

	it('skips a leading universal-loss rank — the game restarts from rank 2', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'pA', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'pB', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		// rank 1 lost for everyone. From rank 2: A wins 2 & 3, B loses 2.
		dbMock.query.pick.findMany.mockResolvedValue([
			cupPick('pA', 1, 'loss', 0),
			cupPick('pA', 2, 'win', 1),
			cupPick('pA', 3, 'win', 1),
			cupPick('pB', 1, 'loss', 0),
			cupPick('pB', 2, 'loss', 0),
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['pA'])
	})

	it('refunds (no winner) on a total wipeout — every player got every pick wrong', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'pA', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
			{ id: 'pB', status: 'eliminated', eliminatedRoundId: 'r1', livesRemaining: 0 },
		] as never)
		dbMock.query.pick.findMany.mockResolvedValue([
			cupPick('pA', 1, 'loss', 0),
			cupPick('pA', 2, 'loss', 0),
			cupPick('pB', 1, 'loss', 0),
			cupPick('pB', 2, 'loss', 0),
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('cup-total-wipeout')
		expect(result.refund).toBe(true)
		expect(result.winnerPlayerIds).toEqual([])
	})

	it('tiebreaks equal streaks by lives', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([
			{ id: 'p1', status: 'alive', eliminatedRoundId: null, livesRemaining: 1 },
			{ id: 'p2', status: 'alive', eliminatedRoundId: null, livesRemaining: 3 },
		] as never)
		// equal streak 3; p2 has more lives → p2
		dbMock.query.pick.findMany.mockResolvedValue([
			cupPick('p1', 1, 'win', 5),
			cupPick('p1', 2, 'win', 5),
			cupPick('p1', 3, 'win', 5),
			cupPick('p2', 1, 'win', 1),
			cupPick('p2', 2, 'win', 1),
			cupPick('p2', 3, 'win', 1),
		] as never)

		const result = await checkCupCompletion('g1')
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})

	it('ignores void picks and does not complete when there are no players', async () => {
		dbMock.query.gamePlayer.findMany.mockResolvedValue([] as never)
		const result = await checkCupCompletion('g1')
		expect(result.completed).toBe(false)
	})
})
