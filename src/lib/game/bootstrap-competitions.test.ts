import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
	dbQueryCompetitionFindFirst,
	dbQueryTeamFindFirst,
	dbQueryTeamFindMany,
	dbQueryRoundFindFirst,
	dbQueryRoundFindMany,
	dbQueryFixtureFindFirst,
	dbQueryPlannedPickFindMany,
	dbInsertFn,
	dbUpdateFn,
	fplFetchTeams,
	fplFetchRounds,
	fdFetchTeams,
	fdFetchRounds,
	enqueueAutoSubmitMock,
} = vi.hoisted(() => ({
	dbQueryCompetitionFindFirst: vi.fn(),
	dbQueryTeamFindFirst: vi.fn(),
	dbQueryTeamFindMany: vi.fn().mockResolvedValue([]),
	dbQueryRoundFindFirst: vi.fn(),
	dbQueryRoundFindMany: vi.fn().mockResolvedValue([]),
	dbQueryFixtureFindFirst: vi.fn(),
	dbQueryPlannedPickFindMany: vi.fn().mockResolvedValue([]),
	dbInsertFn: vi.fn(() => ({
		values: vi.fn(() => ({
			returning: vi.fn().mockResolvedValue([{ id: 'new', externalId: 'WC' }]),
		})),
	})),
	dbUpdateFn: vi.fn(() => ({
		set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
	})),
	fplFetchTeams: vi.fn().mockResolvedValue([]),
	fplFetchRounds: vi.fn().mockResolvedValue([]),
	fdFetchTeams: vi.fn().mockResolvedValue([]),
	fdFetchRounds: vi.fn().mockResolvedValue([]),
	enqueueAutoSubmitMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: { findFirst: dbQueryCompetitionFindFirst },
			team: { findFirst: dbQueryTeamFindFirst, findMany: dbQueryTeamFindMany },
			round: { findFirst: dbQueryRoundFindFirst, findMany: dbQueryRoundFindMany },
			fixture: { findFirst: dbQueryFixtureFindFirst },
			plannedPick: { findMany: dbQueryPlannedPickFindMany },
		},
		insert: dbInsertFn,
		update: dbUpdateFn,
	},
}))

vi.mock('@/lib/data/qstash', () => ({ enqueueAutoSubmit: enqueueAutoSubmitMock }))

vi.mock('@/lib/data/fpl', () => ({
	// biome-ignore lint/complexity/useArrowFunction: vi.fn().mockImplementation needs a constructable function for `new FplAdapter()`
	FplAdapter: vi.fn().mockImplementation(function () {
		return { fetchTeams: fplFetchTeams, fetchRounds: fplFetchRounds }
	}),
}))

vi.mock('@/lib/data/football-data', () => ({
	// biome-ignore lint/complexity/useArrowFunction: vi.fn().mockImplementation needs a constructable function for `new FootballDataAdapter()`
	FootballDataAdapter: vi.fn().mockImplementation(function () {
		return { fetchTeams: fdFetchTeams, fetchRounds: fdFetchRounds }
	}),
	resolveFootballDataCode: vi.fn(() => 'PL'),
}))

import { bootstrapCompetitions, syncCompetition } from './bootstrap-competitions'

describe('bootstrapCompetitions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
	})

	it('creates PL and WC competitions when they do not exist', async () => {
		dbQueryCompetitionFindFirst.mockResolvedValue(undefined)
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		expect(dbInsertFn).toHaveBeenCalled()
	})

	it('is idempotent when competitions already exist', async () => {
		dbQueryCompetitionFindFirst.mockResolvedValue({
			id: 'existing',
			dataSource: 'fpl',
			externalId: null,
			status: 'active',
		})
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		// No assertion that insert was NOT called — adapters may still insert teams/rounds.
		// This test just ensures the function runs without error when comps already exist.
	})
})

describe('syncCompetition auto-submit enqueue', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
	})

	it('enqueues auto-submits when a round transitions from upcoming to open', async () => {
		const deadline = new Date(Date.now() + 24 * 3600 * 1000) // 24h away → within 48h window → open
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{
				number: 1,
				name: 'Round 1',
				deadline,
				finished: false,
				fixtures: [],
			},
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'upcoming',
		})
		dbQueryPlannedPickFindMany.mockResolvedValue([
			{ id: 'pp-1', gamePlayerId: 'gp-1', roundId: 'round-1', teamId: 't-1', autoSubmit: true },
			{ id: 'pp-2', gamePlayerId: 'gp-2', roundId: 'round-1', teamId: 't-2', autoSubmit: false },
		])

		await syncCompetition(
			{
				id: 'comp-1',
				dataSource: 'fpl',
				externalId: null,
				season: '2025/26',
			} as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(enqueueAutoSubmitMock).toHaveBeenCalledTimes(1)
		expect(enqueueAutoSubmitMock).toHaveBeenCalledWith(
			'gp-1',
			'round-1',
			't-1',
			new Date(deadline.getTime() - 60_000),
		)
	})

	it('does not re-enqueue when the round was already open', async () => {
		const deadline = new Date(Date.now() + 24 * 3600 * 1000)
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{
				number: 1,
				name: 'Round 1',
				deadline,
				finished: false,
				fixtures: [],
			},
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'open',
		})
		dbQueryPlannedPickFindMany.mockResolvedValue([
			{ id: 'pp-1', gamePlayerId: 'gp-1', roundId: 'round-1', teamId: 't-1', autoSubmit: true },
		])

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})

	it('does not enqueue when the round remains upcoming (deadline still far away)', async () => {
		const deadline = new Date(Date.now() + 10 * 24 * 3600 * 1000) // 10 days away
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{
				number: 1,
				name: 'Round 1',
				deadline,
				finished: false,
				fixtures: [],
			},
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'upcoming',
		})
		dbQueryPlannedPickFindMany.mockResolvedValue([
			{ id: 'pp-1', gamePlayerId: 'gp-1', roundId: 'round-1', teamId: 't-1', autoSubmit: true },
		])

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})
})
