import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock, advanceGameIfReadyMock, sweepGameSettlementMock } = vi.hoisted(() => ({
	dbMock: { query: { game: { findFirst: vi.fn() } } },
	advanceGameIfReadyMock: vi.fn(),
	sweepGameSettlementMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))
vi.mock('@/lib/game/process-round', () => ({ advanceGameIfReady: advanceGameIfReadyMock }))
vi.mock('@/lib/game/settle', () => ({ sweepGameSettlement: sweepGameSettlementMock }))

import { reconcileGameState } from './reconcile'

describe('reconcileGameState', () => {
	beforeEach(() => vi.clearAllMocks())

	it('no-ops on an active game whose competition is archived — no settle, no advance', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			currentRoundId: 'r1',
			competition: { id: 'c1', status: 'archived' },
			currentRound: { id: 'r1', status: 'completed', fixtures: [] },
		} as never)

		const result = await reconcileGameState('g1')

		expect(result).toEqual({ ok: true, action: 'noop', reason: 'competition-archived' })
		expect(advanceGameIfReadyMock).not.toHaveBeenCalled()
		expect(sweepGameSettlementMock).not.toHaveBeenCalled()
	})

	it('leaves a completed game on an archived competition untouched (history intact)', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'completed',
			currentRoundId: 'r1',
			competition: { id: 'c1', status: 'archived' },
			currentRound: { id: 'r1', status: 'completed', fixtures: [] },
		} as never)

		const result = await reconcileGameState('g1')

		expect(result).toEqual({ ok: true, action: 'noop', reason: 'game-not-active' })
		expect(advanceGameIfReadyMock).not.toHaveBeenCalled()
		expect(sweepGameSettlementMock).not.toHaveBeenCalled()
	})

	it('still reconciles an active game on an active competition', async () => {
		dbMock.query.game.findFirst.mockResolvedValue({
			id: 'g1',
			status: 'active',
			currentRoundId: 'r1',
			competition: { id: 'c1', status: 'active' },
			currentRound: { id: 'r1', status: 'open', fixtures: [] },
		} as never)
		sweepGameSettlementMock.mockResolvedValue([
			{ classicSettled: 2, turboSettled: 0, cupGamesReevaluated: 0 },
		])

		const result = await reconcileGameState('g1')

		expect(result).toEqual({ ok: true, action: 'settled', fixturesSettled: 2 })
	})
})
