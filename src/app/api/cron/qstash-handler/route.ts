import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { NextResponse } from 'next/server'
import type { QStashJob } from '@/lib/data/qstash'
import { writeEvent } from '@/lib/game/events'
import { processGameRound } from '@/lib/game/process-round'

async function handler(request: Request): Promise<Response> {
	const body = (await request.json()) as QStashJob
	switch (body.type) {
		case 'process_round': {
			await processGameRound(body.gameId, body.roundId)
			return NextResponse.json({ ok: true })
		}
		case 'deadline_reminder': {
			await writeEvent({
				gameId: body.gameId,
				type: 'deadline_approaching',
				payload: { roundId: body.roundId, window: body.window },
			})
			return NextResponse.json({ ok: true })
		}
		default:
			return NextResponse.json({ error: 'Unknown job type' }, { status: 400 })
	}
}

export const POST = verifySignatureAppRouter(handler)
