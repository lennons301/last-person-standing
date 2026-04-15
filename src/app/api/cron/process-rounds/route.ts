import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processGameRound } from '@/lib/game/process-round'
import { round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

		// If round was processed, mark it as completed
		if (result.processed) {
			await db.update(round).set({ status: 'completed' }).where(eq(round.id, g.currentRoundId))
		}
	}

	return NextResponse.json({ processed: results })
}
