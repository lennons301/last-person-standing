import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { processDeadlineLock } from './no-pick-handler'

/**
 * What is left to test here is the *wiring* — that the rows the lock gathers
 * reach `decideNoPickOutcome` and that what it decides gets written. The rule
 * itself is a table over the six outcomes in `no-pick-decision.test.ts`, with no
 * database in sight, and the paths end to end are smoke scenarios against real
 * Postgres. So this file keeps only what neither of those can reach: the
 * concurrency arbitration on the auto-pick insert, and the two shapes the #238
 * defect turned on.
 *
 * The transaction handle is the mock itself, so a write made inside one is
 * observable on `db.insert` / `db.update` exactly as an unwrapped write is.
 */
vi.mock('@/lib/db', () => {
	const dbMock = {
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
		transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(dbMock)),
	}
	return { db: dbMock }
})

interface PlayerRow {
	id: string
	userId: string
	status: string
	eliminatedRoundId: string | null
	eliminatedReason: string | null
	livesRemaining: number
}

function makeClassicPlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
	return {
		id: 'p1',
		userId: 'u1',
		status: 'alive',
		eliminatedRoundId: null,
		eliminatedReason: null,
		livesRemaining: 0,
		...overrides,
	}
}

/**
 * The competition's whole round sequence — what the lock reads to work out which
 * round is a given game's second.
 */
const COMPETITION_ROUNDS = [
	{ id: 'r1', number: 1, competitionId: 'comp-1' },
	{ id: 'r2', number: 2, competitionId: 'comp-1' },
	{ id: 'r3', number: 3, competitionId: 'comp-1' },
]

function makeClassicGame(allowRebuys: boolean, players: PlayerRow[]) {
	return {
		id: 'g1',
		gameMode: 'classic',
		modeConfig: allowRebuys ? { allowRebuys: true } : {},
		status: 'active',
		competitionId: 'comp-1',
		currentRoundId: 'r1',
		startingRoundId: 'r1',
		players,
	}
}

/** A round whose deadline has gone, so the lock actually runs on it. */
function mockLockedRound(id: string, number: number) {
	vi.mocked(db.query.round.findFirst).mockResolvedValue({
		id,
		number,
		deadline: new Date(Date.now() - 60_000),
	} as never)
	vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
	vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
}

/** One fixture, one clearly worse team — enough for a fallback to exist. */
function mockRoundBoard() {
	vi.mocked(db.query.pick.findMany).mockResolvedValue([] as never)
	vi.mocked(db.query.fixture.findMany).mockResolvedValue([
		{ id: 'fx1', homeTeamId: 't-home', awayTeamId: 't-away', kickoff: new Date() },
	] as never)
	vi.mocked(db.query.team.findMany).mockResolvedValue([
		{ id: 't-home', leaguePosition: 1 },
		{ id: 't-away', leaguePosition: 20 },
	] as never)
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(db.transaction).mockImplementation(((callback: (tx: unknown) => unknown) =>
		callback(db)) as never)
	vi.mocked(db.query.round.findMany).mockResolvedValue(COMPETITION_ROUNDS as never)
	vi.mocked(db.query.payment.findMany).mockResolvedValue([] as never)
})

describe('processDeadlineLock', () => {
	it('no-ops when no games use the round', async () => {
		vi.mocked(db.query.round.findFirst).mockResolvedValue(undefined as never)
		vi.mocked(db.query.game.findMany).mockResolvedValue([] as never)

		const result = await processDeadlineLock(['r1'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
	})
})

describe('processDeadlineLock — the decision reaches the writes', () => {
	it('writes nothing at all for an exempt player', async () => {
		mockLockedRound('r1', 1)
		mockRoundBoard()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()]),
		] as never)

		const result = await processDeadlineLock(['r1'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
		expect(db.update).not.toHaveBeenCalled()
		expect(db.insert).not.toHaveBeenCalled()
	})

	it('auto-picks for a round-two no-picker who never bought back in (#238)', async () => {
		// One payment row is a player still in on merit. The defect eliminated them.
		mockLockedRound('r2', 2)
		mockRoundBoard()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()]),
		] as never)
		vi.mocked(db.query.payment.findMany).mockResolvedValue([{ id: 'pay1', userId: 'u1' }] as never)

		const result = await processDeadlineLock(['r2'])
		expect(result).toEqual({ autoPicksInserted: 1, playersEliminated: 0, paymentsRefunded: 0 })
		expect(db.update).not.toHaveBeenCalled()
	})

	it('eliminates and refunds a round-two no-picker who did buy back in', async () => {
		mockLockedRound('r2', 2)
		mockRoundBoard()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(true, [makeClassicPlayer()]),
		] as never)
		vi.mocked(db.query.payment.findMany).mockResolvedValue([
			{ id: 'pay1', userId: 'u1' },
			{ id: 'rebuy-pay', userId: 'u1' },
		] as never)
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({
			id: 'rebuy-pay',
			status: 'paid',
		} as never)

		const result = await processDeadlineLock(['r2'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 1, paymentsRefunded: 1 })
		// The elimination and its refund are one transaction: the money only comes
		// off the pot because the player went out.
		expect(db.transaction).toHaveBeenCalledTimes(1)
	})
})

describe('processDeadlineLock — classic auto-pick concurrency (#127)', () => {
	beforeEach(() => {
		mockLockedRound('r3', 3)
		mockRoundBoard()
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			makeClassicGame(false, [makeClassicPlayer()]),
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
