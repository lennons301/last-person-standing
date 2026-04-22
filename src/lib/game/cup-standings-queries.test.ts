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
	type CupStandingsPick,
	computeLivesGained,
	computeLivesSpent,
	computeStreak,
	getCupStandingsData,
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
	it('returns 0 when pick did not win', () => {
		expect(computeLivesGained({ result: 'loss' }, -3)).toBe(0)
		expect(computeLivesGained({ result: 'pending' }, -3)).toBe(0)
		expect(computeLivesGained({ result: 'saved_by_life' }, -3)).toBe(0)
	})

	it('returns 0 for a win on a neutral or favourite pick', () => {
		expect(computeLivesGained({ result: 'win' }, 0)).toBe(0)
		expect(computeLivesGained({ result: 'win' }, -1)).toBe(0)
		expect(computeLivesGained({ result: 'win' }, 2)).toBe(0)
	})

	it('returns |tier| lives for an upset win where tier <= -2', () => {
		expect(computeLivesGained({ result: 'win' }, -2)).toBe(2)
		expect(computeLivesGained({ result: 'win' }, -3)).toBe(3)
	})
})

describe('computeLivesSpent', () => {
	it('returns 1 when saved_by_life, otherwise 0', () => {
		expect(computeLivesSpent({ result: 'saved_by_life' })).toBe(1)
		expect(computeLivesSpent({ result: 'win' })).toBe(0)
		expect(computeLivesSpent({ result: 'loss' })).toBe(0)
		expect(computeLivesSpent({ result: 'pending' })).toBe(0)
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
