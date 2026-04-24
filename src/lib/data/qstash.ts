import { Client } from '@upstash/qstash'

export type QStashJob =
	| { type: 'process_round'; gameId: string; roundId: string }
	| { type: 'deadline_reminder'; gameId: string; roundId: string; window: '24h' | '2h' }
	| { type: 'auto_submit'; gamePlayerId: string; roundId: string; teamId: string }

function handlerUrl(): string {
	const base = process.env.VERCEL_URL ?? ''
	if (!base) throw new Error('VERCEL_URL must be set to enqueue QStash messages')
	const withScheme = base.startsWith('http') ? base : `https://${base}`
	return `${withScheme}/api/cron/qstash-handler`
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
