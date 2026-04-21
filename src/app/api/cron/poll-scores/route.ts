import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { hasActiveFixture } from '@/lib/data/match-window'
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

	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
		with: { currentRound: true, competition: true },
	})

	const activeRoundIds = [
		...new Set(activeGames.map((g) => g.currentRoundId).filter((id): id is string => id != null)),
	]

	if (activeRoundIds.length === 0) {
		return NextResponse.json({ updated: 0, reason: 'no-active-rounds' })
	}

	// Load every fixture in the active rounds and short-circuit if none are in their live window.
	const fixturesInRounds = await db
		.select({ id: fixture.id, kickoff: fixture.kickoff, roundId: fixture.roundId })
		.from(fixture)
		.where(inArray(fixture.roundId, activeRoundIds))

	if (!hasActiveFixture(fixturesInRounds)) {
		return NextResponse.json({ updated: 0, reason: 'no-active-fixtures' })
	}

	let totalUpdated = 0

	// One adapter per competition external code — WC and PL may both be active.
	const competitionsByExternalCode = new Map<string, string[]>()
	for (const g of activeGames) {
		if (!g.currentRoundId) continue
		const code = g.competition.externalId ?? (g.competition.dataSource === 'fpl' ? 'PL' : null)
		if (!code) continue
		const list = competitionsByExternalCode.get(code) ?? []
		if (!list.includes(g.currentRoundId)) list.push(g.currentRoundId)
		competitionsByExternalCode.set(code, list)
	}

	for (const [code, roundIds] of competitionsByExternalCode) {
		const adapter = new FootballDataAdapter(code, apiKey)
		for (const roundId of roundIds) {
			const roundData = await db.query.round.findFirst({ where: eq(round.id, roundId) })
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
	}

	return NextResponse.json({ updated: totalUpdated })
}
