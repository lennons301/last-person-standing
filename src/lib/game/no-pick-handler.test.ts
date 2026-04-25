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
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
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
