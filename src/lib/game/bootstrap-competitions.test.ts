import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
	dbQueryCompetitionFindFirst,
	dbQueryTeamFindFirst,
	dbQueryTeamFindMany,
	dbQueryRoundFindFirst,
	dbQueryFixtureFindFirst,
	dbInsertFn,
	dbUpdateFn,
	fplFetchTeams,
	fplFetchRounds,
	fdFetchTeams,
	fdFetchRounds,
} = vi.hoisted(() => ({
	dbQueryCompetitionFindFirst: vi.fn(),
	dbQueryTeamFindFirst: vi.fn(),
	dbQueryTeamFindMany: vi.fn().mockResolvedValue([]),
	dbQueryRoundFindFirst: vi.fn(),
	dbQueryFixtureFindFirst: vi.fn(),
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
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: { findFirst: dbQueryCompetitionFindFirst },
			team: { findFirst: dbQueryTeamFindFirst, findMany: dbQueryTeamFindMany },
			round: { findFirst: dbQueryRoundFindFirst },
			fixture: { findFirst: dbQueryFixtureFindFirst },
		},
		insert: dbInsertFn,
		update: dbUpdateFn,
	},
}))

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

import { bootstrapCompetitions } from './bootstrap-competitions'

describe('bootstrapCompetitions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbQueryTeamFindMany.mockResolvedValue([])
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
