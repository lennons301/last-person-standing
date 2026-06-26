import { Client } from '@upstash/qstash'

export type QStashJob =
	| { type: 'process_round'; gameId: string; roundId: string }
	| { type: 'deadline_reminder'; gameId: string; roundId: string; window: '24h' | '2h' }
	| { type: 'auto_submit'; gamePlayerId: string; roundId: string; teamId: string }

/**
 * Stable callback origin for QStash jobs.
 *
 * MUST prefer the stable production domain (`NEXT_PUBLIC_APP_URL`) over
 * `VERCEL_URL`. `VERCEL_URL` is the *per-deployment* immutable URL
 * (`…-<hash>.vercel.app`); pinning callbacks to it means a job scheduled by an
 * old deployment fires against THAT deployment's code when it runs. Because
 * fixture-kickoff polls are pre-scheduled up to 7 days ahead (see
 * `scheduleUpcomingFixturePolls`) and the poll chain self-perpetuates, a fix
 * deployed today can be silently undone for up to a week by stale jobs still
 * hitting the old deployment. This caused a cup game to be crowned mid-gameweek
 * by week-old buggy code even though current production was correct.
 *
 * `NEXT_PUBLIC_APP_URL` is the custom production domain (last-person-standing.app)
 * and always resolves to the current production deployment, so every job — no
 * matter which deployment queued it — runs current code. Falls back to
 * `VERCEL_URL` only when the stable origin isn't configured (local/dev).
 */
function callbackBase(): string {
	const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || ''
	if (!base) {
		throw new Error('NEXT_PUBLIC_APP_URL (or VERCEL_URL) must be set to enqueue QStash messages')
	}
	return base.startsWith('http') ? base : `https://${base}`
}

function handlerUrl(): string {
	return `${callbackBase()}/api/cron/qstash-handler`
}

function client(): Client {
	const token = process.env.QSTASH_TOKEN
	if (!token) throw new Error('QSTASH_TOKEN not configured')
	return new Client({ token })
}

export async function enqueueProcessRound(gameId: string, roundId: string): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'process_round', gameId, roundId } satisfies QStashJob,
		delay: 120,
	})
}

export async function enqueueDeadlineReminder(
	gameId: string,
	roundId: string,
	window: '24h' | '2h',
	notBefore: Date,
): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'deadline_reminder', gameId, roundId, window } satisfies QStashJob,
		notBefore: Math.floor(notBefore.getTime() / 1000),
	})
}

export async function enqueueAutoSubmit(
	gamePlayerId: string,
	roundId: string,
	teamId: string,
	notBefore: Date,
): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'auto_submit', gamePlayerId, roundId, teamId } satisfies QStashJob,
		notBefore: Math.floor(notBefore.getTime() / 1000),
	})
}

/**
 * Enqueue another call to /api/cron/poll-scores with the given delay (seconds).
 * Used to build a self-perpetuating chain during live match windows where
 * GitHub Actions free-tier scheduling can't deliver per-minute reliability.
 *
 * The route's CRON_SECRET bearer auth is satisfied via a forwarded
 * Authorization header (QStash sends the literal value verbatim — same
 * security envelope as a GH Actions secret).
 */
export async function enqueuePollScores(delaySeconds = 60): Promise<void> {
	const cronSecret = process.env.CRON_SECRET
	if (!cronSecret) throw new Error('CRON_SECRET must be set to enqueue poll-scores')
	await client().publishJSON({
		url: `${callbackBase()}/api/cron/poll-scores`,
		body: { source: 'qstash-loop' },
		headers: { Authorization: `Bearer ${cronSecret}` },
		delay: delaySeconds,
	})
}

/**
 * Pre-schedule a single poll-scores call for a future moment (e.g. a fixture's
 * kickoff time minus a grace window). Solves the "live polling didn't start"
 * gap where GitHub Actions heartbeats run every ~50-90 minutes in practice
 * and may miss a match's live window entirely. We schedule one trigger per
 * upcoming fixture; each trigger starts a chain that self-terminates when
 * matches finish.
 *
 * Pass a stable `dedupId` (e.g. fixture id + scheduled epoch) so re-running
 * bootstrap doesn't queue duplicates. QStash dedup window is ~10min by
 * default, so two bootstrap runs within that window won't double up.
 */
export async function enqueuePollScoresAt(notBefore: Date, dedupId?: string): Promise<void> {
	const cronSecret = process.env.CRON_SECRET
	if (!cronSecret) throw new Error('CRON_SECRET must be set to enqueue poll-scores')
	await client().publishJSON({
		url: `${callbackBase()}/api/cron/poll-scores`,
		body: { source: 'fixture-kickoff' },
		headers: { Authorization: `Bearer ${cronSecret}` },
		notBefore: Math.floor(notBefore.getTime() / 1000),
		...(dedupId ? { deduplicationId: dedupId } : {}),
	})
}
