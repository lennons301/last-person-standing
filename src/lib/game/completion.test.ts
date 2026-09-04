import { describe, expect, it } from 'vitest'
import {
	type ClassicCompletionPlayer,
	type CompletionPick,
	type CupCompletionPick,
	checkClassicCompletion,
	checkCupCompletion,
	checkTurboCompletion,
} from './completion'

/**
 * The three completion verdicts, as tables over rows. No `vi.mock('@/lib/db')`
 * and no `as never` casts: these read what they are handed, so a scenario is a
 * list of players and a list of picks.
 */

/** A `game_player` row — id, whether they're standing, and where they fell. */
const player = (
	id: string,
	status: ClassicCompletionPlayer['status'],
	eliminatedRoundId: string | null = null,
): ClassicCompletionPlayer => ({ id, status, eliminatedRoundId })

/** A settled pick, as either goals tiebreak reads it. */
const pick = (
	gamePlayerId: string,
	result: CompletionPick['result'],
	goalsScored = 0,
): CompletionPick => ({ gamePlayerId, result, goalsScored })

describe('checkClassicCompletion', () => {
	it('completes with last-alive winner when exactly 1 alive', () => {
		// last-alive fires mid-round too (roundFullySettled=false): no one is left
		// to play the remaining fixtures, so the lone survivor wins immediately.
		const result = checkClassicCompletion({
			players: [player('p1', 'alive'), player('p2', 'eliminated', 'r1')],
			picks: [],
			completedRoundId: 'r1',
			roundFullySettled: false,
			hasNextRound: true,
		})
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'last-alive',
		})
	})

	it('handles mass extinction with goals tiebreaker', () => {
		// mass-extinction also fires mid-round (roundFullySettled=false): with zero
		// alive there is no one left to play on.
		const result = checkClassicCompletion({
			players: [
				player('p1', 'eliminated', 'r1'),
				player('p2', 'eliminated', 'r1'),
				player('p3', 'eliminated', 'r0'),
			],
			picks: [
				pick('p1', 'win', 3),
				pick('p1', 'win', 2),
				pick('p2', 'win', 4),
				pick('p2', 'loss', 0),
				pick('p3', 'win', 99),
			],
			completedRoundId: 'r1',
			roundFullySettled: false,
			hasNextRound: true,
		})
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'mass-extinction',
		})
	})

	it('splits when mass extinction tied on goals', () => {
		const result = checkClassicCompletion({
			players: [player('p1', 'eliminated', 'r1'), player('p2', 'eliminated', 'r1')],
			picks: [pick('p1', 'win', 5), pick('p2', 'win', 5)],
			completedRoundId: 'r1',
			roundFullySettled: false,
			hasNextRound: true,
		})
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('mass-extinction')
		expect(result.winnerPlayerIds.sort()).toEqual(['p1', 'p2'])
	})

	it('completes with rounds-exhausted when >1 alive and no next round', () => {
		const result = checkClassicCompletion({
			players: [player('p1', 'alive'), player('p2', 'alive')],
			picks: [pick('p1', 'win', 12), pick('p2', 'win', 7)],
			completedRoundId: 'r1',
			roundFullySettled: true,
			hasNextRound: false,
		})
		expect(result).toEqual({
			completed: true,
			winnerPlayerIds: ['p1'],
			reason: 'rounds-exhausted',
		})
	})

	it('does NOT complete with rounds-exhausted MID-ROUND even when no next round exists — the dc857c5f MD3 mis-crowning', () => {
		// >1 alive, no next round (WC knockout rounds not seeded), but the current
		// round is NOT fully settled (mid-matchday). "We've run out of rounds" can
		// only be true once the current round finishes — never mid-round. This is
		// the exact state that wrongly crowned Sto in MD3.
		const result = checkClassicCompletion({
			players: [player('p1', 'alive'), player('p2', 'alive')],
			picks: [],
			completedRoundId: 'r1',
			roundFullySettled: false,
			hasNextRound: false,
		})
		expect(result.completed).toBe(false)
	})

	it('does not complete when >1 alive and a next round exists', () => {
		const result = checkClassicCompletion({
			players: [player('p1', 'alive'), player('p2', 'alive')],
			picks: [],
			completedRoundId: 'r1',
			roundFullySettled: true,
			hasNextRound: true,
		})
		expect(result.completed).toBe(false)
	})

	it('does not complete when 0 alive and no eliminated cohort this round (degenerate state)', () => {
		const result = checkClassicCompletion({
			players: [player('p1', 'eliminated', 'r-old')],
			picks: [],
			completedRoundId: 'r1',
			roundFullySettled: true,
			hasNextRound: true,
		})
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
	// Cup pick rows carry a confidenceRank; the streak is rank-ordered.
	// `rawGoals` (the picked team's actual goals, pre-suppression) defaults to the
	// counted goalsScored; it only differs for 1-tier-favourite wins. The pick is
	// modelled as the home side so the raw goals come off the joined fixture.
	const cupPick = (
		gamePlayerId: string,
		confidenceRank: number,
		result: CupCompletionPick['result'],
		goalsScored = 0,
		rawGoals = goalsScored,
	): CupCompletionPick => ({
		gamePlayerId,
		confidenceRank,
		result,
		goalsScored,
		teamId: 'home-team',
		fixture: { homeTeamId: 'home-team', homeScore: rawGoals, awayScore: 0 },
	})

	const cupPlayer = (id: string, livesRemaining = 0) => ({ id, livesRemaining })

	it('crowns the longest streak across all players (tiebreak streak→lives→goals)', () => {
		// both streak 5; p1 = 7 goals, p2 = 12 goals → p2 on the goals tiebreak
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('p1'), cupPlayer('p2')],
			picks: [
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
			],
		})
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})

	it('a long BROKEN streak beats a short unbroken (alive) one — status is irrelevant, streak length wins', () => {
		// p-alive: 3 correct, never broke. p-broke: 5 correct then a loss (streak 5).
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('p-alive'), cupPlayer('p-broke')],
			picks: [
				cupPick('p-alive', 1, 'win', 1),
				cupPick('p-alive', 2, 'win', 1),
				cupPick('p-alive', 3, 'win', 1),
				cupPick('p-broke', 1, 'win', 1),
				cupPick('p-broke', 2, 'win', 1),
				cupPick('p-broke', 3, 'win', 1),
				cupPick('p-broke', 4, 'win', 1),
				cupPick('p-broke', 5, 'win', 1),
				cupPick('p-broke', 6, 'loss', 0),
			],
		})
		expect(result.winnerPlayerIds).toEqual(['p-broke'])
	})

	it('does NOT count wins that come after the streak broke (the d8360e69 mis-crowning)', () => {
		// p-scattered won 4 picks total but BROKE at rank 2 → real streak is 1.
		// p-steady won ranks 1 & 2 cleanly → streak 2. p-steady must win.
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('p-steady'), cupPlayer('p-scattered')],
			picks: [
				cupPick('p-steady', 1, 'win', 1),
				cupPick('p-steady', 2, 'win', 1),
				cupPick('p-scattered', 1, 'win', 9),
				cupPick('p-scattered', 2, 'loss', 0),
				cupPick('p-scattered', 3, 'win', 9),
				cupPick('p-scattered', 4, 'win', 9),
				cupPick('p-scattered', 5, 'win', 9),
			],
		})
		expect(result.winnerPlayerIds).toEqual(['p-steady'])
	})

	it('skips a leading universal-loss rank — the game restarts from rank 2', () => {
		// rank 1 lost for everyone. From rank 2: A wins 2 & 3, B loses 2.
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('pA'), cupPlayer('pB')],
			picks: [
				cupPick('pA', 1, 'loss', 0),
				cupPick('pA', 2, 'win', 1),
				cupPick('pA', 3, 'win', 1),
				cupPick('pB', 1, 'loss', 0),
				cupPick('pB', 2, 'loss', 0),
			],
		})
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['pA'])
	})

	it('refunds (no winner) on a total wipeout — every player got every pick wrong', () => {
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('pA'), cupPlayer('pB')],
			picks: [
				cupPick('pA', 1, 'loss', 0),
				cupPick('pA', 2, 'loss', 0),
				cupPick('pB', 1, 'loss', 0),
				cupPick('pB', 2, 'loss', 0),
			],
		})
		expect(result.completed).toBe(true)
		expect(result.reason).toBe('cup-total-wipeout')
		expect(result.refund).toBe(true)
		expect(result.winnerPlayerIds).toEqual([])
	})

	it('breaks a streak+lives+counted-goals tie on raw streak goals (no split) — the d8360e69 case', () => {
		// Both: rank-1 favourite WIN (counted goals suppressed to 0), then a rank-2
		// loss → streak 1, lives 0, counted goals 0. Raw goals separate them:
		// Sean's France scored 3, Mark's Scotland scored 1 → Sean wins, no split.
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('sean'), cupPlayer('mark')],
			picks: [
				cupPick('sean', 1, 'win', 0, 3),
				cupPick('sean', 2, 'loss', 0, 0),
				cupPick('mark', 1, 'win', 0, 1),
				cupPick('mark', 2, 'loss', 0, 0),
			],
		})
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['sean'])
	})

	it('tiebreaks equal streaks by lives', () => {
		// equal streak 3; p2 has more lives → p2
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('p1', 1), cupPlayer('p2', 3)],
			picks: [
				cupPick('p1', 1, 'win', 5),
				cupPick('p1', 2, 'win', 5),
				cupPick('p1', 3, 'win', 5),
				cupPick('p2', 1, 'win', 1),
				cupPick('p2', 2, 'win', 1),
				cupPick('p2', 3, 'win', 1),
			],
		})
		expect(result.reason).toBe('cup-longest-streak')
		expect(result.winnerPlayerIds).toEqual(['p2'])
	})

	it('does not complete when there are no players', () => {
		const result = checkCupCompletion({ gameId: 'g1', players: [], picks: [] })
		expect(result.completed).toBe(false)
	})

	it('refuses to complete while ANY pick is still pending — the 1f0d292d invariant guard', () => {
		// Even with settled picks present, a single pending pick means the
		// gameweek is incomplete → no crown. Independent of the caller's
		// round-settled gate (which stale code defeated in prod).
		const result = checkCupCompletion({
			gameId: 'g1',
			players: [cupPlayer('p1'), cupPlayer('p2')],
			picks: [
				cupPick('p1', 1, 'win', 3),
				cupPick('p2', 1, 'pending'), // a fixture hasn't been played yet
				cupPick('p2', 2, 'win', 5),
			],
		})
		expect(result.completed).toBe(false)
		expect(result.winnerPlayerIds).toEqual([])
	})
})
