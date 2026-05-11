import { describe, expect, it } from 'vitest'
import { validateClassicPick, validateCupPicks, validateTurboPicks } from './validate'

describe('validateClassicPick', () => {
	const base = {
		playerStatus: 'alive' as const,
		isCurrentRound: true,
		deadline: new Date(Date.now() + 3600000),
		now: new Date(),
		usedTeamIds: ['used-1', 'used-2'],
		fixtureTeamIds: ['team-a', 'team-b', 'team-c', 'team-d'],
	}

	it('accepts valid pick', () => {
		expect(validateClassicPick({ ...base, teamId: 'team-a' })).toEqual({ valid: true })
	})
	it('rejects eliminated player', () => {
		expect(validateClassicPick({ ...base, teamId: 'team-a', playerStatus: 'eliminated' })).toEqual({
			valid: false,
			reason: 'Player is not alive',
		})
	})
	it('rejects when not the game current round', () => {
		expect(validateClassicPick({ ...base, teamId: 'team-a', isCurrentRound: false })).toEqual({
			valid: false,
			reason: 'Round is not open for picks',
		})
	})
	it('rejects past deadline', () => {
		expect(
			validateClassicPick({ ...base, teamId: 'team-a', deadline: new Date(Date.now() - 1000) }),
		).toEqual({ valid: false, reason: 'Deadline has passed' })
	})
	it('rejects used team', () => {
		expect(validateClassicPick({ ...base, teamId: 'used-1' })).toEqual({
			valid: false,
			reason: 'Team already used in a previous round',
		})
	})
	it('rejects team not in fixtures', () => {
		expect(validateClassicPick({ ...base, teamId: 'unknown' })).toEqual({
			valid: false,
			reason: 'Team is not playing in this round',
		})
	})
	it('accepts null deadline', () => {
		expect(validateClassicPick({ ...base, teamId: 'team-a', deadline: null })).toEqual({
			valid: true,
		})
	})
})

describe('validateTurboPicks', () => {
	const base = {
		playerStatus: 'alive' as const,
		isCurrentRound: true,
		deadline: new Date(Date.now() + 3600000),
		now: new Date(),
		numberOfPicks: 3,
		fixtureIds: ['f1', 'f2', 'f3', 'f4'],
	}
	const validPicks = [
		{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' as const },
		{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' as const },
		{ fixtureId: 'f3', confidenceRank: 3, predictedResult: 'away_win' as const },
	]

	it('accepts valid picks', () => {
		expect(validateTurboPicks({ ...base, picks: validPicks })).toEqual({ valid: true })
	})
	it('rejects wrong count', () => {
		expect(validateTurboPicks({ ...base, picks: [validPicks[0]] })).toEqual({
			valid: false,
			reason: 'Expected 3 picks, got 1',
		})
	})
	it('rejects duplicate fixtures', () => {
		expect(
			validateTurboPicks({
				...base,
				picks: [
					{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
					{ fixtureId: 'f1', confidenceRank: 2, predictedResult: 'draw' },
					{ fixtureId: 'f2', confidenceRank: 3, predictedResult: 'away_win' },
				],
			}),
		).toEqual({ valid: false, reason: 'Duplicate fixture in picks' })
	})
	it('rejects duplicate ranks', () => {
		expect(
			validateTurboPicks({
				...base,
				picks: [
					{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
					{ fixtureId: 'f2', confidenceRank: 1, predictedResult: 'draw' },
					{ fixtureId: 'f3', confidenceRank: 3, predictedResult: 'away_win' },
				],
			}),
		).toEqual({
			valid: false,
			reason: 'Confidence ranks must be unique sequential integers from 1',
		})
	})
	it('rejects invalid fixture ID', () => {
		expect(
			validateTurboPicks({
				...base,
				picks: [
					{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
					{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' },
					{ fixtureId: 'invalid', confidenceRank: 3, predictedResult: 'away_win' },
				],
			}),
		).toEqual({ valid: false, reason: 'Invalid fixture ID: invalid' })
	})
	it('rejects eliminated player', () => {
		expect(validateTurboPicks({ ...base, playerStatus: 'eliminated', picks: validPicks })).toEqual({
			valid: false,
			reason: 'Player is not alive',
		})
	})
})

describe('validateCupPicks', () => {
	const base = {
		playerStatus: 'alive' as const,
		isCurrentRound: true,
		deadline: new Date(Date.now() + 3600000),
		now: new Date(),
		numberOfPicks: 2,
		fixtures: [
			{ fixtureId: 'f1', tierDifference: 3 },
			{ fixtureId: 'f2', tierDifference: 0 },
		],
	}

	it('rejects pick where picked team is >1 tier above opponent', () => {
		const result = validateCupPicks({
			...base,
			picks: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({
			valid: false,
			reason: 'Cannot pick a team more than 1 tier above their opponent (fixture f1)',
		})
	})

	it('accepts underdog picks at any tier gap', () => {
		const result = validateCupPicks({
			...base,
			picks: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'away_win', pickedTeam: 'away' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({ valid: true })
	})

	it('accepts pick where picked team is 1 tier above', () => {
		const result = validateCupPicks({
			...base,
			fixtures: [
				{ fixtureId: 'f1', tierDifference: 1 },
				{ fixtureId: 'f2', tierDifference: 0 },
			],
			picks: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({ valid: true })
	})

	it('accepts a partial ranking (fewer than numberOfPicks)', () => {
		const result = validateCupPicks({
			...base,
			numberOfPicks: 10,
			fixtures: [
				{ fixtureId: 'f1', tierDifference: 0 },
				{ fixtureId: 'f2', tierDifference: 0 },
			],
			picks: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({ valid: true })
	})

	it('rejects zero picks', () => {
		const result = validateCupPicks({ ...base, picks: [] })
		expect(result).toEqual({ valid: false, reason: 'At least one pick required' })
	})

	it('rejects too many picks', () => {
		const result = validateCupPicks({
			...base,
			numberOfPicks: 1,
			picks: [
				{ fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
				{ fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({ valid: false, reason: 'Too many picks — maximum is 1' })
	})

	it('rejects ranks not starting from 1', () => {
		const result = validateCupPicks({
			...base,
			picks: [
				{ fixtureId: 'f1', confidenceRank: 2, predictedResult: 'away_win', pickedTeam: 'away' },
				{ fixtureId: 'f2', confidenceRank: 3, predictedResult: 'home_win', pickedTeam: 'home' },
			],
		})
		expect(result).toEqual({
			valid: false,
			reason: 'Confidence ranks must be unique sequential integers from 1',
		})
	})
})
