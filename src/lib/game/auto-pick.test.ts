import { describe, expect, it } from 'vitest'
import { pickWorstUnusedTeam } from './auto-pick'

interface TestFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
}

describe('pickWorstUnusedTeam — no prices, so the table decides', () => {
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
			pickWorstUnusedTeam({ fixtures, usedTeamIds: new Set(), teamPositions: positions }),
		).toBe('t-wba')
	})

	it('excludes used teams', () => {
		expect(
			pickWorstUnusedTeam({
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
			pickWorstUnusedTeam({
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
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: openingPositions,
			}),
		).toBe('t-wba')
		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba']),
				teamPositions: openingPositions,
			}),
		).toBe('t-mci')
	})

	it('returns null when all teams in round are used', () => {
		expect(
			pickWorstUnusedTeam({
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
			pickWorstUnusedTeam({
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
			pickWorstUnusedTeam({
				fixtures: tiedFixtures,
				usedTeamIds: new Set(),
				teamPositions: tied,
			}),
		).toBe('t-aaa')
	})

	it('returns null when fixtures array is empty', () => {
		expect(
			pickWorstUnusedTeam({
				fixtures: [],
				usedTeamIds: new Set(),
				teamPositions: positions,
			}),
		).toBe(null)
	})
})

describe('pickWorstUnusedTeam — the market decides', () => {
	const fixtures: TestFixture[] = [
		{ id: 'fx1', homeTeamId: 't-ars', awayTeamId: 't-che' },
		{ id: 'fx2', homeTeamId: 't-liv', awayTeamId: 't-eve' },
		{ id: 'fx3', homeTeamId: 't-mci', awayTeamId: 't-wba' },
	]

	it('takes the longest-odds team even when the table calls another one worse', () => {
		// The case the rule exists for: early season, where a handful of games
		// leaves the table saying almost nothing. West Brom sit top on one lucky
		// win and Chelsea bottom on one heavy defeat, but the market knows which
		// of them is actually the worse bet this weekend.
		const positions = new Map([
			['t-wba', 1],
			['t-mci', 2],
			['t-ars', 3],
			['t-liv', 4],
			['t-eve', 5],
			['t-che', 20],
		])
		const probabilities = new Map([
			['t-ars', 0.62],
			['t-che', 0.18],
			['t-liv', 0.71],
			['t-eve', 0.09],
			['t-mci', 0.8],
			['t-wba', 0.07],
		])

		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: positions,
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-wba')
	})

	it('excludes used teams and falls to the next-longest price', () => {
		const positions = new Map([['t-che', 20]])
		const probabilities = new Map([
			['t-ars', 0.62],
			['t-che', 0.18],
			['t-liv', 0.71],
			['t-eve', 0.09],
			['t-mci', 0.8],
			['t-wba', 0.07],
		])

		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba', 't-eve']),
				teamPositions: positions,
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-che')
	})

	it('decides a partly-priced round on the priced teams alone', () => {
		// An unpriced fixture is a team we can't call worst, not a team we know is
		// bad — and a probability can't be compared with a table place. Everton sit
		// bottom but carry no market, so the pick comes from the priced pair.
		const positions = new Map([
			['t-ars', 3],
			['t-che', 6],
			['t-liv', 2],
			['t-eve', 20],
			['t-mci', 1],
			['t-wba', 19],
		])
		const probabilities = new Map([
			['t-ars', 0.62],
			['t-che', 0.18],
		])

		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: positions,
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-che')
	})

	it('falls back to the table when the round carries no prices at all', () => {
		// The World Cup and the FA Cup, every week — the odds source doesn't cover
		// them, and classic runs on both.
		const positions = new Map([
			['t-ars', 3],
			['t-che', 6],
			['t-liv', 2],
			['t-eve', 12],
			['t-mci', 1],
			['t-wba', 20],
		])

		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: positions,
				teamWinProbabilities: new Map(),
			}),
		).toBe('t-wba')
	})

	it('breaks a tied price on the table, and only then on the id', () => {
		const tiedFixtures: TestFixture[] = [
			{ id: 'fx1', homeTeamId: 't-aaa', awayTeamId: 't-zzz' },
			{ id: 'fx2', homeTeamId: 't-mmm', awayTeamId: 't-nnn' },
		]
		const probabilities = new Map([
			['t-aaa', 0.1],
			['t-zzz', 0.1],
			['t-mmm', 0.9],
			['t-nnn', 0.9],
		])

		// Level on price, so the worse-placed of the two takes it.
		expect(
			pickWorstUnusedTeam({
				fixtures: tiedFixtures,
				usedTeamIds: new Set(),
				teamPositions: new Map([
					['t-aaa', 8],
					['t-zzz', 17],
				]),
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-zzz')

		// Level on both, so the id is the last resort — as it always was.
		expect(
			pickWorstUnusedTeam({
				fixtures: tiedFixtures,
				usedTeamIds: new Set(),
				teamPositions: new Map([
					['t-aaa', 17],
					['t-zzz', 17],
				]),
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-aaa')
	})

	it('treats a zero probability as a price, not as an absent one', () => {
		// 0 is a real (if extreme) market reading and must not be mistaken for
		// "unpriced" — the whole reason the priced set is built from presence.
		const probabilities = new Map([
			['t-ars', 0],
			['t-che', 0.5],
		])
		expect(
			pickWorstUnusedTeam({
				fixtures: [{ id: 'fx1', homeTeamId: 't-ars', awayTeamId: 't-che' }],
				usedTeamIds: new Set(),
				teamPositions: new Map([
					['t-ars', 1],
					['t-che', 20],
				]),
				teamWinProbabilities: probabilities,
			}),
		).toBe('t-ars')
	})

	it('returns null when every team in the round is used, priced or not', () => {
		expect(
			pickWorstUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-ars', 't-che', 't-liv', 't-eve', 't-mci', 't-wba']),
				teamPositions: new Map(),
				teamWinProbabilities: new Map([['t-ars', 0.1]]),
			}),
		).toBe(null)
	})
})
