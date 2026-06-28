import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import type { QStashJob } from '@/lib/data/qstash'
import { db } from '@/lib/db'
import { submitPlannedPick } from '@/lib/game/auto-submit'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
import { writeEvent } from '@/lib/game/events'
import { processGameRound } from '@/lib/game/process-round'
import { reconcileAllActiveGames } from '@/lib/game/reconcile'
import { competition } from '@/lib/schema/competition'

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
		case 'auto_submit': {
			await submitPlannedPick(body.gamePlayerId, body.roundId, body.teamId)
			return NextResponse.json({ ok: true })
		}
		case 'sync_competition': {
			// Re-sync one competition (ingest newly-confirmed fixtures, e.g. the
			// next knockout round's matchups) then advance/open any game whose
			// current round just completed. Triggered after a knockout match
			// finishes so the bracket populates as the tournament progresses,
			// independent of the daily cron. No FPL dependency (football-data only).
			const [comp] = await db
				.select()
				.from(competition)
				.where(eq(competition.id, body.competitionId))
			if (!comp) return NextResponse.json({ ok: false, reason: 'competition-not-found' })
			const summary = await syncCompetition(comp, {
				footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY,
			})
			const reconcile = await reconcileAllActiveGames()
			return NextResponse.json({ ok: true, summary, reconcile })
		}
		default:
			return NextResponse.json({ error: 'Unknown job type' }, { status: 400 })
	}
}

export const POST = verifySignatureAppRouter(handler)
