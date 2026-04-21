import { describe, expect, it } from 'vitest'
import {
	computeWcClassicAutoElims,
	isTeamTournamentEliminated,
	validateWcClassicPick,
} from './wc-classic'

interface F {
	id: string
	roundId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	status: 'scheduled' | 'live' | 'finished' | 'postponed'
	stage: 'group' | 'knockout'
}

const r1 = 'round-group-1'
const r2 = 'round-knockout'

function f(partial: Partial<F> & Pick<F, 'id' | 'homeTeamId' | 'awayTeamId' | 'stage'>): F {
	return {
		roundId: r1,
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		...partial,
	}
}

describe('isTeamTournamentEliminated', () => {
	it('returns false for teams with no knockout losses', () => {
		expect(isTeamTournamentEliminated('t1', [])).toBe(false)
	})

	it('returns true when team lost a knockout fixture', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't2',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(isTeamTournamentEliminated('t1', [knockout])).toBe(true)
	})

	it('returns false when a knockout fixture finished in a draw (penalties go on)', () => {
		// For the purposes of the LPS rule, a draw doesn't eliminate;
		// only a decisive loss does. Our fixture status does not carry penalties,
		// so we conservatively treat draw as not-eliminated.
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't2',
			homeScore: 1,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(isTeamTournamentEliminated('t1', [knockout])).toBe(false)
	})
})

describe('validateWcClassicPick', () => {
	const roundFixtures: F[] = [f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' })]

	it('allows picking a team playing in the round', () => {
		expect(
			validateWcClassicPick({
				teamId: 't1',
				roundFixtures,
				finishedKnockoutFixtures: [],
			}),
		).toEqual({ valid: true })
	})

	it('rejects picks of teams not playing this round', () => {
		expect(
			validateWcClassicPick({
				teamId: 't99',
				roundFixtures,
				finishedKnockoutFixtures: [],
			}),
		).toEqual({ valid: false, reason: 'team-not-in-round' })
	})

	it('rejects picks of teams eliminated from the tournament', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't0',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(
			validateWcClassicPick({
				teamId: 't1',
				roundFixtures,
				finishedKnockoutFixtures: [knockout],
			}),
		).toEqual({ valid: false, reason: 'team-tournament-eliminated' })
	})
})

describe('computeWcClassicAutoElims', () => {
	it('returns empty list if every alive player has a valid remaining pick', () => {
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t3'] }],
			remainingRounds: [
				{
					id: r1,
					fixtures: [f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' })],
				},
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})

	it('auto-eliminates a player when every remaining fixture features only used or eliminated teams', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't2',
			awayTeamId: 't99',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1'] }],
			remainingRounds: [
				{
					id: r1,
					fixtures: [f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' })],
				},
			],
			finishedKnockoutFixtures: [knockout],
		})
		expect(elims).toEqual([{ gamePlayerId: 'p1', reason: 'ran-out-of-teams' }])
	})

	it('does not auto-eliminate when at least one remaining fixture has a valid team', () => {
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1'] }],
			remainingRounds: [
				{
					id: r1,
					fixtures: [f({ id: 'g1', homeTeamId: 't3', awayTeamId: 't4', stage: 'group' })],
				},
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})
})
