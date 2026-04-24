import { describe, expect, it } from 'vitest'
import { pickLowestRankedUnusedTeam } from './auto-pick'

interface TestFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
}

describe('pickLowestRankedUnusedTeam', () => {
	const fixtures: TestFixture[] = [
		{ id: 'fx1', homeTeamId: 't-ars', awayTeamId: 't-che' },
		{ id: 'fx2', homeTeamId: 't-liv', awayTeamId: 't-eve' },
		{ id: 'fx3', homeTeamId: 't-mci', awayTeamId: 't-wba' },
	]
	const positions = new Map([
		['t-ars', 3],
		['t-che', 6],
		['t-liv', 2],
		['t-eve', 12],
		['t-mci', 1],
		['t-wba', 20],
	])

	it('returns the team with highest league_position (worst rank) when none used', () => {
		expect(
			pickLowestRankedUnusedTeam({ fixtures, usedTeamIds: new Set(), teamPositions: positions }),
		).toBe('t-wba')
	})

	it('excludes used teams', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba']),
				teamPositions: positions,
			}),
		).toBe('t-eve')
	})

	it('returns null when all teams in round are used', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-ars', 't-che', 't-liv', 't-eve', 't-mci', 't-wba']),
				teamPositions: positions,
			}),
		).toBe(null)
	})

	it('treats teams with null/missing position as lowest-ranked (safe default)', () => {
		const positionsWithMissing = new Map([
			['t-ars', 3],
			['t-che', 6],
			['t-liv', 2],
			['t-eve', 12],
			['t-mci', 1],
			// t-wba missing — treated as position Infinity
		])
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: positionsWithMissing,
			}),
		).toBe('t-wba')
	})

	it('tie-breaks by team id alphabetically', () => {
		const tied = new Map([
			['t-aaa', 20],
			['t-zzz', 20],
		])
		const tiedFixtures: TestFixture[] = [{ id: 'fx1', homeTeamId: 't-aaa', awayTeamId: 't-zzz' }]
		expect(
			pickLowestRankedUnusedTeam({
				fixtures: tiedFixtures,
				usedTeamIds: new Set(),
				teamPositions: tied,
			}),
		).toBe('t-aaa')
	})

	it('returns null when fixtures array is empty', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures: [],
				usedTeamIds: new Set(),
				teamPositions: positions,
			}),
		).toBe(null)
	})
})
