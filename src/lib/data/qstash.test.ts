import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishJSONMock = vi.fn().mockResolvedValue({ messageId: 'qm_123' })

vi.mock('@upstash/qstash', () => ({
	Client: vi.fn().mockImplementation(function Client() {
		return { publishJSON: publishJSONMock }
	}),
}))

import { enqueueDeadlineReminder, enqueueProcessRound } from './qstash'

describe('qstash helpers', () => {
	beforeEach(() => {
		publishJSONMock.mockClear()
		process.env.QSTASH_TOKEN = 'qs-token'
		process.env.VERCEL_URL = 'https://example.com'
	})

	it('enqueues a process-round message with a 2-minute delay', async () => {
		await enqueueProcessRound('game-1', 'round-1')
		expect(publishJSONMock).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://example.com/api/cron/qstash-handler',
				body: { type: 'process_round', gameId: 'game-1', roundId: 'round-1' },
				delay: 120,
			}),
		)
	})

	it('enqueues a deadline reminder at the given timestamp', async () => {
		const notBefore = new Date('2026-06-11T12:00:00Z')
		await enqueueDeadlineReminder('game-1', 'round-1', '24h', notBefore)
		const call = publishJSONMock.mock.calls[0][0]
		expect(call.body).toEqual({
			type: 'deadline_reminder',
			gameId: 'game-1',
			roundId: 'round-1',
			window: '24h',
		})
		expect(call.notBefore).toBe(Math.floor(notBefore.getTime() / 1000))
	})
})
