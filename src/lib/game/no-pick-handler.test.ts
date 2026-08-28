import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { processDeadlineLock } from './no-pick-handler'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			round: { findFirst: vi.fn().mockResolvedValue(undefined), findMany: vi.fn() },
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

/**
 * The competition's whole round sequence — what the lock reads to work out which
 * round is a given game's second. Includes a mid-season pair (gameweek 12/13) for
 * the games that start there.
 */
const COMPETITION_ROUNDS = [
	{ id: 'r1', number: 1, competitionId: 'comp-1' },
	{ id: 'r2', number: 2, competitionId: 'comp-1' },
	{ id: 'r3', number: 3, competitionId: 'comp-1' },
	{ id: 'gw12', number: 12, competitionId: 'comp-1' },
	{ id: 'gw13', number: 13, competitionId: 'comp-1' },
]

/**
 * `startingRoundId` defaults to 'r1' — a game created at the competition's
 * gameweek one, the common case. Pass it to build a game that started mid-season.
 */
function makeClassicGame(
	allowRebuys: boolean,
	players: object[],
	opts: { startingRoundId?: string } = {},
) {
	return {
		id: 'g1',
		gameMode: 'classic',
		modeConfig: allowRebuys ? { allowRebuys: true } : {},
		status: 'active',
		competitionId: 'comp-1',
		currentRoundId: 'r1',
		startingRoundId: opts.startingRoundId ?? 'r1',
		players,
	} as never
}

// Every test's lock reads the competition's round sequence to tell each game's
// own opening and second rounds apart. Set here rather than per-test: which round
// is which is a property of the competition, not of the case under test.
beforeEach(() => {
	vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
})

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

	it('refunds the rebuy of a player who bought back in and then missed the deadline', async () => {
		// The rebuy was an entry into this round. Missing its deadline means it
		// bought nothing, so the money comes back off the pot.
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
			{ id: 'rebuy-pay' },
		] as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'rebuy-pay',
			status: 'paid',
		} as never)

		const result = await processDeadlineLock(['r2'])
		expect(result.paymentsRefunded).toBe(1)

		const refundSet = vi.mocked(db.update).mock.results[1]?.value.set.mock.calls[0]?.[0]
		expect(refundSet).toMatchObject({ status: 'refunded' })
	})

	it('does not refund when the rebuy was never actually paid', async () => {
		// A pending rebuy row is money the pot never counted; there is nothing to
		// reverse, and marking it refunded would claim a refund that never happened.
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
			{ id: 'rebuy-pay' },
		] as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)

		const result = await processDeadlineLock(['r2'])
		expect(result.playersEliminated).toBe(1)
		expect(result.paymentsRefunded).toBe(0)
	})

	it('auto-picks for a round 2 no-picker who is still in on merit', async () => {
		// One payment row means no rebuy: this player's opening pick came off (or
		// the no-rebuys exemption carried it), so a missed deadline gets them the
		// same worst-placed-unused-team fallback as any later round — not the
		// elimination the pre-rebuy-payment behaviour handed out.
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
		vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([
			{ id: 'fx1', homeTeamId: 't1', awayTeamId: 't2' },
		] as never)
		vi.mocked(db.query.team.findMany).mockResolvedValue([
			{ id: 't1', leaguePosition: 3 },
			{ id: 't2', leaguePosition: 18 },
		] as never)

		const result = await processDeadlineLock(['r2'])
		expect(result.autoPicksInserted).toBe(1)
		expect(result.playersEliminated).toBe(0)
		expect(db.update).not.toHaveBeenCalled()
	})
})

describe('processDeadlineLock — a game that started mid-season (#203)', () => {
	beforeEach(() => vi.clearAllMocks())

	/** Gameweek 12 — the opening round of a game created in November. */
	function mockOpeningRound() {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'gw12',
			number: 12,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
	}

	it('eliminates a no-picker in the game’s own opening round when allowRebuys=true', async () => {
		mockOpeningRound()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()], { startingRoundId: 'gw12' }),
		])

		const result = await processDeadlineLock(['gw12'])
		expect(result.playersEliminated).toBe(1)
		expect(result.autoPicksInserted).toBe(0)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundId: 'gw12',
		})
	})

	it('leaves a no-picker alone in the game’s own opening round when allowRebuys=false', async () => {
		// Before #203 this took the ordinary round-3+ path and auto-picked the
		// worst-placed team — the exemption never reached a mid-season game.
		mockOpeningRound()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()], { startingRoundId: 'gw12' }),
		])

		const result = await processDeadlineLock(['gw12'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
		expect(db.update).not.toHaveBeenCalled()
		expect(db.insert).not.toHaveBeenCalled()
	})

	it('treats the round after the opening one as the second round', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'gw13',
			number: 13,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()], { startingRoundId: 'gw12' }),
		])
		vi.mocked(db.query.payment.findMany).mockResolvedValue([
			{ id: 'pay1' },
			{ id: 'pay2' },
		] as never)

		const result = await processDeadlineLock(['gw13'])
		expect(result.playersEliminated).toBe(1)
		expect(result.autoPicksInserted).toBe(0)

		const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
		expect(setCall).toMatchObject({
			status: 'eliminated',
			eliminatedReason: 'missed_rebuy_pick',
			eliminatedRoundId: 'gw13',
		})
	})

	it("does not treat the competition's gameweek one as this game's opening round", async () => {
		// A game that starts at gameweek 12 has no round of its own at gameweek 1, so
		// the lock has no opening-round business there at all.
		vi.mocked(db.query.round.findFirst).mockResolvedValue({
			id: 'r1',
			number: 1,
			deadline: new Date(Date.now() - 60_000),
		} as never)
		vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
		vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.fixture.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.team.findMany).mockResolvedValue([] as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()], { startingRoundId: 'gw12' }),
		])

		// No fixtures to fall back on, so the ordinary auto-pick path eliminates —
		// which is the point: it's the ordinary path, not the exemption.
		const result = await processDeadlineLock(['r1'])
		expect(result.playersEliminated).toBe(1)
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
