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
vi.mock('@/lib/game/read/standings', () => ({
	getProgressGridData: getProgressGridDataMock,
	getTurboStandingsData: getTurboStandingsDataMock,
}))
vi.mock('@/lib/game/cup-standings-queries', () => ({
	getCupStandingsData: getCupStandingsDataMock,
}))

import { db } from '@/lib/db'
import { getShareLiveData, getShareStandingsData, getShareWinnerData } from './data'
import { classicStandingsLayout } from './layouts/classic-standings'

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
			rounds: [{ id: 'r1', number: 1, name: 'GW1', label: 'GW1', picksLocked: true }],
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

	it('classic: drops gameweeks whose picks are not locked yet (#225 advance picks)', async () => {
		makeHeaderMock('classic')
		// The reported shape: three played gameweeks plus an advance pick on a
		// far-future one, which "touches" GW13 and drags the column set out to it.
		getProgressGridDataMock.mockResolvedValue({
			rounds: [
				{ id: 'r1', number: 1, label: 'GW1', picksLocked: true },
				{ id: 'r2', number: 2, label: 'GW2', picksLocked: true },
				{ id: 'r3', number: 3, label: 'GW3', picksLocked: true },
				{ id: 'r13', number: 13, label: 'GW13', picksLocked: false },
			],
			players: [],
		})
		const result = await getShareStandingsData('g1', 'u1')
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.classicGrid.rounds.map((r) => r.label)).toEqual(['GW1', 'GW2', 'GW3'])
	})

	it('classic: a long game with advance picks shares its six most recent PLAYED gameweeks', async () => {
		makeHeaderMock('classic')
		// Eight gameweeks played, two advance picks out in front of them. The
		// layout takes the last six of what it is handed, so what it is handed
		// decides whether the image is results or padlocks (#225).
		getProgressGridDataMock.mockResolvedValue({
			rounds: [
				...Array.from({ length: 8 }).map((_, i) => ({
					id: `r${i + 1}`,
					number: i + 1,
					label: `GW${i + 1}`,
					picksLocked: true,
				})),
				{ id: 'r9', number: 9, label: 'GW9', picksLocked: false },
				{ id: 'r20', number: 20, label: 'GW20', picksLocked: false },
			],
			players: [{ id: 'a', name: 'Alice', status: 'alive', goals: 0, cellsByRoundId: {} }],
		})
		const result = await getShareStandingsData('g1', 'u1')
		if (result?.mode !== 'classic') throw new Error('expected classic')
		const rendered = JSON.stringify(classicStandingsLayout(result).jsx)
		for (const label of ['GW3', 'GW4', 'GW5', 'GW6', 'GW7', 'GW8']) {
			expect(rendered).toContain(`"${label}"`)
		}
		for (const label of ['GW1', 'GW2', 'GW9', 'GW20']) {
			expect(rendered).not.toContain(`"${label}"`)
		}
	})

	it('classic: keeps a post-deadline gameweek whose fixtures are still in progress', async () => {
		makeHeaderMock('classic')
		// Mid-round share: GW2's deadline has passed (picks locked) but nothing
		// has settled, so its cells still project from live scores.
		getProgressGridDataMock.mockResolvedValue({
			rounds: [
				{ id: 'r1', number: 1, label: 'GW1', picksLocked: true },
				{ id: 'r2', number: 2, label: 'GW2', picksLocked: true },
				{ id: 'r3', number: 3, label: 'GW3', picksLocked: false },
			],
			players: [
				{
					id: 'a',
					name: 'Alice',
					status: 'alive',
					goals: 0,
					cellsByRoundId: {
						r1: { result: 'win', teamShortName: 'ARS' },
						r2: { result: 'pending', teamShortName: 'CHE' },
						r3: { result: 'locked' },
					},
				},
			],
		})
		const result = await getShareStandingsData('g1', 'u1')
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.classicGrid.rounds.map((r) => r.label)).toEqual(['GW1', 'GW2'])
	})

	it('classic: yields no gameweeks at all when none has passed its deadline', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({
			rounds: [
				{ id: 'r1', number: 1, label: 'GW1', picksLocked: false },
				{ id: 'r5', number: 5, label: 'GW5', picksLocked: false },
			],
			players: [{ id: 'a', name: 'Alice', status: 'alive', goals: 0, cellsByRoundId: {} }],
		})
		const result = await getShareStandingsData('g1', 'u1')
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.classicGrid.rounds).toEqual([])
		// The players still come through — the card is rendered, just column-less.
		expect(result.classicGrid.players.map((p) => p.name)).toEqual(['Alice'])
	})

	it('classic: the round filter leaves the players ordering alone', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({
			rounds: [{ id: 'r1', number: 1, label: 'GW1', picksLocked: true }],
			players: [
				{ id: 'b', name: 'Bob', status: 'alive', goals: 0, cellsByRoundId: {} },
				{
					id: 'a',
					name: 'Alice',
					status: 'eliminated',
					eliminatedRoundNumber: 1,
					goals: 0,
					cellsByRoundId: {},
				},
			],
		})
		const result = await getShareStandingsData('g1', 'u1')
		if (result?.mode !== 'classic') throw new Error('expected classic')
		expect(result.classicGrid.players.map((p) => p.name)).toEqual(['Bob', 'Alice'])
	})

	it('passes viewerUserId to getProgressGridData', async () => {
		makeHeaderMock('classic')
		getProgressGridDataMock.mockResolvedValue({ players: [], rounds: [] })
		await getShareStandingsData('g1', 'user-42')
		expect(getProgressGridDataMock).toHaveBeenCalledWith('g1', 'user-42', {
			hideUnlockedPicks: true,
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
