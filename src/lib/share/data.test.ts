import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		query: {
			game: { findFirst: vi.fn() },
			payment: { findMany: vi.fn().mockResolvedValue([]) },
		},
	},
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

const { getProgressGridDataMock, getCupStandingsDataMock, getTurboStandingsDataMock } = vi.hoisted(
	() => ({
		getProgressGridDataMock: vi.fn(),
		getCupStandingsDataMock: vi.fn(),
		getTurboStandingsDataMock: vi.fn(),
	}),
)
vi.mock('@/lib/game/detail-queries', () => ({
	getProgressGridData: getProgressGridDataMock,
	getTurboStandingsData: getTurboStandingsDataMock,
}))
vi.mock('@/lib/game/cup-standings-queries', () => ({
	getCupStandingsData: getCupStandingsDataMock,
}))

import { db } from '@/lib/db'
import { getShareLiveData, getShareStandingsData, getShareWinnerData } from './data'

function makeHeaderMock(mode: 'classic' | 'cup' | 'turbo') {
	vi.mocked(db.query.game.findFirst).mockResolvedValue({
		id: 'g1',
		name: 'Test Game',
		gameMode: mode,
		competition: { name: 'World Cup' },
	} as never)
}

describe('getShareStandingsData', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns null when game does not exist', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		expect(await getShareStandingsData('g1', 'u1')).toBeNull()
	})

	it('returns classic shape when mode is classic', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({ players: [], rounds: [] })
		const result = await getShareStandingsData('g1', 'u1')
		expect(result?.mode).toBe('classic')
		expect(result?.mode === 'classic' && result.flat).toBe(false)
	})

	it('classic: a gameweek-pick sort orders players by team and flags flat', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({
			rounds: [{ id: 'r1', number: 1, name: 'GW1', label: 'GW1' }],
			players: [
				{
					id: 'c',
					name: 'Carol',
					status: 'alive',
					goals: 0,
					cellsByRoundId: { r1: { result: 'win', teamShortName: 'CHE' } },
				},
				{
					id: 'a',
					name: 'Alice',
					status: 'alive',
					goals: 0,
					cellsByRoundId: { r1: { result: 'win', teamShortName: 'ARS' } },
				},
				{
					id: 'b',
					name: 'Bob',
					status: 'eliminated',
					eliminatedRoundNumber: 1,
					goals: 0,
					cellsByRoundId: { r1: { result: 'loss', teamShortName: 'ARS' } },
				},
			],
		})
		const result = await getShareStandingsData('g1', 'u1', {
			sort: { key: 'round', roundId: 'r1', dir: 'asc' },
		})
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.flat).toBe(true)
		// ARS pickers grouped (incl. the eliminated one), then CHE — name tiebreak.
		expect(result.classicGrid.players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Carol'])
	})

	it('classic: aliveOnly filters out eliminated players', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({
			rounds: [],
			players: [
				{ id: 'a', name: 'Alice', status: 'alive', goals: 0, cellsByRoundId: {} },
				{
					id: 'b',
					name: 'Bob',
					status: 'eliminated',
					eliminatedRoundNumber: 1,
					goals: 0,
					cellsByRoundId: {},
				},
			],
		})
		const result = await getShareStandingsData('g1', 'u1', { aliveOnly: true })
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.classicGrid.players.map((p) => p.name)).toEqual(['Alice'])
	})

	it('returns cup shape when mode is cup', async () => {
		makeHeaderMock('cup')
		getCupStandingsDataMock.mockResolvedValue({
			gameId: 'g1',
			roundId: 'r1',
			players: [],
			roundNumber: 1,
			roundStatus: 'open',
			numberOfPicks: 10,
			maxLives: 3,
		})
		const result = await getShareStandingsData('g1', 'u1')
		expect(result?.mode).toBe('cup')
		expect(result?.mode === 'cup' && result.overflowCount).toBe(0)
	})

	it('returns turbo shape when mode is turbo', async () => {
		makeHeaderMock('turbo')
		getTurboStandingsDataMock.mockResolvedValue({
			rounds: [
				{
					id: 'r1',
					number: 1,
					name: 'GW1',
					status: 'open',
					players: [],
					fixtures: [],
				},
			],
		})
		const result = await getShareStandingsData('g1', 'u1')
		expect(result?.mode).toBe('turbo')
	})

	it('cup overflow count = max(0, total - 30)', async () => {
		makeHeaderMock('cup')
		getCupStandingsDataMock.mockResolvedValue({
			gameId: 'g1',
			roundId: 'r1',
			players: Array.from({ length: 35 }).map(() => ({})),
			roundNumber: 1,
			roundStatus: 'open',
			numberOfPicks: 10,
			maxLives: 3,
		})
		const result = await getShareStandingsData('g1', 'u1')
		expect(result?.mode === 'cup' && result.overflowCount).toBe(5)
	})

	it('passes viewerUserId to getProgressGridData', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({ players: [], rounds: [] })
		await getShareStandingsData('g1', 'user-42')
		expect(getProgressGridDataMock).toHaveBeenCalledWith('g1', 'user-42', {
			hideAllCurrentPicks: true,
		})
	})
})

describe('getShareLiveData', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns null when game is missing', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const result = await getShareLiveData('g1', 'u1')
		expect(result).toBeNull()
	})
})

describe('getShareWinnerData', () => {
	beforeEach(() => vi.clearAllMocks())

	it('returns null when game is missing', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
		const r = await getShareWinnerData('g1', 'u1')
		expect(r).toBeNull()
	})
})
