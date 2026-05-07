import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { advanceGameIfReady, processGameRound } from '@/lib/game/process-round'
import { round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	// Find active games with a current round
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
	})

	const results = []

	for (const g of activeGames) {
		if (!g.currentRoundId) continue

		// Check if the round's fixtures are all finished
		const roundData = await db.query.round.findFirst({
			where: eq(round.id, g.currentRoundId),
			with: { fixtures: true },
		})

		if (!roundData) continue

		const allFinished = roundData.fixtures.every(
			(f) => f.status === 'finished' && f.homeScore != null && f.awayScore != null,
		)

		if (!allFinished) continue

		const result = await processGameRound(g.id, g.currentRoundId)
		results.push({ gameId: g.id, ...result })
	}

	// Retry advancement for games stuck on a completed round (typically
	// because the next round was TBD when last processed — e.g. WC knockouts
	// before the bracket was published). Safe to call every tick: returns
	// 'round-not-completed' (no-op) for healthy games.
	const advanced = []
	for (const g of activeGames) {
		if (!g.currentRoundId) continue
		const r = await advanceGameIfReady(g.id)
		if (r.advanced) advanced.push({ gameId: g.id })
	}

	return NextResponse.json({ processed: results, advanced })
}
