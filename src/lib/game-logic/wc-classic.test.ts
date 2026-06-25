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
	status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
	stage: 'group' | 'knockout'
	winner: 'home' | 'away' | null
}

const r1 = 'round-group-1'
const r2 = 'round-knockout'

function f(partial: Partial<F> & Pick<F, 'id' | 'homeTeamId' | 'awayTeamId' | 'stage'>): F {
	return {
		roundId: r1,
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		winner: null,
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

	it('returns false when a level knockout score has no recorded winner (undecided)', () => {
		// A level score with no `winner` recorded is treated as undecided →
		// nobody eliminated (the winner field, when present, is authoritative).
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

	it('eliminates the ET/penalty loser via winner on a level full-time score', () => {
		// 1-1 full time, home advanced on penalties (winner: 'home').
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't2',
			homeScore: 1,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
			winner: 'home',
		})
		expect(isTeamTournamentEliminated('t2', [knockout])).toBe(true)
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

	it('eliminates NO ONE when the remaining bracket is unpublished (TBD rounds, no fixtures) — the dc857c5f MD3 boundary', () => {
		// At the group→knockout boundary the WC knockout rounds exist as round
		// rows but have no fixtures yet (teams TBD). A player who has used every
		// team so far must NOT be auto-eliminated — the bracket may still offer a
		// valid team. Without the guard, every alive player is wrongly culled.
		const elims = computeWcClassicAutoElims({
			alivePlayers: [
				{ gamePlayerId: 'p1', usedTeamIds: ['t1', 't2', 't3'] },
				{ gamePlayerId: 'p2', usedTeamIds: ['t4', 't5', 't6'] },
			],
			remainingRounds: [
				{ id: 'r-last32', fixtures: [] },
				{ id: 'r-last16', fixtures: [] },
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})

	it('eliminates NO ONE when there are no remaining rounds at all (true end — completion handles it)', () => {
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1', 't2', 't3'] }],
			remainingRounds: [],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})

	it('still prunes once EVERY remaining round is published, even alongside earlier rounds', () => {
		// Two remaining rounds, both with fixtures; the player has used both teams
		// in the only fixtures available → genuinely out → eliminated.
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1', 't2', 't3', 't4'] }],
			remainingRounds: [
				{
					id: 'r-a',
					fixtures: [f({ id: 'a1', homeTeamId: 't1', awayTeamId: 't2', stage: 'knockout' })],
				},
				{
					id: 'r-b',
					fixtures: [f({ id: 'b1', homeTeamId: 't3', awayTeamId: 't4', stage: 'knockout' })],
				},
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([{ gamePlayerId: 'p1', reason: 'ran-out-of-teams' }])
	})
})
