import { describe, expect, it } from 'vitest'
import type { CupPickInput } from './cup'
import { evaluateCupPicks, resolveCupQualifier } from './cup'

function makePick(
	rank: number,
	pickedTeam: 'home' | 'away',
	homeScore: number,
	awayScore: number,
	tierDifference: number,
	winner?: 'home' | 'away' | null,
): CupPickInput {
	return { confidenceRank: rank, pickedTeam, homeScore, awayScore, tierDifference, winner }
}

describe('evaluateCupPicks', () => {
	describe('knockout draws are scored on the 90-minute result (not qualification)', () => {
		// Inputs carry the 90-MINUTE (regulation) score; the ET/penalty outcome is
		// deliberately not an input. So an underdog level at 90 minutes survives the
		// round even if the tie is then lost in ET/penalties — the behaviour Sean
		// asked for, matching how the group stage scored draws.
		it('+1 underdog level at 90 minutes → draw_success, survives (even if it later loses on pens)', () => {
			// picked = away; tierDifference +1 (home one tier higher) → away is a +1 underdog.
			const res = evaluateCupPicks([makePick(1, 'away', 1, 1, 1)], 0)
			expect(res.pickResults[0].result).toBe('draw_success')
			expect(res.eliminated).toBe(false)
		})
		it('+2 underdog level at 90 minutes → draw_success AND gains a life', () => {
			const res = evaluateCupPicks([makePick(1, 'away', 0, 0, 2)], 0)
			expect(res.pickResults[0].result).toBe('draw_success')
			expect(res.pickResults[0].livesGained).toBe(1)
			expect(res.eliminated).toBe(false)
		})
		it('even-match draw at 90 minutes is NOT a survival — streak breaks with no lives', () => {
			const res = evaluateCupPicks([makePick(1, 'home', 1, 1, 0)], 0)
			expect(res.pickResults[0].result).toBe('loss')
			expect(res.eliminated).toBe(true)
		})
		it('a 90-minute win is still a win', () => {
			const res = evaluateCupPicks([makePick(1, 'home', 2, 1, 0)], 0)
			expect(res.pickResults[0].result).toBe('win')
			expect(res.eliminated).toBe(false)
		})
	})

	describe("knockout qualification ('to qualify') overrides a level 90-minute score", () => {
		// A knockout pick is "to qualify": when the picked team advances (incl. on
		// ET/penalties) the `winner` says so and the pick is a WIN — earning the
		// underdog its life — even though the 90-minute score was level. When the
		// picked team is level at 90 but does NOT qualify, it is floored at a draw
		// (draw_success for an underdog) rather than scored a loss. `winner` is the
		// authoritative qualification signal; the home/away score is the 90-minute
		// (regulation) result used for the draw floor + goals.
		it('+1 underdog level at 90 that QUALIFIES (won on pens) → win + 1 life', () => {
			// picked away; home one tier higher (away is +1 underdog); 1-1 at 90;
			// away qualified (won the shootout).
			const res = evaluateCupPicks([makePick(1, 'away', 1, 1, 1, 'away')], 0)
			expect(res.pickResults[0].result).toBe('win')
			expect(res.pickResults[0].livesGained).toBe(1)
			expect(res.finalLives).toBe(1)
			expect(res.eliminated).toBe(false)
		})

		it('+1 underdog level at 90 that does NOT qualify (lost on pens) → draw_success, no life', () => {
			const res = evaluateCupPicks([makePick(1, 'away', 1, 1, 1, 'home')], 0)
			expect(res.pickResults[0].result).toBe('draw_success')
			expect(res.pickResults[0].livesGained).toBe(0)
			expect(res.eliminated).toBe(false)
		})

		it('counts the 90-minute goals when a qualifying underdog was level at 90', () => {
			const res = evaluateCupPicks([makePick(1, 'away', 1, 1, 1, 'away')], 0)
			expect(res.pickResults[0].goalsCounted).toBe(1)
		})

		it('same-tier pick that QUALIFIES from a 90-minute draw → win (no life)', () => {
			const res = evaluateCupPicks([makePick(1, 'home', 1, 1, 0, 'home')], 0)
			expect(res.pickResults[0].result).toBe('win')
			expect(res.pickResults[0].livesGained).toBe(0)
			expect(res.eliminated).toBe(false)
		})

		it('picked team behind at 90 and does NOT qualify → loss (not floored to draw)', () => {
			// 2-0 to home at 90, picked away, away did not qualify.
			const res = evaluateCupPicks([makePick(1, 'away', 2, 0, 1, 'home')], 0)
			expect(res.pickResults[0].result).toBe('loss')
			expect(res.eliminated).toBe(true)
		})

		it('qualifying win still earns no life after the streak has broken', () => {
			// rank 1 loses with no life → streak broken. rank 2 is a +1 underdog that
			// qualifies from a 90-min draw — a win (goals count) but life frozen.
			const picks = [makePick(1, 'home', 0, 2, 0), makePick(2, 'away', 1, 1, 1, 'away')]
			const res = evaluateCupPicks(picks, 0)
			expect(res.pickResults[0].result).toBe('loss')
			expect(res.pickResults[1].result).toBe('win')
			expect(res.pickResults[1].livesGained).toBe(0)
			expect(res.finalLives).toBe(0)
		})
	})

	describe('resolveCupQualifier (winner with full-time fallback)', () => {
		it('returns the stored winner when present', () => {
			expect(
				resolveCupQualifier({ winner: 'away', finished: true, fullHomeScore: 3, fullAwayScore: 4 }),
			).toBe('away')
		})

		it('derives the qualifier from full-time (penalty-inclusive) when winner is null and finished', () => {
			// football-data leaves `winner` null on some shootouts, but fullTime folds
			// in the penalty aggregate — NED 1 MAR 1, pens 2-3 → fullTime 3-4 → away.
			expect(
				resolveCupQualifier({ winner: null, finished: true, fullHomeScore: 3, fullAwayScore: 4 }),
			).toBe('away')
			expect(
				resolveCupQualifier({ winner: null, finished: true, fullHomeScore: 5, fullAwayScore: 4 }),
			).toBe('home')
		})

		it('returns null when full-time is level and no winner (cannot tell)', () => {
			expect(
				resolveCupQualifier({ winner: null, finished: true, fullHomeScore: 1, fullAwayScore: 1 }),
			).toBeNull()
		})

		it('does NOT derive a qualifier from a still-in-play match (avoids phantom wins)', () => {
			expect(
				resolveCupQualifier({ winner: null, finished: false, fullHomeScore: 1, fullAwayScore: 0 }),
			).toBeNull()
		})

		it('returns null when full-time scores are missing', () => {
			expect(
				resolveCupQualifier({
					winner: null,
					finished: true,
					fullHomeScore: null,
					fullAwayScore: null,
				}),
			).toBeNull()
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
