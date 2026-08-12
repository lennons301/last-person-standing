import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
	dbQueryCompetitionFindFirst,
	dbQueryCompetitionFindMany,
	dbQueryTeamFindFirst,
	dbQueryTeamFindMany,
	dbQueryRoundFindFirst,
	dbQueryRoundFindMany,
	dbQueryFixtureFindFirst,
	dbQueryFixtureFindMany,
	dbQueryPlannedPickFindMany,
	dbInsertFn,
	dbUpdateFn,
	dbUpdateSet,
	dbTransactionFn,
	dbSelectFn,
	dbSelectWhere,
	fplFetchTeams,
	fplFetchRounds,
	fplFetchStandings,
	fplFetchGw1Deadline,
	fdFetchTeams,
	fdFetchRounds,
	fdFetchStandings,
	fdFetchCurrentSeason,
	enqueueAutoSubmitMock,
	enqueuePollScoresAtMock,
} = vi.hoisted(() => {
	const updateSet = vi.fn((_payload: Record<string, unknown>) => ({
		where: vi.fn().mockResolvedValue(undefined),
	}))
	const selectWhere = vi.fn().mockResolvedValue([])
	const selectFn = vi.fn(() => ({
		from: () => ({
			innerJoin: () => ({ innerJoin: () => ({ where: selectWhere }) }),
			where: selectWhere,
		}),
	}))
	const insertFn = vi.fn(() => ({
		values: vi.fn(() => ({
			returning: vi.fn().mockResolvedValue([{ id: 'new', externalId: 'WC' }]),
			// The standings funnel upserts a per-matchday snapshot alongside
			// team.leaguePosition (see persistStandings).
			onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
		})),
	}))
	const updateFn = vi.fn(() => ({ set: updateSet }))
	return {
		dbQueryCompetitionFindFirst: vi.fn(),
		dbQueryCompetitionFindMany: vi.fn().mockResolvedValue([]),
		dbQueryTeamFindFirst: vi.fn(),
		dbQueryTeamFindMany: vi.fn().mockResolvedValue([]),
		dbQueryRoundFindFirst: vi.fn(),
		dbQueryRoundFindMany: vi.fn().mockResolvedValue([]),
		dbQueryFixtureFindFirst: vi.fn(),
		dbQueryFixtureFindMany: vi.fn().mockResolvedValue([]),
		dbQueryPlannedPickFindMany: vi.fn().mockResolvedValue([]),
		dbInsertFn: insertFn,
		dbUpdateFn: updateFn,
		dbUpdateSet: updateSet,
		// db.transaction passthrough: the callback gets a tx exposing the same
		// insert/update mocks, so assertions on writes see through transactions.
		dbTransactionFn: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({ insert: insertFn, update: updateFn }),
		),
		dbSelectFn: selectFn,
		dbSelectWhere: selectWhere,
		fplFetchTeams: vi.fn().mockResolvedValue([]),
		fplFetchRounds: vi.fn().mockResolvedValue([]),
		fplFetchStandings: vi.fn().mockResolvedValue([]),
		fplFetchGw1Deadline: vi.fn().mockResolvedValue(null),
		fdFetchTeams: vi.fn().mockResolvedValue([]),
		fdFetchRounds: vi.fn().mockResolvedValue([]),
		fdFetchStandings: vi.fn().mockResolvedValue([]),
		fdFetchCurrentSeason: vi.fn().mockResolvedValue(null),
		enqueueAutoSubmitMock: vi.fn().mockResolvedValue(undefined),
		enqueuePollScoresAtMock: vi.fn().mockResolvedValue(undefined),
	}
})

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: {
				findFirst: dbQueryCompetitionFindFirst,
				findMany: dbQueryCompetitionFindMany,
			},
			team: { findFirst: dbQueryTeamFindFirst, findMany: dbQueryTeamFindMany },
			round: { findFirst: dbQueryRoundFindFirst, findMany: dbQueryRoundFindMany },
			fixture: { findFirst: dbQueryFixtureFindFirst, findMany: dbQueryFixtureFindMany },
			plannedPick: { findMany: dbQueryPlannedPickFindMany },
		},
		insert: dbInsertFn,
		update: dbUpdateFn,
		select: dbSelectFn,
		transaction: dbTransactionFn,
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
			fetchGw1Deadline: fplFetchGw1Deadline,
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
			fetchCurrentSeason: fdFetchCurrentSeason,
		}
	}),
	resolveFootballDataCode: vi.fn(() => 'PL'),
}))

import {
	bootstrapCompetitions,
	deriveSeasonLabel,
	ensureCurrentPlSeasonCompetition,
	mergeFootballDataIds,
	SeasonDetectionError,
	scheduleUpcomingFixturePolls,
	syncCompetition,
} from './bootstrap-competitions'

/** Every insert(...).values(...) payload captured by the db mock. */
function insertedValues(): Record<string, unknown>[] {
	return dbInsertFn.mock.results
		.map((r) => (r.value as { values: ReturnType<typeof vi.fn> }).values.mock.calls[0]?.[0])
		.filter((v): v is Record<string, unknown> => v != null)
}

/**
 * Every standings write (`update(team).set({leaguePosition, ...})`), keyed by
 * the team UUID in its `where` clause — the standings funnel writes one row per
 * team, so which line landed on which club is the thing worth asserting.
 */
function standingsWritesByTeamId(): Record<string, Record<string, unknown>> {
	const writes: Record<string, Record<string, unknown>> = {}
	dbUpdateSet.mock.calls.forEach((call, i) => {
		const payload = call[0]
		if (!('leaguePosition' in payload)) return
		const result = dbUpdateSet.mock.results[i]?.value as { where: ReturnType<typeof vi.fn> }
		const { params } = new PgDialect().sqlToQuery(result.where.mock.calls[0]?.[0] as never)
		writes[String(params[0])] = payload
	})
	return writes
}

describe('deriveSeasonLabel', () => {
	it('derives the season label from football-data currentSeason, cross-checked against the FPL GW1 year', () => {
		expect(
			deriveSeasonLabel(
				{ startDate: '2026-08-14', endDate: '2027-05-23' },
				new Date('2026-08-21T17:30:00Z'),
			),
		).toBe('2026/27')
	})

	it('throws when football-data reports no currentSeason — never guesses', () => {
		expect(() => deriveSeasonLabel(null, new Date('2026-08-21T17:30:00Z'))).toThrow(
			SeasonDetectionError,
		)
		expect(() => deriveSeasonLabel(null, new Date('2026-08-21T17:30:00Z'))).toThrow(/currentSeason/)
	})

	it('throws when the FPL Gameweek 1 deadline is missing', () => {
		expect(() =>
			deriveSeasonLabel({ startDate: '2026-08-14', endDate: '2027-05-23' }, null),
		).toThrow(SeasonDetectionError)
		expect(() =>
			deriveSeasonLabel({ startDate: '2026-08-14', endDate: '2027-05-23' }, null),
		).toThrow(/Gameweek 1/)
	})

	it('throws on a season disagreement between the sources, naming both values', () => {
		// football-data has flipped to 2026/27 but FPL still serves the 2025/26
		// GW1 — a weird API state; abort rather than pick a side.
		const call = () =>
			deriveSeasonLabel(
				{ startDate: '2026-08-14', endDate: '2027-05-23' },
				new Date('2025-08-15T17:30:00Z'),
			)
		expect(call).toThrow(SeasonDetectionError)
		expect(call).toThrow(/2026/)
		expect(call).toThrow(/2025/)
	})

	it('throws when the currentSeason dates are not a cross-year league season', () => {
		// A single-year or multi-year span is not a PL season shape — abort.
		expect(() =>
			deriveSeasonLabel(
				{ startDate: '2026-08-14', endDate: '2026-12-19' },
				new Date('2026-08-21T17:30:00Z'),
			),
		).toThrow(SeasonDetectionError)
	})

	it('throws when the currentSeason dates are unparseable', () => {
		expect(() =>
			deriveSeasonLabel(
				{ startDate: 'not-a-date', endDate: '2027-05-23' },
				new Date('2026-08-21T17:30:00Z'),
			),
		).toThrow(SeasonDetectionError)
	})
})

describe('ensureCurrentPlSeasonCompetition', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryCompetitionFindMany.mockResolvedValue([])
	})

	function mockDetectedSeason(startYear: number) {
		fdFetchCurrentSeason.mockResolvedValue({
			startDate: `${startYear}-08-14`,
			endDate: `${startYear + 1}-05-23`,
		})
		fplFetchGw1Deadline.mockResolvedValue(new Date(`${startYear}-08-21T17:30:00Z`))
	}

	it('creates the competition with the DERIVED name and season when no PL competition exists', async () => {
		// A deliberately non-current year: proves the values come from the
		// payload derivation, not from any literal left in the module.
		mockDetectedSeason(2031)
		dbQueryCompetitionFindFirst.mockResolvedValue(undefined)

		await ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' })

		expect(insertedValues()).toEqual([
			expect.objectContaining({
				name: 'Premier League 2031/32',
				type: 'league',
				dataSource: 'fpl',
				season: '2031/32',
				status: 'active',
			}),
		])
	})

	it('returns the existing competition for the detected season without any writes', async () => {
		mockDetectedSeason(2026)
		const current = {
			id: 'comp-current',
			name: 'Premier League 2026/27',
			dataSource: 'fpl',
			season: '2026/27',
			status: 'active',
		}
		dbQueryCompetitionFindFirst.mockResolvedValue(current)
		dbQueryCompetitionFindMany.mockResolvedValue([current])

		const comp = await ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' })

		expect(comp).toBe(current)
		expect(dbInsertFn).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
	})

	it('rolls over: creates the new-season competition and archives the predecessor, loudly', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		mockDetectedSeason(2026)
		const predecessor = {
			id: 'comp-old',
			name: 'Premier League 2025/26',
			dataSource: 'fpl',
			season: '2025/26',
			status: 'active',
		}
		// No competition exists yet for the detected season…
		dbQueryCompetitionFindFirst.mockResolvedValue(undefined)
		// …and the active PL competition is last season's.
		dbQueryCompetitionFindMany.mockResolvedValue([predecessor])

		await ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' })

		expect(insertedValues()).toEqual([
			expect.objectContaining({ name: 'Premier League 2026/27', season: '2026/27' }),
		])
		const archiveSets = dbUpdateSet.mock.calls.map((c) => c[0]).filter((p) => 'status' in p)
		expect(archiveSets).toEqual([expect.objectContaining({ status: 'archived' })])
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('season rollover'))
		warn.mockRestore()
	})

	it('aborts with zero writes on a season disagreement between the sources', async () => {
		fdFetchCurrentSeason.mockResolvedValue({ startDate: '2026-08-14', endDate: '2027-05-23' })
		fplFetchGw1Deadline.mockResolvedValue(new Date('2025-08-15T17:30:00Z'))

		await expect(
			ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' }),
		).rejects.toThrow(SeasonDetectionError)
		expect(dbInsertFn).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
	})

	it('aborts with zero writes when football-data reports no currentSeason', async () => {
		fdFetchCurrentSeason.mockResolvedValue(null)
		fplFetchGw1Deadline.mockResolvedValue(new Date('2026-08-21T17:30:00Z'))

		await expect(
			ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' }),
		).rejects.toThrow(SeasonDetectionError)
		expect(dbInsertFn).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
	})

	it('aborts when the football-data API key is missing — detection cannot run', async () => {
		await expect(ensureCurrentPlSeasonCompetition({})).rejects.toThrow(/FOOTBALL_DATA_API_KEY/)
		expect(dbInsertFn).not.toHaveBeenCalled()
	})

	it('refuses to resurrect an archived competition for the detected season', async () => {
		// The detected season's competition exists but an operator archived it —
		// an unexpected state; abort rather than sync into (or duplicate) it.
		mockDetectedSeason(2026)
		dbQueryCompetitionFindFirst.mockResolvedValue({
			id: 'comp-current',
			name: 'Premier League 2026/27',
			dataSource: 'fpl',
			season: '2026/27',
			status: 'archived',
		})

		await expect(
			ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'fd-key' }),
		).rejects.toThrow(/archived/)
		expect(dbInsertFn).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
	})
})

describe('bootstrapCompetitions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
		dbQueryCompetitionFindMany.mockResolvedValue([])
		// Season sources agree on 2026/27 unless a test overrides them.
		fdFetchCurrentSeason.mockResolvedValue({ startDate: '2026-08-14', endDate: '2027-05-23' })
		fplFetchGw1Deadline.mockResolvedValue(new Date('2026-08-21T17:30:00Z'))
	})

	it('creates PL and WC competitions when they do not exist', async () => {
		dbQueryCompetitionFindFirst.mockResolvedValue(undefined)
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		expect(dbInsertFn).toHaveBeenCalled()
	})

	it('creates the PL competition from the derived season, not a hardcoded literal', async () => {
		dbQueryCompetitionFindFirst.mockResolvedValue(undefined)
		fdFetchCurrentSeason.mockResolvedValue({ startDate: '2027-08-13', endDate: '2028-05-21' })
		fplFetchGw1Deadline.mockResolvedValue(new Date('2027-08-20T17:30:00Z'))

		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })

		const plInsert = insertedValues().find((v) => v.dataSource === 'fpl')
		expect(plInsert).toEqual(
			expect.objectContaining({ name: 'Premier League 2027/28', season: '2027/28' }),
		)
	})

	it('is idempotent when competitions already exist', async () => {
		dbQueryCompetitionFindFirst.mockResolvedValue({
			id: 'existing',
			dataSource: 'fpl',
			externalId: null,
			season: '2026/27',
			status: 'active',
		})
		dbQueryCompetitionFindMany.mockResolvedValue([
			{ id: 'existing', dataSource: 'fpl', season: '2026/27', status: 'active' },
		])
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		// No assertion that insert was NOT called — adapters may still insert teams/rounds.
		// This test just ensures the function runs without error when comps already exist.
	})
})

/**
 * A competition with a game already played — the state in which the source's
 * table is the real one. Mounted on `db.query.round.findMany`, which is how the
 * standings funnel reads this competition's own fixtures.
 */
function seasonUnderway() {
	dbQueryRoundFindMany.mockResolvedValue([
		{ id: 'r-1', number: 1, fixtures: [{ id: 'fx-1', status: 'finished', externalIds: {} }] },
	])
}

describe('syncCompetition league-position persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([])
	})

	it('persists league_position for each standings row resolved through the current payload', async () => {
		seasonUnderway()
		fplFetchTeams.mockResolvedValue([
			{ externalId: '1', name: 'Alder FC', shortName: 'ALD', badgeUrl: 'ald.svg' },
			{ externalId: '2', name: 'Birch FC', shortName: 'BIR', badgeUrl: 'bir.svg' },
		])
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
				goalsFor: 20,
				goalsAgainst: 10,
			},
			{
				teamExternalId: '2',
				position: 4,
				played: 10,
				won: 6,
				drawn: 2,
				lost: 2,
				points: 20,
				goalsFor: 20,
				goalsAgainst: 10,
			},
		])
		// Payload teams resolve to existing club rows by name.
		dbQueryTeamFindFirst
			.mockResolvedValueOnce({ id: 'team-1-uuid', name: 'Alder FC', externalIds: { fpl: '1' } })
			.mockResolvedValueOnce({ id: 'team-2-uuid', name: 'Birch FC', externalIds: { fpl: '2' } })

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		// Two standings rows → two updates with leaguePosition, each carrying the
		// rest of that team's line: the Table view shows position, played, points
		// and goals as one row, so they have to be written from one sync pass.
		const positionSets = dbUpdateSet.mock.calls
			.map((call) => call[0])
			.filter((payload) => 'leaguePosition' in payload)
		expect(positionSets).toHaveLength(2)
		expect(positionSets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leaguePosition: 1,
					played: 10,
					points: 25,
					goalsFor: 20,
					goalsAgainst: 10,
				}),
				expect.objectContaining({ leaguePosition: 4, played: 10, points: 20 }),
			]),
		)
	})

	it('persists an opening table — not the source table — while the competition has no finished fixture', async () => {
		// football-data serves the *previous* season's final table under the new
		// season's filter right up until the new one kicks off. Our own fixtures
		// are the arbiter: nothing finished, so nothing has been played, so the
		// table is the opening one — every club at zero, ordered by the league's
		// tiebreak chain (points, goal difference, goals scored, name), which at
		// all-zero resolves to alphabetical. Cedar FC is promoted: absent from
		// the source table entirely, positioned here from its first day.
		fplFetchTeams.mockResolvedValue([
			{ externalId: '1', name: 'Birch FC', shortName: 'BIR', badgeUrl: null },
			{ externalId: '2', name: 'Alder FC', shortName: 'ALD', badgeUrl: null },
			{ externalId: '3', name: 'Cedar FC', shortName: 'CED', badgeUrl: null },
		])
		fplFetchRounds.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([
			{
				teamExternalId: '1',
				position: 1,
				played: 38,
				won: 28,
				drawn: 5,
				lost: 5,
				points: 89,
				goalsFor: 90,
				goalsAgainst: 30,
			},
			{
				teamExternalId: '2',
				position: 17,
				played: 38,
				won: 9,
				drawn: 8,
				lost: 21,
				points: 35,
				goalsFor: 30,
				goalsAgainst: 70,
			},
		])
		dbQueryTeamFindFirst
			.mockResolvedValueOnce({ id: 'team-birch', name: 'Birch FC', externalIds: {} })
			.mockResolvedValueOnce({ id: 'team-alder', name: 'Alder FC', externalIds: {} })
			.mockResolvedValueOnce({ id: 'team-cedar', name: 'Cedar FC', externalIds: {} })

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2026/27' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(standingsWritesByTeamId()).toEqual({
			'team-alder': { leaguePosition: 1, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
			'team-birch': { leaguePosition: 2, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
			'team-cedar': { leaguePosition: 3, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
		})
	})

	it('records a per-matchday standings snapshot from the same standings read', async () => {
		// The snapshot rides the position write rather than a cron of its own —
		// one provider read, one place that knows the table moved.
		seasonUnderway()
		fplFetchTeams.mockResolvedValue([
			{ externalId: '1', name: 'Alder FC', shortName: 'ALD', badgeUrl: 'ald.svg' },
		])
		fplFetchRounds.mockResolvedValue([])
		fplFetchStandings.mockResolvedValue([
			{ teamExternalId: '1', position: 3, played: 12, won: 7, drawn: 2, lost: 3, points: 23 },
		])
		dbQueryTeamFindFirst.mockResolvedValueOnce({
			id: 'team-1-uuid',
			name: 'Alder FC',
			externalIds: { fpl: '1' },
		})

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2025/26' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(insertedValues().filter((row) => 'matchday' in row)).toEqual([
			expect.objectContaining({
				competitionId: 'comp-1',
				teamId: 'team-1-uuid',
				matchday: 12,
				position: 3,
				points: 23,
			}),
		])
	})

	it('ignores standings rows whose team is absent from the current payload, even when a stale team row holds that id', async () => {
		// The payload has no team '999' — but a dormant (relegated) team row
		// still carries fpl:999 from an earlier season. Resolution must go
		// through the payload, so the stale row must NOT receive a position.
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
				goalsFor: 20,
				goalsAgainst: 10,
			},
		])
		dbQueryTeamFindMany.mockResolvedValue([{ id: 'team-stale-uuid', externalIds: { fpl: '999' } }])

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

describe('syncCompetition team upsert (payload-driven identity)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
	})

	it('inserts an unseen (promoted) club without the FPL badge URL — the FPL CDN 404s for it', async () => {
		fplFetchTeams.mockResolvedValue([
			{
				externalId: '4',
				name: 'Grove FC',
				shortName: 'GRO',
				badgeUrl: 'https://resources.premierleague.com/premierleague/badges/rb/t24.svg',
			},
		])
		fplFetchRounds.mockResolvedValue([])
		dbQueryTeamFindFirst.mockResolvedValue(undefined) // never seen this club

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2026/27' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		const insertedValues = dbInsertFn.mock.results
			.map((r) => (r.value as { values: ReturnType<typeof vi.fn> }).values.mock.calls[0]?.[0])
			.filter((v): v is Record<string, unknown> => v != null && 'name' in (v as object))
		expect(insertedValues).toEqual([
			expect.objectContaining({ name: 'Grove FC', shortName: 'GRO', badgeUrl: null }),
		])
	})

	it('never overwrites an existing badge with the FPL CDN URL on re-sync', async () => {
		// After mergeFootballDataIds lands the football-data crest, a later
		// daily sync must not stomp it with the constructed FPL badge URL —
		// that URL 404s for promoted clubs, and the merge that would re-fix it
		// is exactly the step that fails loudly on a new-season tla gap.
		fplFetchTeams.mockResolvedValue([
			{
				externalId: '4',
				name: 'Grove FC',
				shortName: 'GRO',
				badgeUrl: 'https://resources.premierleague.com/premierleague/badges/rb/t24.svg',
			},
		])
		fplFetchRounds.mockResolvedValue([])
		dbQueryTeamFindFirst.mockResolvedValue({
			id: 'team-grove-uuid',
			name: 'Grove FC',
			badgeUrl: 'https://crests.football-data.org/grove.png',
			externalIds: { fpl: '4', football_data: '107' },
		})

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2026/27' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		const teamUpdate = dbUpdateSet.mock.calls
			.map((c) => c[0] as { badgeUrl?: string | null })
			.find((p) => 'badgeUrl' in p)
		expect(teamUpdate?.badgeUrl).toBe('https://crests.football-data.org/grove.png')
	})

	it('re-links an existing club to its new payload id by name, not by stored external id', async () => {
		// Grove FC existed before under fpl:9; this season the payload hands it
		// id 4. The row must be found by NAME and its fpl id overwritten.
		fplFetchTeams.mockResolvedValue([
			{ externalId: '4', name: 'Grove FC', shortName: 'GRO', badgeUrl: 'gro.svg' },
		])
		fplFetchRounds.mockResolvedValue([])
		dbQueryTeamFindFirst.mockResolvedValue({
			id: 'team-grove-uuid',
			name: 'Grove FC',
			badgeUrl: 'gro.svg',
			externalIds: { fpl: '9', football_data: '107' },
		})

		await syncCompetition(
			{ id: 'comp-1', dataSource: 'fpl', externalId: null, season: '2026/27' } as never,
			{ footballDataApiKey: 'fd-key' },
		)

		const teamUpdate = dbUpdateSet.mock.calls
			.map((c) => c[0] as { externalIds?: Record<string, string> })
			.find((p) => p.externalIds?.fpl != null)
		expect(teamUpdate?.externalIds).toEqual({ fpl: '4', football_data: '107' })
	})
})

// NOTE: auto-submit enqueueing previously fired from bootstrap when a round
// transitioned from 'upcoming' → 'open' inside the 48h window. That window
// has been removed (it was a regression from the predecessor app — round
// status now follows game lifecycle, not wall-clock time). Auto-submit is
// scheduled at game-creation / round-advance / plan-creation via
// scheduleAutoSubmitForPlan / openRoundForGame in round-lifecycle.ts.

describe('syncCompetition deadline-lock trigger (deadlinePassedRoundIds)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		dbQueryPlannedPickFindMany.mockResolvedValue([])
	})

	it('does NOT include the round in deadlinePassedRoundIds on upcoming → open transitions (deadline still in future)', async () => {
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

		expect(result.deadlinePassedRoundIds).toEqual([])
	})

	it('DOES include the round in deadlinePassedRoundIds when the deadline has actually passed', async () => {
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

		expect(result.deadlinePassedRoundIds).toEqual(['round-1'])
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
		expect(result.deadlinePassedRoundIds).toEqual([])
	})
})

describe('mergeFootballDataIds', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
		dbQueryRoundFindMany.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([])
	})

	it('persists league_position for standings rows resolved through the merged football-data ids', async () => {
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
		dbQueryTeamFindMany.mockResolvedValueOnce([teamArs, teamLiv]).mockResolvedValueOnce([
			{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
			{ ...teamLiv, externalIds: { fpl: '12', football_data: '64' } },
		])
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-ARS',
						awayTeamId: 'our-LIV',
						// Played: the season is underway, so the source's table is the
						// real one (see the pre-season case below).
						status: 'finished',
						externalIds: { fpl: '347' },
					},
				],
			},
		])
		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
			{ externalId: '64', name: 'Liverpool FC', shortName: 'LIV', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([
			{
				teamExternalId: '64',
				position: 1,
				played: 10,
				won: 9,
				drawn: 1,
				lost: 0,
				points: 28,
				goalsFor: 20,
				goalsAgainst: 10,
			},
			{
				teamExternalId: '57',
				position: 2,
				played: 10,
				won: 8,
				drawn: 1,
				lost: 1,
				points: 25,
				goalsFor: 20,
				goalsAgainst: 10,
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		const positionSets = dbUpdateSet.mock.calls
			.map((c) => c[0])
			.filter((payload) => 'leaguePosition' in payload)
		expect(positionSets).toHaveLength(2)
		expect(positionSets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ leaguePosition: 1 }),
				expect.objectContaining({ leaguePosition: 2 }),
			]),
		)
	})

	it('positions a promoted club from its first day, before the new season has kicked off', async () => {
		// The PL route: FPL has no standings, so this merge is what positions
		// every club. Pre-season, football-data's PL table is still last
		// season's final one — Sunderland, promoted, is not in it at all, and
		// the champions sit on 38 played. Neither survives into what we write:
		// the opening table positions all three clubs, ours by our own names.
		const teamArs = { id: 'our-ARS', shortName: 'ARS', name: 'Arsenal', externalIds: { fpl: '1' } }
		const teamLiv = {
			id: 'our-LIV',
			shortName: 'LIV',
			name: 'Liverpool',
			externalIds: { fpl: '12' },
		}
		const teamSun = {
			id: 'our-SUN',
			shortName: 'SUN',
			name: 'Sunderland',
			externalIds: { fpl: '18' },
		}
		const merged = [
			{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
			{ ...teamLiv, externalIds: { fpl: '12', football_data: '64' } },
			{ ...teamSun, externalIds: { fpl: '18', football_data: '71' } },
		]
		dbQueryTeamFindMany.mockResolvedValue(merged).mockResolvedValueOnce([teamArs, teamLiv, teamSun])
		// Fixtures published, none played. Every club appears in one — the
		// competition's fixtures are what define its team set.
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-SUN',
						awayTeamId: 'our-ARS',
						status: 'scheduled',
						externalIds: { fpl: '1' },
					},
					{
						id: 'our-fx-2',
						homeTeamId: 'our-LIV',
						awayTeamId: 'our-ARS',
						status: 'scheduled',
						externalIds: { fpl: '2' },
					},
				],
			},
		])
		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
			{ externalId: '64', name: 'Liverpool FC', shortName: 'LIV', badgeUrl: null },
			{ externalId: '71', name: 'Sunderland AFC', shortName: 'SUN', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([
			{
				teamExternalId: '64',
				position: 1,
				played: 38,
				won: 30,
				drawn: 5,
				lost: 3,
				points: 95,
				goalsFor: 92,
				goalsAgainst: 30,
			},
			{
				teamExternalId: '57',
				position: 2,
				played: 38,
				won: 28,
				drawn: 6,
				lost: 4,
				points: 90,
				goalsFor: 88,
				goalsAgainst: 32,
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		expect(standingsWritesByTeamId()).toEqual({
			'our-ARS': { leaguePosition: 1, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
			'our-LIV': { leaguePosition: 2, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
			'our-SUN': { leaguePosition: 3, played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 },
		})
	})

	it('writes the source table verbatim once the season is underway, points deduction intact', async () => {
		// A deducted club's points don't follow from its results — 8 wins and 2
		// draws is 26, the table says 22. The source owns that correction; a
		// synced table that re-derived the arithmetic would quietly hand the
		// points back.
		const teamArs = { id: 'our-ARS', shortName: 'ARS', name: 'Arsenal', externalIds: { fpl: '1' } }
		dbQueryTeamFindMany
			.mockResolvedValueOnce([teamArs])
			.mockResolvedValueOnce([{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } }])
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-ARS',
						awayTeamId: 'our-ARS',
						status: 'finished',
						externalIds: { fpl: '1' },
					},
				],
			},
		])
		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([
			{
				teamExternalId: '57',
				position: 9,
				played: 12,
				won: 8,
				drawn: 2,
				lost: 2,
				points: 22,
				goalsFor: 24,
				goalsAgainst: 14,
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		expect(standingsWritesByTeamId()).toEqual({
			'our-ARS': { leaguePosition: 9, played: 12, points: 22, goalsFor: 24, goalsAgainst: 14 },
		})
	})

	it('ignores standings rows whose team was not merged onto one of this competition teams', async () => {
		// The standings table carries a club (fd id 999) that never merged onto
		// one of this competition's team rows — its position must not be written
		// anywhere (same competition-scoped identity rule as the id merge).
		const teamArs = {
			id: 'our-ARS',
			shortName: 'ARS',
			name: 'Arsenal',
			externalIds: { fpl: '1' },
		}
		dbQueryTeamFindMany
			.mockResolvedValueOnce([teamArs])
			.mockResolvedValueOnce([{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } }])
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-ARS',
						awayTeamId: 'our-ARS',
						status: 'finished',
						externalIds: { fpl: '1' },
					},
				],
			},
		])
		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])
		fdFetchStandings.mockResolvedValue([
			{
				teamExternalId: '57',
				position: 4,
				played: 10,
				won: 6,
				drawn: 2,
				lost: 2,
				points: 20,
				goalsFor: 20,
				goalsAgainst: 10,
			},
			{
				teamExternalId: '999',
				position: 20,
				played: 10,
				won: 0,
				drawn: 1,
				lost: 9,
				points: 1,
				goalsFor: 20,
				goalsAgainst: 10,
			},
		])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		const positionSets = dbUpdateSet.mock.calls
			.map((c) => c[0])
			.filter((payload) => 'leaguePosition' in payload)
		expect(positionSets).toEqual([expect.objectContaining({ leaguePosition: 4 })])
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

	it('never touches a team row outside this competition, even on a tla collision', async () => {
		// A WC country row shares the 3-letter code of a club in the fd payload.
		// It is not referenced by any of this competition's fixtures, so the
		// merge must not rewrite its badge or football-data id.
		const teamArs = {
			id: 'our-ARS',
			shortName: 'ARS',
			name: 'Arsenal',
			externalIds: { fpl: '1' },
		}
		const teamPortugalWc = {
			id: 'our-POR-wc',
			shortName: 'POR',
			name: 'Portugal',
			externalIds: { football_data: '765' },
			badgeUrl: 'wc-portugal.png',
		}
		dbQueryTeamFindMany
			.mockResolvedValueOnce([teamArs, teamPortugalWc])
			.mockResolvedValueOnce([
				{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
				teamPortugalWc,
			])
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-ARS',
						awayTeamId: 'our-ARS',
						externalIds: { fpl: '1' },
					},
				],
			},
		])

		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: 'fd-ars.png' },
			// Hypothetical promoted club whose tla collides with the WC row.
			{ externalId: '9999', name: 'Portsmouth FC', shortName: 'POR', badgeUrl: 'fd-pompey.png' },
		])
		fdFetchRounds.mockResolvedValue([])

		await mergeFootballDataIds(
			{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
			'fd-key',
		)

		const portsmouthWrite = dbUpdateSet.mock.calls.find(
			(c) =>
				(c[0] as { externalIds?: { football_data?: string } }).externalIds?.football_data ===
				'9999',
		)
		expect(portsmouthWrite).toBeUndefined()
	})

	it('coverage assertion ignores dormant teams not referenced by this competition', async () => {
		// A relegated club's dormant row still carries an fpl id from an earlier
		// season but no football-data id. It plays no part in this competition,
		// so it must not trip the loud team-coverage failure.
		const teamArs = {
			id: 'our-ARS',
			shortName: 'ARS',
			name: 'Arsenal',
			externalIds: { fpl: '1' },
		}
		const dormantRelegated = {
			id: 'our-DOR',
			shortName: 'DOR',
			name: 'Dormant FC',
			externalIds: { fpl: '888' },
		}
		dbQueryTeamFindMany
			.mockResolvedValueOnce([teamArs, dormantRelegated])
			.mockResolvedValueOnce([
				{ ...teamArs, externalIds: { fpl: '1', football_data: '57' } },
				dormantRelegated,
			])
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-ARS',
						awayTeamId: 'our-ARS',
						externalIds: { fpl: '1' },
					},
				],
			},
		])

		fdFetchTeams.mockResolvedValue([
			{ externalId: '57', name: 'Arsenal FC', shortName: 'ARS', badgeUrl: null },
		])
		fdFetchRounds.mockResolvedValue([])

		await expect(
			mergeFootballDataIds(
				{ id: 'comp-pl', dataSource: 'fpl', externalId: null } as never,
				'fd-key',
			),
		).resolves.toBeUndefined()
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
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-NFO',
						awayTeamId: 'our-NFO',
						externalIds: { fpl: '16' },
					},
				],
			},
		])

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
		// The team is in this competition (a fixture references it) — that is
		// what makes the coverage gap a loud failure rather than dormant noise.
		dbQueryRoundFindMany.mockResolvedValue([
			{
				id: 'our-r-1',
				number: 1,
				fixtures: [
					{
						id: 'our-fx-1',
						homeTeamId: 'our-XYZ',
						awayTeamId: 'our-XYZ',
						externalIds: { fpl: '900' },
					},
				],
			},
		])

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
		).rejects.toThrow(/missing football-data IDs[\s\S]*FPL_TO_FD_TLA/)
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

	it('restricts the fixture query to active competitions so archived ones never get polls', async () => {
		dbSelectWhere.mockResolvedValue([])

		await scheduleUpcomingFixturePolls()

		const condition = dbSelectWhere.mock.calls[0][0]
		const { sql: rendered, params } = new PgDialect().sqlToQuery(condition as never)
		expect(rendered).toContain('"competition"."status"')
		expect(params).toContain('active')
	})
})

describe('archived competition immutability', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('syncCompetition is a no-op for an archived competition (nothing fetched or written)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const summary = await syncCompetition(
			{
				id: 'comp-old',
				name: 'Premier League 2025/26',
				dataSource: 'fpl',
				externalId: null,
				status: 'archived',
			} as never,
			{ footballDataApiKey: 'fd-key' },
		)

		expect(summary).toEqual({
			rounds: 0,
			fixtures: 0,
			deadlinePassedRoundIds: [],
			settledFixtureIds: [],
		})
		expect(fplFetchTeams).not.toHaveBeenCalled()
		expect(fdFetchTeams).not.toHaveBeenCalled()
		expect(dbInsertFn).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('archived'))
		warn.mockRestore()
	})

	it('mergeFootballDataIds is a no-op for an archived competition', async () => {
		await mergeFootballDataIds(
			{ id: 'comp-old', dataSource: 'fpl', externalId: null, status: 'archived' } as never,
			'fd-key',
		)

		expect(fdFetchTeams).not.toHaveBeenCalled()
		expect(fdFetchRounds).not.toHaveBeenCalled()
		expect(fdFetchStandings).not.toHaveBeenCalled()
		expect(dbUpdateFn).not.toHaveBeenCalled()
	})
})
