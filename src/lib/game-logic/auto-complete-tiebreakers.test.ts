import { describe, expect, it } from 'vitest'
import {
	classicTiebreaker,
	cupTiebreaker,
	resolveWipeout,
	turboTiebreaker,
	type WipeoutPlayerInput,
} from './auto-complete-tiebreakers'

describe('classicTiebreaker', () => {
	it('picks the sole top scorer', () => {
		expect(
			classicTiebreaker([
				{ gamePlayerId: 'a', totalWinningGoals: 7 },
				{ gamePlayerId: 'b', totalWinningGoals: 5 },
				{ gamePlayerId: 'c', totalWinningGoals: 3 },
			]),
		).toEqual(['a'])
	})

	it('returns all tied at top for split', () => {
		expect(
			classicTiebreaker([
				{ gamePlayerId: 'a', totalWinningGoals: 7 },
				{ gamePlayerId: 'b', totalWinningGoals: 7 },
				{ gamePlayerId: 'c', totalWinningGoals: 3 },
			]),
		).toEqual(['a', 'b'])
	})

	it('handles all zeros (no wins) by splitting', () => {
		expect(
			classicTiebreaker([
				{ gamePlayerId: 'a', totalWinningGoals: 0 },
				{ gamePlayerId: 'b', totalWinningGoals: 0 },
			]),
		).toEqual(['a', 'b'])
	})

	it('returns empty for empty input', () => {
		expect(classicTiebreaker([])).toEqual([])
	})
})

describe('turboTiebreaker', () => {
	it('picks sole top streak', () => {
		expect(
			turboTiebreaker([
				{ gamePlayerId: 'a', streak: 8, goalsInStreak: 10 },
				{ gamePlayerId: 'b', streak: 5, goalsInStreak: 20 },
			]),
		).toEqual(['a'])
	})

	it('falls through to goals-in-streak when streak ties', () => {
		expect(
			turboTiebreaker([
				{ gamePlayerId: 'a', streak: 7, goalsInStreak: 12 },
				{ gamePlayerId: 'b', streak: 7, goalsInStreak: 18 },
				{ gamePlayerId: 'c', streak: 6, goalsInStreak: 99 },
			]),
		).toEqual(['b'])
	})

	it('splits on full tie (streak + goals)', () => {
		expect(
			turboTiebreaker([
				{ gamePlayerId: 'a', streak: 7, goalsInStreak: 18 },
				{ gamePlayerId: 'b', streak: 7, goalsInStreak: 18 },
				{ gamePlayerId: 'c', streak: 5, goalsInStreak: 30 },
			]),
		).toEqual(['a', 'b'])
	})
})

describe('cupTiebreaker', () => {
	it('picks sole top by streak', () => {
		expect(
			cupTiebreaker([
				{ gamePlayerId: 'a', cumulativeStreak: 12, livesRemaining: 0, cumulativeGoals: 5 },
				{ gamePlayerId: 'b', cumulativeStreak: 9, livesRemaining: 3, cumulativeGoals: 30 },
			]),
		).toEqual(['a'])
	})

	it('falls through to lives when streak ties', () => {
		expect(
			cupTiebreaker([
				{ gamePlayerId: 'a', cumulativeStreak: 10, livesRemaining: 1, cumulativeGoals: 5 },
				{ gamePlayerId: 'b', cumulativeStreak: 10, livesRemaining: 3, cumulativeGoals: 0 },
				{ gamePlayerId: 'c', cumulativeStreak: 5, livesRemaining: 99, cumulativeGoals: 0 },
			]),
		).toEqual(['b'])
	})

	it('falls through to goals when streak and lives tie', () => {
		expect(
			cupTiebreaker([
				{ gamePlayerId: 'a', cumulativeStreak: 10, livesRemaining: 2, cumulativeGoals: 12 },
				{ gamePlayerId: 'b', cumulativeStreak: 10, livesRemaining: 2, cumulativeGoals: 18 },
				{ gamePlayerId: 'c', cumulativeStreak: 10, livesRemaining: 1, cumulativeGoals: 99 },
			]),
		).toEqual(['b'])
	})

	it('falls through to raw streak goals when streak, lives and counted goals all tie', () => {
		// d8360e69: both streak 1, lives 0, counted goals 0 (favourite wins
		// suppressed) — the raw goals of the streak pick separate them.
		expect(
			cupTiebreaker([
				{
					gamePlayerId: 'a',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 0,
					rawStreakGoals: 3,
				},
				{
					gamePlayerId: 'b',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 0,
					rawStreakGoals: 1,
				},
			]),
		).toEqual(['a'])
	})

	it('splits only when raw streak goals also tie', () => {
		expect(
			cupTiebreaker([
				{
					gamePlayerId: 'a',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 0,
					rawStreakGoals: 2,
				},
				{
					gamePlayerId: 'b',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 0,
					rawStreakGoals: 2,
				},
			]),
		).toEqual(['a', 'b'])
	})

	it('does not consult raw goals when counted goals already separate players', () => {
		// counted goals decide first; raw goals (which would favour b) are ignored.
		expect(
			cupTiebreaker([
				{
					gamePlayerId: 'a',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 2,
					rawStreakGoals: 2,
				},
				{
					gamePlayerId: 'b',
					cumulativeStreak: 1,
					livesRemaining: 0,
					cumulativeGoals: 1,
					rawStreakGoals: 9,
				},
			]),
		).toEqual(['a'])
	})
})

describe('resolveWipeout', () => {
	// Tuple: [rank, correct, goals(counted), rawGoals]. rawGoals defaults to the
	// counted goals (they only differ for cup favourite-win suppression).
	const p = (
		gamePlayerId: string,
		picks: Array<[rank: number, correct: boolean, goals?: number, rawGoals?: number]>,
		livesRemaining = 0,
	): WipeoutPlayerInput => ({
		gamePlayerId,
		livesRemaining,
		picks: picks.map(([rank, correct, goals = 0, rawGoals]) => ({
			rank,
			correct,
			goals,
			rawGoals: rawGoals ?? goals,
		})),
	})

	it('computes a consecutive streak from rank 1 when rank 1 has a winner', () => {
		const out = resolveWipeout([
			p('a', [
				[1, true],
				[2, true],
				[3, true],
			]),
			p('b', [
				[1, true],
				[2, false],
				[3, true],
			]),
		])
		expect(out.totalWipeout).toBe(false)
		expect(out.startingRank).toBe(1)
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 3, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
			{ gamePlayerId: 'b', streak: 1, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
		])
	})

	it('does NOT count correct picks that come after a streak break (the d8360e69 bug)', () => {
		// b won rank 1, lost rank 2, then won ranks 3 & 4. The post-break wins must
		// NOT inflate the streak — b's streak is 1, not 3.
		const out = resolveWipeout([
			p('a', [
				[1, true],
				[2, true],
			]),
			p('b', [
				[1, true],
				[2, false],
				[3, true],
				[4, true],
			]),
		])
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
			{ gamePlayerId: 'b', streak: 1, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
		])
	})

	it('skips a leading rank that was a universal loss (game starts from rank 2)', () => {
		// Worked example: rank 1 wrong for everyone; from rank 2 A gets 2&3 right,
		// B gets 2 wrong → A wins streak 2, B streak 0.
		const out = resolveWipeout([
			p('a', [
				[1, false],
				[2, true],
				[3, true],
			]),
			p('b', [
				[1, false],
				[2, false],
			]),
		])
		expect(out.totalWipeout).toBe(false)
		expect(out.startingRank).toBe(2)
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
			{ gamePlayerId: 'b', streak: 0, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
		])
	})

	it('recurses past multiple consecutive universal-loss ranks', () => {
		// ranks 1 and 2 are universal losses; rank 3 is the first surviving rank.
		const out = resolveWipeout([
			p('a', [
				[1, false],
				[2, false],
				[3, true],
				[4, true],
			]),
			p('b', [
				[1, false],
				[2, false],
				[3, false],
				[4, true],
			]),
		])
		expect(out.startingRank).toBe(3)
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
			{ gamePlayerId: 'b', streak: 0, goalsInStreak: 0, rawGoalsInStreak: 0, livesRemaining: 0 },
		])
	})

	it('flags a total wipeout when no rank has a single correct pick anywhere', () => {
		const out = resolveWipeout([
			p('a', [
				[1, false],
				[2, false],
			]),
			p('b', [
				[1, false],
				[2, false],
				[3, false],
			]),
		])
		expect(out.totalWipeout).toBe(true)
		expect(out.startingRank).toBeNull()
		expect(out.scores).toEqual([])
	})

	it('accumulates goals only for picks inside the streak', () => {
		const out = resolveWipeout([
			p('a', [
				[1, true, 2],
				[2, true, 3],
				[3, false, 0],
				[4, true, 9], // after the break — must not count
			]),
		])
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 5, rawGoalsInStreak: 5, livesRemaining: 0 },
		])
	})

	it('tracks raw streak goals separately from counted goals (favourite suppression)', () => {
		// rank 1 is a favourite win: counted 0, raw 3. rank 2 underdog win: counted
		// + raw 1. Post-break rank 3 win (raw 9) must not count for either.
		const out = resolveWipeout([
			p('a', [
				[1, true, 0, 3],
				[2, true, 1, 1],
				[3, false, 0, 0],
				[4, true, 0, 9],
			]),
		])
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 1, rawGoalsInStreak: 4, livesRemaining: 0 },
		])
	})

	it('treats a rank gap (a voided pick excluded by the caller) as continuing the streak', () => {
		// rank 2 was a voided fixture, so the caller omitted it. The streak walks
		// past the gap: rank 1 + rank 3 are consecutive → streak 2.
		const out = resolveWipeout([
			p('a', [
				[1, true, 1],
				[3, true, 2],
			]),
		])
		expect(out.scores).toEqual([
			{ gamePlayerId: 'a', streak: 2, goalsInStreak: 3, rawGoalsInStreak: 3, livesRemaining: 0 },
		])
	})

	it('carries livesRemaining through for the cup tiebreak', () => {
		const out = resolveWipeout([p('a', [[1, true]], 3)])
		expect(out.scores[0].livesRemaining).toBe(3)
	})
})
