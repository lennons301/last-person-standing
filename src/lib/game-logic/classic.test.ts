import { describe, expect, it } from 'vitest'
import type { ClassicRoundInput } from './classic'
import { processClassicRound } from './classic'

function makeFixture(homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number) {
	return { id: `f-${homeTeamId}-${awayTeamId}`, homeTeamId, awayTeamId, homeScore, awayScore }
}

describe('processClassicRound', () => {
	it('marks player as win when picked team wins at home', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 2, 0)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('win')
		expect(result.results[0].eliminated).toBe(false)
	})

	it('marks player as win when picked team wins away', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'liverpool' }],
			fixtures: [makeFixture('wolves', 'liverpool', 0, 3)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('win')
		expect(result.results[0].eliminated).toBe(false)
	})

	it('eliminates player when picked team draws', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 1, 1)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('draw')
		expect(result.results[0].eliminated).toBe(true)
	})

	it('eliminates player when picked team loses', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('loss')
		expect(result.results[0].eliminated).toBe(true)
	})

	it('processes multiple players in same round', () => {
		const input: ClassicRoundInput = {
			players: [
				{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' },
				{ gamePlayerId: 'p2', pickedTeamId: 'chelsea' },
				{ gamePlayerId: 'p3', pickedTeamId: 'wolves' },
			],
			fixtures: [makeFixture('arsenal', 'chelsea', 2, 0), makeFixture('wolves', 'liverpool', 1, 1)],
		}
		const result = processClassicRound(input)
		expect(result.results.find((r) => r.gamePlayerId === 'p1')?.eliminated).toBe(false)
		expect(result.results.find((r) => r.gamePlayerId === 'p2')?.eliminated).toBe(true)
		expect(result.results.find((r) => r.gamePlayerId === 'p3')?.eliminated).toBe(true)
	})

	it('returns empty results for empty input', () => {
		expect(processClassicRound({ players: [], fixtures: [] }).results).toEqual([])
	})
})
