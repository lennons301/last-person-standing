import { describe, expect, it } from 'vitest'
import type { CupPickInput } from './cup'
import { evaluateCupPicks } from './cup'

function makePick(
	rank: number,
	pickedTeam: 'home' | 'away',
	homeScore: number,
	awayScore: number,
	tierDifference: number,
): CupPickInput {
	return { confidenceRank: rank, pickedTeam, homeScore, awayScore, tierDifference }
}

describe('evaluateCupPicks', () => {
	describe('penalty/extra-time winner (knockout)', () => {
		it('treats a level score with winner = picked team as a win, not a draw', () => {
			const res = evaluateCupPicks(
				[
					{
						confidenceRank: 1,
						pickedTeam: 'home',
						homeScore: 1,
						awayScore: 1,
						tierDifference: 0,
						winner: 'home',
					},
				],
				0,
			)
			expect(res.pickResults[0].result).toBe('win')
			expect(res.eliminated).toBe(false)
		})
		it('treats a level score with winner = opponent as a loss (streak breaks)', () => {
			const res = evaluateCupPicks(
				[
					{
						confidenceRank: 1,
						pickedTeam: 'away',
						homeScore: 1,
						awayScore: 1,
						tierDifference: 0,
						winner: 'home',
					},
				],
				0,
			)
			expect(res.pickResults[0].result).toBe('loss')
			expect(res.eliminated).toBe(true)
		})
	})

	describe('pick restrictions', () => {
		it('rejects picks where picked team is >1 tier above opponent', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 3, 0, 2)], 0)
			expect(result.pickResults[0].restricted).toBe(true)
		})

		it('allows picks where picked team is exactly 1 tier above', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 3, 0, 1)], 0)
			expect(result.pickResults[0].restricted).toBe(false)
		})

		it('allows underdog picks', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 0, 2, 3)], 0)
			expect(result.pickResults[0].restricted).toBe(false)
		})
	})

	describe('lives earned on win', () => {
		it('earns lives proportional to tier gap when underdog wins', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 0, 2, 3)], 0)
			expect(result.pickResults[0].livesGained).toBe(3)
			expect(result.finalLives).toBe(3)
		})

		it('earns 1 life when 1-tier underdog wins', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 0, 1, 1)], 0)
			expect(result.pickResults[0].livesGained).toBe(1)
		})

		it('earns 0 lives when same-tier team wins', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 2, 0, 0)], 0)
			expect(result.pickResults[0].livesGained).toBe(0)
		})

		it('earns 0 lives when 1-tier favourite wins', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 2, 0, 1)], 0)
			expect(result.pickResults[0].livesGained).toBe(0)
		})
	})

	describe('draw handling', () => {
		it('draw is success when picked team is underdog', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 1, 1, 2)], 0)
			expect(result.pickResults[0].result).toBe('draw_success')
			expect(result.eliminated).toBe(false)
		})

		it('draw earns exactly 1 life when tierDiffFromPicked <= -2', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 1, 1, 3)], 0)
			expect(result.pickResults[0].livesGained).toBe(1)
		})

		it('draw_success does NOT count goals (matches old app)', () => {
			// Away picks underdog, 2-2 draw. Draw success but 0 goals for tiebreaker.
			const result = evaluateCupPicks([makePick(1, 'away', 2, 2, 3)], 0)
			expect(result.pickResults[0].result).toBe('draw_success')
			expect(result.pickResults[0].goalsCounted).toBe(0)
		})

		it('draw earns 0 lives when tierDiffFromPicked = -1', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 1, 1, 1)], 0)
			expect(result.pickResults[0].result).toBe('draw_success')
			expect(result.pickResults[0].livesGained).toBe(0)
		})

		it('draw is a loss when picked team is favourite or same tier', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 1, 1, 0)], 0)
			expect(result.pickResults[0].result).toBe('loss')
			expect(result.eliminated).toBe(true)
		})

		it('draw loss can be saved by life', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 1, 1, 0)], 1)
			expect(result.pickResults[0].result).toBe('saved_by_life')
			expect(result.finalLives).toBe(0)
			expect(result.eliminated).toBe(false)
		})
	})

	describe('goals counting', () => {
		it('counts picked team goals on win (home pick)', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 3, 1, 0)], 0)
			expect(result.pickResults[0].goalsCounted).toBe(3)
		})

		it('counts picked team goals on win (away pick)', () => {
			const result = evaluateCupPicks([makePick(1, 'away', 1, 4, 0)], 0)
			expect(result.pickResults[0].goalsCounted).toBe(4)
		})

		it('does NOT count goals when tierDiffFromPicked = 1', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 3, 0, 1)], 0)
			expect(result.pickResults[0].goalsCounted).toBe(0)
		})

		it('counts goals when saved by life', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 1, 3, 0)], 1)
			expect(result.pickResults[0].result).toBe('saved_by_life')
			expect(result.pickResults[0].goalsCounted).toBe(1)
		})
	})

	describe('streak and elimination', () => {
		it('eliminates on loss with no lives', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 0, 2, 0)], 0)
			expect(result.eliminated).toBe(true)
		})

		it('saves with life on loss', () => {
			const result = evaluateCupPicks([makePick(1, 'home', 0, 2, 0)], 1)
			expect(result.pickResults[0].result).toBe('saved_by_life')
			expect(result.eliminated).toBe(false)
			expect(result.finalLives).toBe(0)
		})

		it('streak broken prevents further life spending', () => {
			const picks = [makePick(1, 'home', 0, 2, 0), makePick(2, 'home', 0, 1, 0)]
			const result = evaluateCupPicks(picks, 0)
			expect(result.pickResults[0].result).toBe('loss')
			expect(result.pickResults[1].result).toBe('loss')
		})

		it('does NOT earn lives from a win after the streak has already broken', () => {
			// rank 1 loses (no lives) → eliminated. rank 2 is an underdog win that
			// would normally grant 3 lives — but the streak is already broken, so
			// lives are frozen at the eliminating pick. Goals still count (it IS a
			// win), only the life accrual is suppressed.
			const picks = [makePick(1, 'home', 0, 2, 0), makePick(2, 'away', 0, 2, 3)]
			const result = evaluateCupPicks(picks, 0)
			expect(result.pickResults[0].result).toBe('loss')
			expect(result.pickResults[1].result).toBe('win')
			expect(result.pickResults[1].goalsCounted).toBe(2)
			expect(result.pickResults[1].livesGained).toBe(0)
			expect(result.finalLives).toBe(0)
		})

		it('can spend multiple lives before streak breaks', () => {
			const picks = [
				makePick(1, 'away', 0, 2, 3),
				makePick(2, 'home', 0, 1, 0),
				makePick(3, 'home', 0, 1, 0),
				makePick(4, 'home', 0, 1, 0),
				makePick(5, 'home', 0, 1, 0),
			]
			const result = evaluateCupPicks(picks, 0)
			expect(result.pickResults[0].result).toBe('win')
			expect(result.pickResults[1].result).toBe('saved_by_life')
			expect(result.pickResults[2].result).toBe('saved_by_life')
			expect(result.pickResults[3].result).toBe('saved_by_life')
			expect(result.pickResults[4].result).toBe('loss')
			expect(result.eliminated).toBe(true)
			expect(result.finalLives).toBe(0)
		})

		it('processes picks in confidence rank order', () => {
			const picks = [makePick(2, 'home', 0, 1, 0), makePick(1, 'away', 0, 2, 3)]
			const result = evaluateCupPicks(picks, 0)
			expect(result.eliminated).toBe(false)
			expect(result.finalLives).toBe(2)
		})
	})
})
