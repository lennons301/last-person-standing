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

describe('first gameweek exemption', () => {
	it('does not eliminate on loss in starting round', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
			isStartingRound: true,
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('loss')
		expect(result.results[0].eliminated).toBe(false)
	})

	it('does not eliminate on draw in starting round', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 1, 1)],
			isStartingRound: true,
		}
		const result = processClassicRound(input)
		expect(result.results[0].result).toBe('draw')
		expect(result.results[0].eliminated).toBe(false)
	})

	it('still eliminates on loss after starting round', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
			isStartingRound: false,
		}
		const result = processClassicRound(input)
		expect(result.results[0].eliminated).toBe(true)
	})
})

describe('goals tracking on wins', () => {
	it('tracks picked team goals on a home win', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 3, 1)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].goalsScored).toBe(3)
	})

	it('tracks picked team goals on an away win', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'liverpool' }],
			fixtures: [makeFixture('wolves', 'liverpool', 0, 4)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].goalsScored).toBe(4)
	})

	it('sets goals to 0 on loss', () => {
		const input: ClassicRoundInput = {
			players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
			fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
		}
		const result = processClassicRound(input)
		expect(result.results[0].goalsScored).toBe(0)
	})

	describe('multi-fixture-per-team', () => {
		it('uses pickedFixtureId to disambiguate when team plays twice', () => {
			// Man City plays both Brentford and Crystal Palace in GW36; player picked
			// the Crystal Palace fixture and that one was a 0-2 loss while the
			// Brentford fixture was a 4-0 win.
			const cityVsBrentford = makeFixture('mci', 'bre', 4, 0)
			const cityVsPalace = makeFixture('mci', 'cry', 0, 2)
			const input: ClassicRoundInput = {
				players: [
					{
						gamePlayerId: 'p1',
						pickedTeamId: 'mci',
						pickedFixtureId: cityVsPalace.id,
					},
				],
				fixtures: [cityVsBrentford, cityVsPalace],
			}
			const result = processClassicRound(input)
			// Should be evaluated against Palace fixture (loss), not Brentford (win).
			expect(result.results[0].result).toBe('loss')
			expect(result.results[0].eliminated).toBe(true)
			expect(result.results[0].goalsScored).toBe(0)
		})

		it('falls back to first matching fixture when pickedFixtureId is missing (legacy picks)', () => {
			// Older picks rows might not have a fixtureId stored; the resolver should
			// pick the first fixture in the input array that features the team.
			// Production callers sort fixtures by kickoff so this is deterministic.
			const cityVsBrentford = makeFixture('mci', 'bre', 4, 0)
			const cityVsPalace = makeFixture('mci', 'cry', 0, 2)
			const input: ClassicRoundInput = {
				players: [{ gamePlayerId: 'p1', pickedTeamId: 'mci' }],
				fixtures: [cityVsBrentford, cityVsPalace],
			}
			const result = processClassicRound(input)
			// Falls through to first fixture (Brentford win).
			expect(result.results[0].result).toBe('win')
			expect(result.results[0].goalsScored).toBe(4)
		})

		it('does not let one fixture overwrite another when team plays twice', () => {
			// Regression for the previous fixturesByTeam Map bug: with the same team
			// in two fixtures, the second write would overwrite the first, so a
			// player who picked the first fixture would be evaluated against the
			// second. With explicit pickedFixtureId this no longer happens.
			const cityVsBrentford = makeFixture('mci', 'bre', 4, 0)
			const cityVsPalace = makeFixture('mci', 'cry', 0, 2)
			const input: ClassicRoundInput = {
				players: [
					{
						gamePlayerId: 'p1',
						pickedTeamId: 'mci',
						pickedFixtureId: cityVsBrentford.id,
					},
					{
						gamePlayerId: 'p2',
						pickedTeamId: 'mci',
						pickedFixtureId: cityVsPalace.id,
					},
				],
				fixtures: [cityVsBrentford, cityVsPalace],
			}
			const result = processClassicRound(input)
			expect(result.results[0].result).toBe('win')
			expect(result.results[1].result).toBe('loss')
		})
	})
})
