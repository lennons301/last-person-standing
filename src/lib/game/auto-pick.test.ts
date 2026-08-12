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

	it('selects the genuinely worst-placed unused team when every team has a real position', () => {
		// The post-standings-sync production state: every club carries a real
		// league position. With the two worst-placed teams already used, the
		// pick must fall to the next-worst by position, not an arbitrary team.
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba', 't-eve']),
				teamPositions: positions,
			}),
		).toBe('t-che')
	})

	it('falls to the alphabetically-last club against a pre-season opening table', () => {
		// Gameweek 1: no fixture has finished, so the persisted table is the
		// opening one — every club at zero, positioned alphabetically. "Worst
		// placed" therefore means last alphabetically (West Brom here), and it
		// means it deterministically: the opening table gives every club its own
		// position, so the fallback never lands on the id tie-break below.
		// Arsenal, Chelsea, Everton, Liverpool, Man City, West Brom.
		const openingPositions = new Map([
			['t-ars', 1],
			['t-che', 2],
			['t-eve', 3],
			['t-liv', 4],
			['t-mci', 5],
			['t-wba', 6],
		])

		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: openingPositions,
			}),
		).toBe('t-wba')
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba']),
				teamPositions: openingPositions,
			}),
		).toBe('t-mci')
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
