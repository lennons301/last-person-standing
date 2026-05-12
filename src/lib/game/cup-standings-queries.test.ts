import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	findFirstMock: vi.fn(),
	findManyMock: vi.fn(),
	selectMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: mocks.findFirstMock },
			pick: { findMany: mocks.findManyMock },
		},
		select: mocks.selectMock,
	},
}))

const { findFirstMock } = mocks

import {
	type CupLadderBacker,
	type CupStandingsPick,
	type CupStandingsPlayer,
	computeLivesGained,
	computeLivesSpent,
	computeStreak,
	getCupStandingsData,
	isCrucial,
	mapPickResult,
} from './cup-standings-queries'

describe('getCupStandingsData', () => {
	it('returns null when game is missing', async () => {
		findFirstMock.mockResolvedValue(undefined)
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})

	it('returns null when there is no current round', async () => {
		findFirstMock.mockResolvedValue({
			id: 'g',
			currentRound: null,
			players: [],
			competition: { type: 'group_knockout' },
			modeConfig: {},
		})
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})
})

describe('mapPickResult', () => {
	it('maps draw and win to win', () => {
		expect(mapPickResult('win')).toBe('win')
		expect(mapPickResult('draw')).toBe('win')
	})

	it('maps saved_by_life through', () => {
		expect(mapPickResult('saved_by_life')).toBe('saved_by_life')
	})

	it('maps loss through', () => {
		expect(mapPickResult('loss')).toBe('loss')
	})

	it('returns pending for anything else', () => {
		expect(mapPickResult('pending')).toBe('pending')
		expect(mapPickResult('unknown')).toBe('pending')
	})
})

describe('computeLivesGained', () => {
	it('reads the persisted life_gained column', () => {
		// Lives gained are now written by reevaluateCupGame from
		// evaluateCupPicks at settlement time, not recomputed on read.
		expect(computeLivesGained({ lifeGained: 0 })).toBe(0)
		expect(computeLivesGained({ lifeGained: 2 })).toBe(2)
		expect(computeLivesGained({ lifeGained: 3 })).toBe(3)
	})

	it('defaults to 0 when the column is null/undefined', () => {
		expect(computeLivesGained({})).toBe(0)
		expect(computeLivesGained({ lifeGained: null })).toBe(0)
	})
})

describe('computeLivesSpent', () => {
	it('reads the persisted life_spent column', () => {
		expect(computeLivesSpent({ lifeSpent: true })).toBe(1)
		expect(computeLivesSpent({ lifeSpent: false })).toBe(0)
	})

	it('falls back to result==="saved_by_life" for rows without the column', () => {
		expect(computeLivesSpent({ result: 'saved_by_life' })).toBe(1)
		expect(computeLivesSpent({ result: 'win' })).toBe(0)
	})
})

describe('computeStreak', () => {
	const makePick = (rank: number, result: CupStandingsPick['result']): CupStandingsPick => ({
		gamePlayerId: 'gp',
		confidenceRank: rank,
		fixtureId: 'f',
		homeShort: 'H',
		awayShort: 'A',
		pickedTeamId: 't',
		pickedSide: 'home',
		tierDifference: 0,
		result,
		livesGained: 0,
		livesSpent: 0,
		goalsCounted: 0,
	})

	it('returns 0 when first pick lost', () => {
		expect(computeStreak([makePick(1, 'loss'), makePick(2, 'win')])).toBe(0)
	})

	it('counts consecutive wins from lowest rank up', () => {
		expect(computeStreak([makePick(2, 'win'), makePick(1, 'win'), makePick(3, 'loss')])).toBe(2)
	})

	it('counts saved_by_life as continuing the streak', () => {
		expect(
			computeStreak([makePick(1, 'win'), makePick(2, 'saved_by_life'), makePick(3, 'loss')]),
		).toBe(2)
	})

	it('breaks on pending', () => {
		expect(computeStreak([makePick(1, 'win'), makePick(2, 'pending')])).toBe(1)
	})
})

describe('isCrucial', () => {
	const makeBacker = (
		playerId: string,
		confidenceRank = 1,
		result: CupLadderBacker['result'] = 'pending',
	): CupLadderBacker => ({
		playerId,
		playerName: playerId,
		confidenceRank,
		result,
		livesGained: 0,
		livesSpent: 0,
	})

	const makePlayer = (id: string, livesRemaining: number): CupStandingsPlayer => ({
		id,
		userId: `user-${id}`,
		name: id,
		status: 'alive',
		livesRemaining,
		streak: 0,
		goals: 0,
		hasSubmitted: true,
		eliminatedRoundNumber: null,
		eliminatedRoundLabel: null,
		picks: [],
	})

	it('is not crucial once the fixture has played', () => {
		expect(
			isCrucial(
				{ actualOutcome: 'home_win' },
				{ homeBackers: [makeBacker('p1')], awayBackers: [makeBacker('p2')] },
				[makePlayer('p1', 2), makePlayer('p2', 2)],
			),
		).toBe(false)
	})

	it('is crucial when backers split across both sides', () => {
		expect(
			isCrucial(
				{ actualOutcome: null },
				{ homeBackers: [makeBacker('p1')], awayBackers: [makeBacker('p2')] },
				[makePlayer('p1', 2), makePlayer('p2', 2)],
			),
		).toBe(true)
	})

	it('is crucial when a no-lives player has staked a pick on it', () => {
		expect(
			isCrucial(
				{ actualOutcome: null },
				{ homeBackers: [makeBacker('p1'), makeBacker('p2')], awayBackers: [] },
				[makePlayer('p1', 0), makePlayer('p2', 2)],
			),
		).toBe(true)
	})

	it('is not crucial when everyone is on the same side and has lives', () => {
		expect(
			isCrucial(
				{ actualOutcome: null },
				{ homeBackers: [makeBacker('p1'), makeBacker('p2')], awayBackers: [] },
				[makePlayer('p1', 2), makePlayer('p2', 2)],
			),
		).toBe(false)
	})

	it('is not crucial when the fixture has no backers at all', () => {
		expect(
			isCrucial({ actualOutcome: null }, { homeBackers: [], awayBackers: [] }, [
				makePlayer('p1', 0),
			]),
		).toBe(false)
	})
})
