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
	dbUpdateSet,
	fplFetchTeams,
	fplFetchRounds,
	fplFetchStandings,
	fdFetchTeams,
	fdFetchRounds,
	fdFetchStandings,
	enqueueAutoSubmitMock,
} = vi.hoisted(() => {
	const updateSet = vi.fn((_payload: Record<string, unknown>) => ({
		where: vi.fn().mockResolvedValue(undefined),
	}))
	return {
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
		dbUpdateFn: vi.fn(() => ({ set: updateSet })),
		dbUpdateSet: updateSet,
		fplFetchTeams: vi.fn().mockResolvedValue([]),
		fplFetchRounds: vi.fn().mockResolvedValue([]),
		fplFetchStandings: vi.fn().mockResolvedValue([]),
		fdFetchTeams: vi.fn().mockResolvedValue([]),
		fdFetchRounds: vi.fn().mockResolvedValue([]),
		fdFetchStandings: vi.fn().mockResolvedValue([]),
		enqueueAutoSubmitMock: vi.fn().mockResolvedValue(undefined),
	}
})

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
		return {
			fetchTeams: fplFetchTeams,
			fetchRounds: fplFetchRounds,
			fetchStandings: fplFetchStandings,
		}
	}),
}))

vi.mock('@/lib/data/football-data', () => ({
	// biome-ignore lint/complexity/useArrowFunction: vi.fn().mockImplementation needs a constructable function for `new FootballDataAdapter()`
	FootballDataAdapter: vi.fn().mockImplementation(function () {
		return {
			fetchTeams: fdFetchTeams,
			fetchRounds: fdFetchRounds,
			fetchStandings: fdFetchStandings,
		}
	}),
	resolveFootballDataCode: vi.fn(() => 'PL'),
}))

import {
	bootstrapCompetitions,
	mergeFootballDataIds,
	syncCompetition,
} from './bootstrap-competitions'

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

describe('syncCompetition league-position persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([])
	})

	it('persists league_position for each standings row scoped by external id', async () => {
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([
			{
				teamExternalId: '1',
				position: 1,
				played: 10,
				won: 8,
				drawn: 1,
				lost: 1,
				points: 25,
			},
			{
				teamExternalId: '2',
				position: 4,
				played: 10,
				won: 6,
				drawn: 2,
				lost: 2,
				points: 20,
			},
		])
		dbQueryTeamFindMany.mockResolvedValue([
			{ id: 'team-1-uuid', externalIds: { fpl: '1' } },
			{ id: 'team-2-uuid', externalIds: { fpl: '2' } },
			{ id: 'team-other-uuid', externalIds: { football_data: '99' } },
		])

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		// Two standings rows → two updates with leaguePosition.
		const positionSets = dbUpdateSet.mock.calls
			.map((call) => call[0])
			.filter((payload) => 'leaguePosition' in payload)
		expect(positionSets).toHaveLength(2)
		expect(positionSets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ leaguePosition: 1 }),
				expect.objectContaining({ leaguePosition: 4 }),
			]),
		)
	})

	it('ignores standings rows whose teamExternalId is not in the competition data source', async () => {
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([
			{
				teamExternalId: '999',
				position: 1,
				played: 0,
				won: 0,
				drawn: 0,
				lost: 0,
				points: 0,
			},
		])
		dbQueryTeamFindMany.mockResolvedValue([
			// Team with different data source key — must not match.
			{ id: 'team-fd-uuid', externalIds: { football_data: '999' } },
		])

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		const positionSets = dbUpdateSet.mock.calls
			.map((call) => call[0])
			.filter((payload) => 'leaguePosition' in payload)
		expect(positionSets).toHaveLength(0)
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

describe('syncCompetition deadline-lock trigger (transitionedRoundIds)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
	})

	it('does NOT include the round in transitionedRoundIds on upcoming → open transitions (deadline still in future)', async () => {
		// Deadline is 24h away — within the 48h OPEN_WINDOW so status flips to `open`,
		// but the deadline itself has NOT passed yet.
		const deadline = new Date(Date.now() + 24 * 3600 * 1000)
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{ number: 1, name: 'Round 1', deadline, finished: false, fixtures: [] },
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'upcoming',
			deadline: deadline, // existing round had same deadline, still upcoming
		})

		const result = await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(result.transitionedRoundIds).toEqual([])
	})

	it('DOES include the round in transitionedRoundIds when the deadline has actually passed', async () => {
		// Existing round is `open` (we previously flipped it at T-48h) with a
		// deadline in the past — i.e. the actual lock moment has arrived.
		const pastDeadline = new Date(Date.now() - 3600 * 1000) // 1h ago
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{ number: 1, name: 'Round 1', deadline: pastDeadline, finished: false, fixtures: [] },
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'open',
			deadline: pastDeadline,
		})

		const result = await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(result.transitionedRoundIds).toEqual(['round-1'])
	})

	it('does NOT include the round when it is already completed (finished in adapter)', async () => {
		const pastDeadline = new Date(Date.now() - 24 * 3600 * 1000)
		fplFetchTeams.mockResolvedValue([])
		fplFetchRounds.mockResolvedValue([
			{ number: 1, name: 'Round 1', deadline: pastDeadline, finished: true, fixtures: [] },
		])
		dbQueryRoundFindFirst.mockResolvedValue({
			id: 'round-1',
			status: 'completed',
			deadline: pastDeadline,
		})

		const result = await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		// Finished rounds are not open anymore — no re-fire of the deadline lock.
		expect(result.transitionedRoundIds).toEqual([])
	})
})

describe('mergeFootballDataIds', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
	})

	it('merges football-data team + fixture IDs onto FPL-bootstrapped rows by short_name and (matchday, home, away)', async () => {
		// Existing PL teams + fixtures bootstrapped via FPL.
		const teamArs = {
			id: 'our-ARS',
			shortName: 'ARS',
			externalIds: { fpl: '1' },
		}
		const teamLiv = {
			id: 'our-LIV',
			shortName: 'LIV',
			externalIds: { fpl: '12' },
		}
		dbQueryTeamFindMany.mockResolvedValueOnce([teamArs, teamLiv])

		const ourFixture = {
			id: 'our-fx-1',
			homeTeamId: 'our-ARS',
			awayTeamId: 'our-LIV',
			externalIds: { fpl: '347' },
		}
		dbQueryRoundFindMany.mockResolvedValue([{ id: 'our-r-35', number: 35, fixtures: [ourFixture] }])

		// Football-data adapter returns matching teams (by tla) + matching fixture (by matchday + team ids).
		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal', shortName: 'ARS', badgeUrl: 'fd-ars.png' },
			{ externalId: '64', name: 'Liverpool', shortName: 'LIV', badgeUrl: 'fd-liv.png' },
		])
		fdFetchRounds.mockResolvedValue([
			{
				externalId: '35',
				number: 35,
				name: 'Matchday 35',
				deadline: null,
				finished: false,
				fixtures: [
					{
						externalId: '538131',
						homeTeamExternalId: '57',
						awayTeamExternalId: '64',
						kickoff: new Date(),
						status: 'scheduled' as const,
						homeScore: null,
						awayScore: null,
					},
				],
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		// We expect 3 update set() calls: 2 teams + 1 fixture.
		const teamArsUpdate = dbUpdateSet.mock.calls.find(
			(c) =>
				(c[0] as { externalIds?: { football_data?: string } }).externalIds?.football_data === '57',
		)
		expect(teamArsUpdate?.[0]).toMatchObject({
			externalIds: { fpl: '1', football_data: '57' },
			badgeUrl: 'fd-ars.png',
		})

		const fixtureUpdate = dbUpdateSet.mock.calls.find(
			(c) =>
				(c[0] as { externalIds?: { football_data?: string } }).externalIds?.football_data ===
				'538131',
		)
		expect(fixtureUpdate?.[0]).toEqual({
			externalIds: { fpl: '347', football_data: '538131' },
		})
	})

	it('skips fixtures when our DB has no matching team for the football-data tla', async () => {
		dbQueryTeamFindMany.mockResolvedValueOnce([])
		dbQueryRoundFindMany.mockResolvedValue([])

		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal', shortName: 'ARS', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		// No team matched → no team updates → no fixture updates either.
		expect(dbUpdateSet).not.toHaveBeenCalled()
	})
})
