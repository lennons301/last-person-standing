import { describe, expect, it } from 'vitest'
import type { CupPickInput } from './cup'
import { evaluateCupPicks } from './cup'

function makePick(
	rank: number,
	predicted: 'home_win' | 'draw' | 'away_win',
	homeScore: number,
	awayScore: number,
	tierDifference: number,
): CupPickInput {
	return { confidenceRank: rank, predictedResult: predicted, homeScore, awayScore, tierDifference }
}

describe('evaluateCupPicks', () => {
	it('correct pick with no tier advantage grants no life', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 2, 0, 0)], 0)
		expect(result.livesChange).toBe(0)
		expect(result.finalLives).toBe(0)
		expect(result.eliminated).toBe(false)
	})

	it('correct pick against team 2+ tiers above grants +1 life', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 2, 0, 2)], 0)
		expect(result.livesChange).toBe(1)
		expect(result.finalLives).toBe(1)
	})

	it('correct pick against team only 1 tier above does not grant life', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 2, 0, 1)], 0)
		expect(result.livesChange).toBe(0)
	})

	it('draw against team 2+ tiers above counts as success', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 1, 1, 2)], 0)
		expect(result.eliminated).toBe(false)
		expect(result.pickResults[0].savedByDraw).toBe(true)
	})

	it('incorrect pick costs 1 life when lives available', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 0, 2, 0)], 1)
		expect(result.livesChange).toBe(-1)
		expect(result.finalLives).toBe(0)
		expect(result.eliminated).toBe(false)
	})

	it('incorrect pick eliminates when no lives remain', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 0, 2, 0)], 0)
		expect(result.eliminated).toBe(true)
	})

	it('goals not counted when tierDifference is -1', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 3, 0, -1)], 0)
		expect(result.pickResults[0].goalsCounted).toBe(0)
	})

	it('goals counted normally for other tier differences', () => {
		const result = evaluateCupPicks([makePick(1, 'home_win', 3, 1, 0)], 0)
		expect(result.pickResults[0].goalsCounted).toBe(4)
	})

	it('processes multiple picks and accumulates lives', () => {
		const picks = [
			makePick(1, 'home_win', 2, 0, 3), // correct, +1 life
			makePick(2, 'away_win', 2, 0, 0), // wrong, -1 life
			makePick(3, 'home_win', 1, 0, 2), // correct, +1 life
		]
		const result = evaluateCupPicks(picks, 0)
		expect(result.livesChange).toBe(1)
		expect(result.finalLives).toBe(1)
		expect(result.eliminated).toBe(false)
	})

	it('eliminates mid-round when lives run out', () => {
		const picks = [
			makePick(1, 'away_win', 2, 0, 0), // wrong, no lives → eliminated
			makePick(2, 'home_win', 2, 0, 0), // skipped
		]
		const result = evaluateCupPicks(picks, 0)
		expect(result.eliminated).toBe(true)
	})

	it('sorts by confidence rank before processing', () => {
		const picks = [
			makePick(2, 'away_win', 2, 0, 0), // wrong (second)
			makePick(1, 'home_win', 2, 0, 3), // correct +1 life (first)
		]
		const result = evaluateCupPicks(picks, 0)
		expect(result.eliminated).toBe(false)
		expect(result.finalLives).toBe(0)
	})
})
