import { describe, expect, it } from 'vitest'
import type { TurboPickInput } from './turbo'
import { calculateTurboStandings, evaluateTurboPicks } from './turbo'

function makePick(
	rank: number,
	predicted: 'home_win' | 'draw' | 'away_win',
	homeScore: number,
	awayScore: number,
): TurboPickInput {
	return { confidenceRank: rank, predictedResult: predicted, homeScore, awayScore }
}

describe('evaluateTurboPicks', () => {
	it('calculates perfect streak when all correct', () => {
		const picks = [
			makePick(1, 'home_win', 2, 0),
			makePick(2, 'away_win', 0, 1),
			makePick(3, 'draw', 1, 1),
		]
		expect(evaluateTurboPicks(picks).streak).toBe(3)
	})
	it('stops streak at first incorrect prediction', () => {
		const picks = [
			makePick(1, 'home_win', 2, 0),
			makePick(2, 'home_win', 0, 1),
			makePick(3, 'home_win', 3, 0),
		]
		expect(evaluateTurboPicks(picks).streak).toBe(1)
	})
	it('returns streak 0 when first is wrong', () => {
		expect(evaluateTurboPicks([makePick(1, 'away_win', 2, 0)]).streak).toBe(0)
	})
	it('counts goals in streak only', () => {
		const picks = [makePick(1, 'home_win', 3, 1), makePick(2, 'home_win', 0, 2)]
		const result = evaluateTurboPicks(picks)
		expect(result.streak).toBe(1)
		expect(result.goalsInStreak).toBe(3)
	})
	it('counts goals across full streak with correct per-type counting', () => {
		const picks = [
			makePick(1, 'home_win', 2, 0),
			makePick(2, 'away_win', 1, 3),
			makePick(3, 'draw', 2, 2),
		]
		const result = evaluateTurboPicks(picks)
		expect(result.streak).toBe(3)
		expect(result.goalsInStreak).toBe(9)
	})
	it('handles empty picks', () => {
		expect(evaluateTurboPicks([]).streak).toBe(0)
	})
	it('sorts by confidence rank before evaluating', () => {
		const picks = [
			makePick(3, 'draw', 1, 1),
			makePick(1, 'home_win', 2, 0),
			makePick(2, 'away_win', 0, 1),
		]
		expect(evaluateTurboPicks(picks).streak).toBe(3)
	})
})

describe('goals counting per prediction type', () => {
	it('counts only home goals for correct home_win prediction', () => {
		const picks = [makePick(1, 'home_win', 3, 1)]
		const result = evaluateTurboPicks(picks)
		expect(result.goalsInStreak).toBe(3)
	})

	it('counts only away goals for correct away_win prediction', () => {
		const picks = [makePick(1, 'away_win', 1, 4)]
		const result = evaluateTurboPicks(picks)
		expect(result.goalsInStreak).toBe(4)
	})

	it('counts both goals for correct draw prediction', () => {
		const picks = [makePick(1, 'draw', 2, 2)]
		const result = evaluateTurboPicks(picks)
		expect(result.goalsInStreak).toBe(4)
	})

	it('counts goals correctly across mixed streak', () => {
		const picks = [
			makePick(1, 'home_win', 3, 0),
			makePick(2, 'draw', 1, 1),
			makePick(3, 'away_win', 0, 2),
		]
		const result = evaluateTurboPicks(picks)
		expect(result.streak).toBe(3)
		expect(result.goalsInStreak).toBe(7)
	})
})

describe('calculateTurboStandings', () => {
	it('ranks by streak descending', () => {
		const standings = calculateTurboStandings([
			{ gamePlayerId: 'p1', streak: 3, goalsInStreak: 5 },
			{ gamePlayerId: 'p2', streak: 5, goalsInStreak: 2 },
		])
		expect(standings[0].gamePlayerId).toBe('p2')
	})
	it('breaks ties by goals', () => {
		const standings = calculateTurboStandings([
			{ gamePlayerId: 'p1', streak: 3, goalsInStreak: 5 },
			{ gamePlayerId: 'p2', streak: 3, goalsInStreak: 8 },
		])
		expect(standings[0].gamePlayerId).toBe('p2')
	})
	it('assigns positions', () => {
		const standings = calculateTurboStandings([
			{ gamePlayerId: 'p1', streak: 5, goalsInStreak: 10 },
			{ gamePlayerId: 'p2', streak: 3, goalsInStreak: 8 },
		])
		expect(standings[0].position).toBe(1)
		expect(standings[1].position).toBe(2)
	})
})
