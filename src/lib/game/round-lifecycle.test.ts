import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock, enqueueAutoSubmitMock } = vi.hoisted(() => {
	const enqueueAutoSubmitMock = vi.fn().mockResolvedValue(undefined)
	const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }))
	return {
		enqueueAutoSubmitMock,
		dbMock: {
			query: {
				round: { findFirst: vi.fn() },
				plannedPick: { findMany: vi.fn().mockResolvedValue([]) },
			},
			update: vi.fn(() => ({ set: updateSet })),
		},
	}
})

vi.mock('@/lib/db', () => ({ db: dbMock }))
vi.mock('@/lib/data/qstash', () => ({
	enqueueAutoSubmit: enqueueAutoSubmitMock,
}))

import {
	openRoundForGame,
	scheduleAutoSubmitForPlan,
	scheduleAutoSubmitsForRound,
} from './round-lifecycle'

describe('openRoundForGame', () => {
	beforeEach(() => vi.clearAllMocks())

	it('flips a round from upcoming → open and schedules autoSubmit plans', async () => {
		const deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			status: 'upcoming',
			deadline,
		} as never)
		dbMock.query.plannedPick.findMany.mockResolvedValue([
			{ gamePlayerId: 'gp1', roundId: 'r1', teamId: 't1', autoSubmit: true },
			{ gamePlayerId: 'gp2', roundId: 'r1', teamId: 't2', autoSubmit: false },
		] as never)

		await openRoundForGame('r1')

		// Round update: status = 'open'
		expect(dbMock.update).toHaveBeenCalled()
		// Only the autoSubmit=true plan gets enqueued
		expect(enqueueAutoSubmitMock).toHaveBeenCalledTimes(1)
		expect(enqueueAutoSubmitMock).toHaveBeenCalledWith(
			'gp1',
			'r1',
			't1',
			new Date(deadline.getTime() - 60_000),
		)
	})

	it('does not flip a round that is already open', async () => {
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			status: 'open',
			deadline: new Date(Date.now() + 24 * 3600 * 1000),
		} as never)

		await openRoundForGame('r1')

		expect(dbMock.update).not.toHaveBeenCalled()
	})

	it('does not flip completed rounds and does not enqueue', async () => {
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			status: 'completed',
			deadline: new Date(Date.now() - 24 * 3600 * 1000),
		} as never)

		await openRoundForGame('r1')

		expect(dbMock.update).not.toHaveBeenCalled()
		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})

	it('skips enqueue when deadline is already past or within the lead window', async () => {
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			status: 'upcoming',
			deadline: new Date(Date.now() + 30_000), // 30s in the future, less than 60s lead
		} as never)
		dbMock.query.plannedPick.findMany.mockResolvedValue([
			{ gamePlayerId: 'gp1', roundId: 'r1', teamId: 't1', autoSubmit: true },
		] as never)

		await openRoundForGame('r1')

		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})

	it('returns silently when the round does not exist', async () => {
		dbMock.query.round.findFirst.mockResolvedValue(undefined as never)
		await openRoundForGame('missing')
		expect(dbMock.update).not.toHaveBeenCalled()
		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})
})

describe('scheduleAutoSubmitsForRound', () => {
	beforeEach(() => vi.clearAllMocks())

	it('enqueues only autoSubmit=true plans', async () => {
		const deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			status: 'open',
			deadline,
		} as never)
		dbMock.query.plannedPick.findMany.mockResolvedValue([
			{ gamePlayerId: 'gp1', roundId: 'r1', teamId: 't1', autoSubmit: true },
			{ gamePlayerId: 'gp2', roundId: 'r1', teamId: 't2', autoSubmit: false },
			{ gamePlayerId: 'gp3', roundId: 'r1', teamId: 't3', autoSubmit: true },
		] as never)

		await scheduleAutoSubmitsForRound('r1')

		expect(enqueueAutoSubmitMock).toHaveBeenCalledTimes(2)
	})
})

describe('scheduleAutoSubmitForPlan', () => {
	beforeEach(() => vi.clearAllMocks())

	it('enqueues for a single plan with deadline T-60s', async () => {
		const deadline = new Date(Date.now() + 24 * 3600 * 1000)
		dbMock.query.round.findFirst.mockResolvedValue({
			id: 'r1',
			deadline,
		} as never)

		await scheduleAutoSubmitForPlan('gp1', 'r1', 't1')

		expect(enqueueAutoSubmitMock).toHaveBeenCalledWith(
			'gp1',
			'r1',
			't1',
			new Date(deadline.getTime() - 60_000),
		)
	})

	it('skips if round has no deadline', async () => {
		dbMock.query.round.findFirst.mockResolvedValue({ id: 'r1', deadline: null } as never)
		await scheduleAutoSubmitForPlan('gp1', 'r1', 't1')
		expect(enqueueAutoSubmitMock).not.toHaveBeenCalled()
	})
})
