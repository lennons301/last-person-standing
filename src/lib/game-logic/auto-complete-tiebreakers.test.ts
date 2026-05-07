import { describe, expect, it } from 'vitest'
import { classicTiebreaker, cupTiebreaker, turboTiebreaker } from './auto-complete-tiebreakers'

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

	it('splits when all three metrics tie', () => {
		expect(
			cupTiebreaker([
				{ gamePlayerId: 'a', cumulativeStreak: 10, livesRemaining: 2, cumulativeGoals: 18 },
				{ gamePlayerId: 'b', cumulativeStreak: 10, livesRemaining: 2, cumulativeGoals: 18 },
			]),
		).toEqual(['a', 'b'])
	})
})
