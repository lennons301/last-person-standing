import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: vi.fn() },
			gamePlayer: { findFirst: vi.fn() },
			round: { findFirst: vi.fn() },
			pick: { findMany: vi.fn() },
		},
		insert: vi.fn(),
		delete: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(async (cb) => {
			// Create a transaction proxy that mirrors db methods
			const txMock = {
				insert: vi.fn(),
				delete: vi.fn(),
				update: vi.fn(),
			}
			// Set up the tx to use the same mocks as the outer db
			vi.mocked(txMock.insert).mockImplementation(vi.mocked(db.insert) as never)
			vi.mocked(txMock.delete).mockImplementation(vi.mocked(db.delete) as never)
			vi.mocked(txMock.update).mockImplementation(vi.mocked(db.update) as never)
			return cb(txMock as never)
		}),
	},
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { POST } from './route'

function makeReq(body: unknown) {
	return new Request('http://localhost/api/picks/g1/r1', {
		method: 'POST',
		body: JSON.stringify(body),
	})
}

const params = { params: Promise.resolve({ gameId: 'g1', roundId: 'r1' }) }

// --- Shared stubs --------------------------------------------------------

const OPEN_ROUND_FAR_FUTURE = {
	id: 'r1',
	number: 5,
	status: 'open' as const,
	deadline: new Date('2099-01-01T00:00:00Z'),
	fixtures: [
		{
			id: 'fx1',
			roundId: 'r1',
			homeTeamId: 't-home',
			awayTeamId: 't-away',
			homeScore: null,
			awayScore: null,
			status: 'scheduled',
			homeTeam: { id: 't-home', leaguePosition: 1 },
			awayTeam: { id: 't-away', leaguePosition: 2 },
		},
	],
}

const CLASSIC_GAME_ADMIN = {
	id: 'g1',
	createdBy: 'u-admin',
	gameMode: 'classic' as const,
	modeConfig: {},
	competitionId: 'c1',
	competition: { id: 'c1', type: 'league' },
	// Pick validation now gates on `game.currentRoundId === roundId` (see
	// src/lib/picks/validate.ts). The test posts picks for round id 'r1', so
	// the game's currentRoundId must point at 'r1' for the pick to be accepted.
	currentRoundId: 'r1',
}

function mockDeleteChain() {
	const chain = { where: vi.fn().mockResolvedValue(undefined) }
	vi.mocked(db.delete).mockReturnValue(chain as never)
	return chain
}

function mockUpdateChain() {
	const setChain = { where: vi.fn().mockResolvedValue(undefined) }
	const chain = { set: vi.fn().mockReturnValue(setChain) }
	vi.mocked(db.update).mockReturnValue(chain as never)
	return { chain, setChain }
}

function mockInsertReturning(returned: unknown[]) {
	const insertChain = {
		values: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue(returned),
		}),
	}
	vi.mocked(db.insert).mockReturnValue(insertChain as never)
	return insertChain
}

// --- Tests ---------------------------------------------------------------

describe('POST /api/picks/[gameId]/[roundId] — actingAs + un-elimination', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-admin' } } as never)
	})

	it('rejects actingAs from non-admin with 403', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({
			...CLASSIC_GAME_ADMIN,
			createdBy: 'u-other', // session user is NOT the admin
		} as never)
		// Session user has their own gamePlayer, but the actingAs check runs first.
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValueOnce({
			id: 'gp-self',
			userId: 'u-admin',
			status: 'alive',
		} as never)

		const res = await POST(makeReq({ teamId: 't-home', actingAs: 'gp-target' }), params)
		expect(res.status).toBe(403)
		const body = await res.json()
		expect(body.error).toBe('forbidden')
	})

	it('rejects actingAs referencing a player not in this game with 404', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(CLASSIC_GAME_ADMIN as never)
		vi.mocked(db.query.gamePlayer.findFirst)
			// First call: session user's own gamePlayer
			.mockResolvedValueOnce({ id: 'gp-self', userId: 'u-admin', status: 'alive' } as never)
			// Second call: actingAs lookup returns undefined
			.mockResolvedValueOnce(undefined as never)

		const res = await POST(makeReq({ teamId: 't-home', actingAs: 'gp-target' }), params)
		expect(res.status).toBe(404)
		const body = await res.json()
		expect(body.error).toBe('actingAs-not-in-game')
	})

	it('un-eliminates target when reason is missed_rebuy_pick and sets unEliminated=true', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(CLASSIC_GAME_ADMIN as never)
		vi.mocked(db.query.gamePlayer.findFirst)
			.mockResolvedValueOnce({ id: 'gp-self', userId: 'u-admin', status: 'alive' } as never)
			.mockResolvedValueOnce({
				id: 'gp-target',
				userId: 'u-target',
				gameId: 'g1',
				// Real post-deadline-lock state: player was eliminated for missing
				// the rebuy deadline. Admin acting-as with allowEliminatedRebuy
				// bypasses the "not alive" validator gate so maybeUnEliminate can run.
				status: 'eliminated',
				eliminatedReason: 'missed_rebuy_pick',
				eliminatedRoundId: 'r-prev',
			} as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue(OPEN_ROUND_FAR_FUTURE as never)
		vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
		mockDeleteChain()
		mockInsertReturning([{ id: 'p-new', teamId: 't-home' }])
		const { chain, setChain } = mockUpdateChain()

		const res = await POST(makeReq({ teamId: 't-home', actingAs: 'gp-target' }), params)
		expect(res.status).toBe(201)
		const body = await res.json()
		expect(body.unEliminated).toBe(true)
		expect(body.id).toBe('p-new')
		// Verify we wrote the un-elimination update
		expect(chain.set).toHaveBeenCalledWith({
			status: 'alive',
			eliminatedReason: null,
			eliminatedRoundId: null,
		})
		expect(setChain.where).toHaveBeenCalled()
	})

	it('does not un-eliminate when reason is not missed_rebuy_pick (unEliminated=false)', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue(CLASSIC_GAME_ADMIN as never)
		vi.mocked(db.query.gamePlayer.findFirst)
			.mockResolvedValueOnce({ id: 'gp-self', userId: 'u-admin', status: 'alive' } as never)
			.mockResolvedValueOnce({
				id: 'gp-target',
				userId: 'u-target',
				gameId: 'g1',
				status: 'alive',
				eliminatedReason: 'loss',
			} as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue(OPEN_ROUND_FAR_FUTURE as never)
		vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
		mockDeleteChain()
		mockInsertReturning([{ id: 'p-new', teamId: 't-home' }])

		const res = await POST(makeReq({ teamId: 't-home', actingAs: 'gp-target' }), params)
		expect(res.status).toBe(201)
		const body = await res.json()
		expect(body.unEliminated).toBe(false)
		expect(body.id).toBe('p-new')
		// No un-elimination update should have been invoked
		expect(db.update).not.toHaveBeenCalled()
	})
})
