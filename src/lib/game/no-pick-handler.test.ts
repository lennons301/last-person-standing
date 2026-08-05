import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { processDeadlineLock } from './no-pick-handler'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			round: { findFirst: vi.fn().mockResolvedValue(undefined) },
			game: { findMany: vi.fn().mockResolvedValue([]) },
			pick: { findFirst: vi.fn(), findMany: vi.fn() },
			fixture: { findMany: vi.fn() },
			team: { findMany: vi.fn() },
			payment: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			gamePlayer: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				onConflictDoNothing: vi.fn(() => ({
					returning: vi.fn().mockResolvedValue([{ id: 'new-pick' }]),
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		})),
	},
}))

function makeClassicPlayer(
	overrides: Partial<{ id: string; userId: string; status: string }> = {},
) {
	return {
		id: 'p1',
		userId: 'u1',
		status: 'alive',
		eliminatedRoundId: null,
		eliminatedReason: null,
		livesRemaining: 0,
		...overrides,
	} as never
}

function makeClassicGame(allowRebuys: boolean, players: object[]) {
	return {
		id: 'g1',
		gameMode: 'classic',
		modeConfig: allowRebuys ? { allowRebuys: true } : {},
		status: 'active',
		currentRoundId: 'r1',
		players,
	} as never
}

describe('processDeadlineLock', () => {
	it('no-ops when no games use the round', async () => {
		const result = await processDeadlineLock(['r1'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
	})
})

describe('processDeadlineLock — classic round 1 & 2 (4c3)', () => {
	beforeEach(() => vi.clearAllMocks())

	it('eliminates classic round 1 no-pick player when allowRebuys=true', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r1',
			number: 1,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()]),
		])
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)

		const result = await processDeadlineLock(['r1'])
		expect(result.playersEliminated).toBe(1)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundId: 'r1',
		})
	})

	it('does NOT eliminate classic round 1 no-pick player when allowRebuys=false', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r1',
			number: 1,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()]),
		])
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)

		const result = await processDeadlineLock(['r1'])
		expect(result.playersEliminated).toBe(0)
		expect(db.update).not.toHaveBeenCalled()
	})

	it('eliminates classic round 2 no-pick with missed_rebuy_pick when paymentRowCount > 1', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r2',
			number: 2,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()]),
		])
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.payment.findMany).mockResolvedValue([
			{ id: 'pay1' },
			{ id: 'pay2' },
		] as never)

		const result = await processDeadlineLock(['r2'])
		expect(result.playersEliminated).toBe(1)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'eliminated',
			eliminatedReason: 'missed_rebuy_pick',
			eliminatedRoundId: 'r2',
		})
	})

	it('eliminates classic round 2 no-pick with no_pick_no_fallback when paymentRowCount <= 1', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r2',
			number: 2,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()]),
		])
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.payment.findMany).mockResolvedValue([{ id: 'pay1' }] as never)

		const result = await processDeadlineLock(['r2'])
		expect(result.playersEliminated).toBe(1)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundId: 'r2',
		})
	})
})

describe('processDeadlineLock — classic auto-pick concurrency (#127)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r3',
			number: 3,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()]),
		])
		// No pick yet — both racing invocations get past this read.
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([
			{ id: 'fx1', homeTeamId: 't-home', awayTeamId: 't-away', kickoff: new Date() },
		] as never)
		vi.mocked(db.query.team.findMany).mockResolvedValue([
			{ id: 't-home', leaguePosition: 1 },
			{ id: 't-away', leaguePosition: 20 },
		] as never)
	})

	function mockAutoPickInsert(returned: unknown[]) {
		const returning = vi.fn().mockResolvedValue(returned)
		const onConflictDoNothing = vi.fn(() => ({ returning }))
		const values = vi.fn(() => ({ onConflictDoNothing }))
		vi.mocked(db.insert).mockReturnValue({ values } as never)
		return { values, onConflictDoNothing }
	}

	it('lets the database arbitrate the insert instead of trusting the read', async () => {
		const { values, onConflictDoNothing } = mockAutoPickInsert([{ id: 'pick-1' }])

		const result = await processDeadlineLock(['r3'])

		expect(result.autoPicksInserted).toBe(1)
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ gamePlayerId: 'p1', roundId: 'r3', isAuto: true }),
		)
		expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
	})

	it('does not count an auto-pick a concurrent writer already inserted', async () => {
		// The conflicting insert is a no-op, so nothing comes back from returning().
		mockAutoPickInsert([])

		const result = await processDeadlineLock(['r3'])

		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
		// The loser must not fall through to an elimination either.
		expect(db.update).not.toHaveBeenCalled()
	})
})
