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

const { findFirstMock, findManyMock, selectMock } = mocks

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
	projectCupCellFromFixture,
} from './cup-standings-queries'

describe('projectCupCellFromFixture', () => {
	const fx = (over: Partial<Parameters<typeof projectCupCellFromFixture>[2]> = {}) => ({
		homeScore: null,
		awayScore: null,
		regularHomeScore: null,
		regularAwayScore: null,
		winner: null,
		status: 'scheduled',
		...over,
	})

	it('projects a finished tie that the underdog QUALIFIED (won on pens) as a win', () => {
		// NED v MAR: away (Morocco) +1 underdog, 1-1 at 90, won the shootout.
		const cell = projectCupCellFromFixture('away', -1, {
			homeScore: 3,
			awayScore: 4,
			regularHomeScore: 1,
			regularAwayScore: 1,
			winner: 'away',
			status: 'finished',
		})
		expect(cell).toBe('win')
	})

	it('derives the qualifier from full-time when winner lags (finished shootout, winner null)', () => {
		const cell = projectCupCellFromFixture('away', -1, {
			homeScore: 3,
			awayScore: 4,
			regularHomeScore: 1,
			regularAwayScore: 1,
			winner: null,
			status: 'finished',
		})
		expect(cell).toBe('win')
	})

	it('projects an underdog that is LEVEL in a live tie as surviving (not red)', () => {
		// The reported bug: a live 1-1 underdog cell was rendered as a loss.
		const cell = projectCupCellFromFixture(
			'away',
			-1,
			fx({ homeScore: 1, awayScore: 1, status: 'live' }),
		)
		expect(cell).toBe('win')
	})

	it('projects a finished underdog draw that did NOT qualify as surviving', () => {
		const cell = projectCupCellFromFixture('away', -1, {
			homeScore: 4, // lost the shootout
			awayScore: 3,
			regularHomeScore: 1,
			regularAwayScore: 1,
			winner: 'home',
			status: 'finished',
		})
		expect(cell).toBe('win') // draw_success renders as a (green) survival
	})

	it('still projects a same-tier live draw as a loss (no survival without the handicap)', () => {
		const cell = projectCupCellFromFixture(
			'home',
			0,
			fx({ homeScore: 1, awayScore: 1, status: 'live' }),
		)
		expect(cell).toBe('loss')
	})

	it('projects a clear lead as a win and a deficit as a loss', () => {
		expect(
			projectCupCellFromFixture('home', 0, fx({ homeScore: 2, awayScore: 0, status: 'live' })),
		).toBe('win')
		expect(
			projectCupCellFromFixture('home', 0, fx({ homeScore: 0, awayScore: 2, status: 'live' })),
		).toBe('loss')
	})

	it('returns pending when there is no score yet', () => {
		expect(projectCupCellFromFixture('home', 0, fx())).toBe('pending')
	})
})

describe('getCupStandingsData', () => {
	it('returns null when game is missing', async () => {
		findFirstMock.mockResolvedValue(undefined)
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})

	it('returns null when there is no current round AND no picks (game has no past rounds to fall back to)', async () => {
		findFirstMock.mockResolvedValue({
			id: 'g',
			currentRoundId: null,
			currentRound: null,
			players: [],
			competition: { type: 'group_knockout', rounds: [] },
			modeConfig: {},
		})
		findManyMock.mockResolvedValue([])
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})

	it('excludes admin_removed players from the standings', async () => {
		// An admin who removes a late/no-pick player must not see them linger in
		// the cup ladder/grid — mirrors the classic + turbo standings filters.
		const round = {
			id: 'r1',
			number: 1,
			status: 'open' as const,
			deadline: new Date('2026-05-01T12:00:00Z'),
			fixtures: [],
		}
		findFirstMock.mockResolvedValue({
			id: 'g',
			currentRoundId: 'r1',
			currentRound: round,
			players: [
				{ id: 'gp1', userId: 'u1', status: 'alive', livesRemaining: 3, eliminatedReason: null },
				{
					id: 'gp2',
					userId: 'u2',
					status: 'eliminated',
					livesRemaining: 0,
					eliminatedReason: 'admin_removed',
				},
			],
			competition: { type: 'group_knockout', rounds: [round] },
			modeConfig: { startingLives: 3, numberOfPicks: 6 },
		})
		findManyMock.mockResolvedValue([])
		selectMock.mockReturnValue({
			from: () => ({
				where: () =>
					Promise.resolve([
						{ id: 'u1', name: 'Alice' },
						{ id: 'u2', name: 'Bob' },
					]),
			}),
		})
		const result = await getCupStandingsData('g', 'u1')
		expect(result?.players.map((p) => p.id)).toEqual(['gp1'])
	})

	it('falls back to the latest round with picks when game has completed (currentRound is null)', async () => {
		// Game completed: applyAutoCompletion has set currentRoundId=null. The ladder
		// should still render, showing the round where the trophy was decided.
		const r1 = {
			id: 'r1',
			number: 1,
			status: 'completed' as const,
			deadline: new Date('2026-05-01T12:00:00Z'),
			fixtures: [],
		}
		const r2 = {
			id: 'r2',
			number: 2,
			status: 'completed' as const,
			deadline: new Date('2026-05-08T12:00:00Z'),
			fixtures: [],
		}
		findFirstMock.mockResolvedValue({
			id: 'g',
			currentRoundId: null,
			currentRound: null,
			players: [],
			competition: { type: 'group_knockout', rounds: [r1, r2] },
			modeConfig: {},
		})
		// First findMany call: picks-by-game (round resolution). Second: picks-for-display-round.
		findManyMock.mockResolvedValueOnce([{ roundId: 'r2' }]).mockResolvedValueOnce([])
		// Mock the user-name lookup (db.select(...).from(...).where(...))
		selectMock.mockReturnValue({
			from: () => ({ where: () => Promise.resolve([]) }),
		})
		const result = await getCupStandingsData('g1', 'u1')
		expect(result).not.toBeNull()
		expect(result?.roundId).toBe('r2')
		expect(result?.roundStatus).toBe('completed')
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
