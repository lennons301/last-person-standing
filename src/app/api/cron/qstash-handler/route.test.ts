import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyMock, processGameRoundMock, writeEventMock } = vi.hoisted(() => ({
	verifyMock: vi.fn(),
	processGameRoundMock: vi.fn().mockResolvedValue({ processed: true }),
	writeEventMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@upstash/qstash/nextjs', () => ({
	verifySignatureAppRouter: (fn: unknown) => fn,
	verifySignature: verifyMock,
}))

vi.mock('@/lib/game/process-round', () => ({ processGameRound: processGameRoundMock }))

vi.mock('@/lib/game/events', () => ({ writeEvent: writeEventMock }))

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

	it('rejects unknown job types', async () => {
		const res = await POST(req({ type: 'nope' }))
		expect(res.status).toBe(400)
	})
})
