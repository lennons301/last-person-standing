import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
	verifyMock,
	processGameRoundMock,
	writeEventMock,
	submitPlannedPickMock,
	processDeadlineLockMock,
	scheduleDeadlineLockForRoundMock,
} = vi.hoisted(() => ({
	verifyMock: vi.fn(),
	processGameRoundMock: vi.fn().mockResolvedValue({ processed: true }),
	writeEventMock: vi.fn().mockResolvedValue(undefined),
	submitPlannedPickMock: vi.fn().mockResolvedValue({ submitted: true }),
	processDeadlineLockMock: vi.fn().mockResolvedValue({
		autoPicksInserted: 1,
		playersEliminated: 0,
		paymentsRefunded: 0,
	}),
	scheduleDeadlineLockForRoundMock: vi.fn().mockResolvedValue(null),
}))

vi.mock('@upstash/qstash/nextjs', () => ({
	verifySignatureAppRouter: (fn: unknown) => fn,
	verifySignature: verifyMock,
}))

vi.mock('@/lib/game/process-round', () => ({ processGameRound: processGameRoundMock }))

vi.mock('@/lib/game/events', () => ({ writeEvent: writeEventMock }))

vi.mock('@/lib/game/auto-submit', () => ({ submitPlannedPick: submitPlannedPickMock }))

vi.mock('@/lib/game/no-pick-handler', () => ({ processDeadlineLock: processDeadlineLockMock }))

vi.mock('@/lib/game/round-lifecycle', () => ({
	scheduleDeadlineLockForRound: scheduleDeadlineLockForRoundMock,
}))

import { POST } from './route'

function req(body: unknown): Request {
	return new Request('http://x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

describe('qstash-handler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('dispatches process_round jobs', async () => {
		const res = await POST(req({ type: 'process_round', gameId: 'g', roundId: 'r' }))
		expect(res.status).toBe(200)
		expect(processGameRoundMock).toHaveBeenCalledWith('g', 'r')
	})

	it('dispatches deadline_reminder jobs', async () => {
		const res = await POST(
			req({ type: 'deadline_reminder', gameId: 'g', roundId: 'r', window: '24h' }),
		)
		expect(res.status).toBe(200)
		expect(writeEventMock).toHaveBeenCalledWith({
			gameId: 'g',
			type: 'deadline_approaching',
			payload: { roundId: 'r', window: '24h' },
		})
	})

	it('dispatches auto_submit jobs', async () => {
		const res = await POST(
			req({ type: 'auto_submit', gamePlayerId: 'gp', roundId: 'r', teamId: 't' }),
		)
		expect(res.status).toBe(200)
		expect(submitPlannedPickMock).toHaveBeenCalledWith('gp', 'r', 't')
	})

	it('dispatches deadline_lock jobs to the no-pick lock', async () => {
		const res = await POST(req({ type: 'deadline_lock', roundId: 'r' }))
		expect(res.status).toBe(200)
		expect(processDeadlineLockMock).toHaveBeenCalledWith(['r'])
		const body = await res.json()
		expect(body).toEqual({
			ok: true,
			summary: { autoPicksInserted: 1, playersEliminated: 0, paymentsRefunded: 0 },
			rescheduledFor: null,
		})
	})

	it('re-arms a deadline_lock that fired before a moved deadline', async () => {
		// A daily sync can push round.deadline LATER after the job was queued
		// (rescheduled fixtures). The job then fires early, the lock no-ops on
		// its internal gate, and the handler must re-enqueue for the new
		// deadline — otherwise no-pick processing regresses to the daily-sync
		// fallback's cadence.
		const rearmedAt = new Date('2026-08-28T17:31:00Z')
		scheduleDeadlineLockForRoundMock.mockResolvedValueOnce(rearmedAt)
		const res = await POST(req({ type: 'deadline_lock', roundId: 'r' }))
		expect(res.status).toBe(200)
		expect(processDeadlineLockMock).toHaveBeenCalledWith(['r'])
		expect(scheduleDeadlineLockForRoundMock).toHaveBeenCalledWith('r')
		const body = await res.json()
		expect(body.rescheduledFor).toBe(rearmedAt.toISOString())
	})

	it('rejects unknown job types', async () => {
		const res = await POST(req({ type: 'nope' }))
		expect(res.status).toBe(400)
	})
})
