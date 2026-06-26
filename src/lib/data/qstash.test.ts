import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishJSONMock = vi.fn().mockResolvedValue({ messageId: 'qm_123' })

vi.mock('@upstash/qstash', () => ({
	Client: vi.fn().mockImplementation(function Client() {
		return { publishJSON: publishJSONMock }
	}),
}))

import {
	enqueueAutoSubmit,
	enqueueDeadlineReminder,
	enqueuePollScores,
	enqueuePollScoresAt,
	enqueueProcessRound,
} from './qstash'

describe('qstash helpers', () => {
	beforeEach(() => {
		publishJSONMock.mockClear()
		process.env.QSTASH_TOKEN = 'qs-token'
		// Existing cases exercise the VERCEL_URL fallback (stable origin unset).
		process.env.NEXT_PUBLIC_APP_URL = ''
		process.env.VERCEL_URL = 'https://example.com'
	})

	it('prefers the stable NEXT_PUBLIC_APP_URL over the per-deployment VERCEL_URL', async () => {
		// The fix: jobs must target the stable production origin so a job queued
		// by an old deployment still runs CURRENT code (not the old deployment's).
		process.env.NEXT_PUBLIC_APP_URL = 'https://last-person-standing.app'
		process.env.VERCEL_URL = 'https://last-person-standing-oldhash.vercel.app'
		process.env.CRON_SECRET = 'shh'
		await enqueuePollScoresAt(new Date('2026-06-26T18:50:00Z'), 'dedup-1')
		await enqueueProcessRound('g', 'r')
		expect(publishJSONMock.mock.calls[0][0].url).toBe(
			'https://last-person-standing.app/api/cron/poll-scores',
		)
		expect(publishJSONMock.mock.calls[1][0].url).toBe(
			'https://last-person-standing.app/api/cron/qstash-handler',
		)
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

	it('enqueues an auto-submit at the given timestamp', async () => {
		const notBefore = new Date('2026-06-11T12:00:00Z')
		await enqueueAutoSubmit('gp-1', 'r-1', 't-1', notBefore)
		const call = publishJSONMock.mock.calls[0][0]
		expect(call.body).toEqual({
			type: 'auto_submit',
			gamePlayerId: 'gp-1',
			roundId: 'r-1',
			teamId: 't-1',
		})
		expect(call.notBefore).toBe(Math.floor(notBefore.getTime() / 1000))
	})

	it('enqueuePollScores posts to poll-scores grid-aligned with a slot dedup id', async () => {
		process.env.CRON_SECRET = 'shh'
		const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000) // fixed clock
		try {
			await enqueuePollScores() // default 90s interval
			const call = publishJSONMock.mock.calls[0][0]
			expect(call.url).toBe('https://example.com/api/cron/poll-scores')
			expect(call.body).toEqual({ source: 'qstash-loop' })
			expect(call.headers).toEqual({ Authorization: 'Bearer shh' })
			expect(call.delay).toBeUndefined() // grid-aligned via notBefore, not delay
			// notBefore is on the 90s grid and at least one interval in the future.
			expect(call.notBefore % 90).toBe(0)
			expect(call.notBefore * 1000).toBeGreaterThan(1_000_000_000_000)
			// dedup id is tied to the slot → concurrent enqueues collapse to one.
			expect(call.deduplicationId).toBe(`poll-loop-${call.notBefore}`)
		} finally {
			nowSpy.mockRestore()
		}
	})

	it('enqueuePollScores collapses concurrent chains: same slot → same dedup id', async () => {
		process.env.CRON_SECRET = 'shh'
		// Two calls at slightly different times within the same 90s slot must
		// produce the identical deduplicationId so QStash accepts only one.
		const spy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000)
		try {
			await enqueuePollScores()
			spy.mockReturnValue(1_000_000_010_000) // +10s, same 90s slot
			await enqueuePollScores()
			const a = publishJSONMock.mock.calls[0][0].deduplicationId
			const b = publishJSONMock.mock.calls[1][0].deduplicationId
			expect(a).toBe(b)
		} finally {
			spy.mockRestore()
		}
	})

	it('enqueuePollScores throws when CRON_SECRET is missing', async () => {
		process.env.CRON_SECRET = ''
		await expect(enqueuePollScores()).rejects.toThrow(/CRON_SECRET/)
	})

	it('enqueuePollScoresAt schedules with notBefore (epoch seconds) and dedupId', async () => {
		process.env.CRON_SECRET = 'shh'
		const triggerAt = new Date('2026-06-11T18:50:00Z') // WC opener kickoff -10min
		await enqueuePollScoresAt(triggerAt, 'poll-fixture:abc:2026-06-11T18:50:00.000Z')
		const call = publishJSONMock.mock.calls[0][0]
		expect(call.url).toBe('https://example.com/api/cron/poll-scores')
		expect(call.body).toEqual({ source: 'fixture-kickoff' })
		expect(call.notBefore).toBe(Math.floor(triggerAt.getTime() / 1000))
		expect(call.deduplicationId).toBe('poll-fixture:abc:2026-06-11T18:50:00.000Z')
		expect(call.headers).toEqual({ Authorization: 'Bearer shh' })
	})

	it('enqueuePollScoresAt omits deduplicationId when not provided', async () => {
		process.env.CRON_SECRET = 'shh'
		await enqueuePollScoresAt(new Date('2026-06-11T18:50:00Z'))
		const call = publishJSONMock.mock.calls[0][0]
		expect(call.deduplicationId).toBeUndefined()
	})
})
