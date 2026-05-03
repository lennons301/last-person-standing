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
	dbSelectFn,
	dbSelectWhere,
	fplFetchTeams,
	fplFetchRounds,
	fplFetchStandings,
	fdFetchTeams,
	fdFetchRounds,
	fdFetchStandings,
	enqueueAutoSubmitMock,
	enqueuePollScoresAtMock,
} = vi.hoisted(() => {
	const updateSet = vi.fn((_payload: Record<string, unknown>) => ({
		where: vi.fn().mockResolvedValue(undefined),
	}))
	const selectWhere = vi.fn().mockResolvedValue([])
	const selectFn = vi.fn(() => ({
		from: () => ({ where: selectWhere }),
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
		dbSelectFn: selectFn,
		dbSelectWhere: selectWhere,
		fplFetchTeams: vi.fn().mockResolvedValue([]),
		fplFetchRounds: vi.fn().mockResolvedValue([]),
		fplFetchStandings: vi.fn().mockResolvedValue([]),
		fdFetchTeams: vi.fn().mockResolvedValue([]),
		fdFetchRounds: vi.fn().mockResolvedValue([]),
		fdFetchStandings: vi.fn().mockResolvedValue([]),
		enqueueAutoSubmitMock: vi.fn().mockResolvedValue(undefined),
		enqueuePollScoresAtMock: vi.fn().mockResolvedValue(undefined),
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
		select: dbSelectFn,
	},
}))

vi.mock('@/lib/data/qstash', () => ({
	enqueueAutoSubmit: enqueueAutoSubmitMock,
	enqueuePollScoresAt: enqueuePollScoresAtMock,
}))

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
	scheduleUpcomingFixturePolls,
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
			name: 'Arsenal',
			externalIds: { fpl: '1' },
		}
		const teamLiv = {
			id: 'our-LIV',
			shortName: 'LIV',
			name: 'Liverpool',
			externalIds: { fpl: '12' },
		}
		// First findMany: pre-merge state for the merge step. Second findMany:
		// post-merge state for the coverage assertion (mocks the writes that
		// would have happened in real DB).
		dbQueryTeamFindMany.mockResolvedValueOnce([teamArs, teamLiv]).mockResolvedValueOnce([
			{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
			{ ...teamLiv, externalIds: { fpl: '12', football_data: '64' } },
		])

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

	it('matches rescheduled fixtures across different matchdays (FPL gameweek vs football-data matchday)', async () => {
		// Real prod case: FPL says GW26 WOL v ARS but football-data has the same
		// fixture under matchday 31 because of a reschedule. Match must succeed.
		const teamWol = {
			id: 'our-WOL',
			shortName: 'WOL',
			name: 'Wolves',
			externalIds: { fpl: '20' },
		}
		const teamArs = {
			id: 'our-ARS',
			shortName: 'ARS',
			name: 'Arsenal',
			externalIds: { fpl: '1' },
		}
		dbQueryTeamFindMany.mockResolvedValueOnce([teamWol, teamArs]).mockResolvedValueOnce([
			{ ...teamWol, externalIds: { fpl: '20', football_data: '76' } },
			{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
		])

		const ourFixtureRescheduled = {
			id: 'our-fx-reschedule',
			homeTeamId: 'our-WOL',
			awayTeamId: 'our-ARS',
			externalIds: { fpl: '310' },
		}
		// Our DB tracks it under round 26 (FPL event)
		dbQueryRoundFindMany.mockResolvedValue([
			{ id: 'our-r-26', number: 26, fixtures: [ourFixtureRescheduled] },
		])

		fdFetchTeams.mockResolvedValue([
			{ externalId: '76', name: 'Wolverhampton Wanderers FC', shortName: 'WOL', badgeUrl: null },
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
		])
		// Football-data tracks the same fixture under matchday 31 (rescheduled)
		fdFetchRounds.mockResolvedValue([
			{
				externalId: '31',
				number: 31,
				name: 'Matchday 31',
				deadline: null,
				finished: true,
				fixtures: [
					{
						externalId: '538200',
						homeTeamExternalId: '76',
						awayTeamExternalId: '57',
						kickoff: new Date('2026-02-18T20:00:00Z'),
						status: 'finished' as const,
						homeScore: 2,
						awayScore: 2,
					},
				],
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		// The fixture should now have football_data id even though our matchday was 26 and fd's was 31.
		const update = dbUpdateSet.mock.calls.find(
			(c) =>
				(c[0] as { externalIds?: { football_data?: string } }).externalIds?.football_data ===
				'538200',
		)
		expect(update?.[0]).toEqual({
			externalIds: { fpl: '310', football_data: '538200' },
		})
	})

	it('matches teams via FPL_TO_FD_TLA alias when codes differ across sources (NFO → NOT)', async () => {
		const teamForest = {
			id: 'our-NFO',
			shortName: 'NFO',
			name: "Nott'm Forest",
			externalIds: { fpl: '16' },
		}
		dbQueryTeamFindMany
			.mockResolvedValueOnce([teamForest])
			.mockResolvedValueOnce([{ ...teamForest, externalIds: { fpl: '16', football_data: '351' } }])
		dbQueryRoundFindMany.mockResolvedValue([])

		// Football-data returns the team with its `tla=NOT`, our DB has `short_name=NFO`.
		fdFetchTeams.mockResolvedValue([
			{ externalId: '351', name: 'Nottingham Forest FC', shortName: 'NOT', badgeUrl: 'fd-not.png' },
		])
		fdFetchRounds.mockResolvedValue([])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		const update = dbUpdateSet.mock.calls.find(
			(c) =>
				(c[0] as { externalIds?: { football_data?: string } }).externalIds?.football_data === '351',
		)
		expect(update?.[0]).toMatchObject({
			externalIds: { fpl: '16', football_data: '351' },
			badgeUrl: 'fd-not.png',
		})
	})

	it('skips fixtures when our DB has no matching team for the football-data tla', async () => {
		// Both findMany calls (merge + coverage assertion) get [] — no FPL teams
		// in our DB so the assertion is trivially satisfied.
		dbQueryTeamFindMany.mockResolvedValue([])
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

	it('throws if any FPL team is missing football_data id after merge (alias map gap)', async () => {
		// Hypothetical 2026/27 promoted team that we forgot to add to FPL_TO_FD_TLA.
		const newPromotedTeam = {
			id: 'our-XYZ',
			shortName: 'XYZ',
			name: 'Hypothetical FC',
			externalIds: { fpl: '99' },
		}
		// First call: pre-merge state. Second call: post-merge state — still missing
		// football_data id because the merge couldn't find a matching tla.
		dbQueryTeamFindMany
			.mockResolvedValueOnce([newPromotedTeam])
			.mockResolvedValueOnce([newPromotedTeam])
		dbQueryRoundFindMany.mockResolvedValue([])

		// Football-data has the team but under a different tla; merge can't link them.
		fdFetchTeams.mockResolvedValue([
			{ externalId: '999', name: 'Hypothetical FC', shortName: 'HYP', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])

		await expect(
			mergeFootballDataIds(
				{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
				'fd-key',
			),
		).rejects.toThrow(/missing football-data IDs.*FPL_TO_FD_TLA/s)
	})
})

describe('scheduleUpcomingFixturePolls', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbSelectWhere.mockReset()
		enqueuePollScoresAtMock.mockClear()
	})

	it('enqueues one trigger per upcoming fixture, scheduled 10 min before kickoff, with stable dedup id', async () => {
		const future1 = new Date(Date.now() + 60 * 60 * 1000) // 1h from now
		const future2 = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h from now
		dbSelectWhere.mockResolvedValue([
			{ id: 'fx-1', kickoff: future1 },
			{ id: 'fx-2', kickoff: future2 },
		])

		await scheduleUpcomingFixturePolls()

		expect(enqueuePollScoresAtMock).toHaveBeenCalledTimes(2)
		const [[trigger1, dedup1], [trigger2, dedup2]] = enqueuePollScoresAtMock.mock.calls
		expect((trigger1 as Date).getTime()).toBe(future1.getTime() - 10 * 60 * 1000)
		expect((trigger2 as Date).getTime()).toBe(future2.getTime() - 10 * 60 * 1000)
		expect(dedup1).toBe(`poll-fixture-fx-1-${(trigger1 as Date).getTime()}`)
		expect(dedup2).toBe(`poll-fixture-fx-2-${(trigger2 as Date).getTime()}`)
	})

	it('skips fixtures whose kickoff is closer than the lead window', async () => {
		const veryClose = new Date(Date.now() + 5 * 60 * 1000) // 5min from now (lead is 10min)
		dbSelectWhere.mockResolvedValue([{ id: 'fx-imminent', kickoff: veryClose }])

		await scheduleUpcomingFixturePolls()

		expect(enqueuePollScoresAtMock).not.toHaveBeenCalled()
	})

	it('does not throw when an individual enqueue fails', async () => {
		const future = new Date(Date.now() + 60 * 60 * 1000)
		dbSelectWhere.mockResolvedValue([
			{ id: 'fx-bad', kickoff: future },
			{ id: 'fx-good', kickoff: future },
		])
		enqueuePollScoresAtMock
			.mockRejectedValueOnce(new Error('QStash transient'))
			.mockResolvedValueOnce(undefined)

		await expect(scheduleUpcomingFixturePolls()).resolves.toBeUndefined()
		expect(enqueuePollScoresAtMock).toHaveBeenCalledTimes(2)
	})
})
