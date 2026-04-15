import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { db } from '@/lib/db'
import { fixture, round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 500 })
	}

	// Find active rounds (status = 'active') for active games
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
		with: { currentRound: true },
	})

	const activeRoundIds = activeGames
		.map((g) => g.currentRoundId)
		.filter((id): id is string => id != null)

	if (activeRoundIds.length === 0) {
		return NextResponse.json({ updated: 0 })
	}

	const adapter = new FootballDataAdapter('PL', apiKey)
	let totalUpdated = 0

	for (const roundId of [...new Set(activeRoundIds)]) {
		const roundData = await db.query.round.findFirst({
			where: eq(round.id, roundId),
		})
		if (!roundData) continue

		const scores = await adapter.fetchLiveScores(roundData.number)

		for (const score of scores) {
			await db
				.update(fixture)
				.set({
					homeScore: score.homeScore,
					awayScore: score.awayScore,
					status: score.status,
				})
				.where(eq(fixture.externalId, score.externalId))

			totalUpdated++
		}
	}

	return NextResponse.json({ updated: totalUpdated })
}
