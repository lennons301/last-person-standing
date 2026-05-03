import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
	mergeFootballDataIds,
	scheduleUpcomingFixturePolls,
	syncCompetition,
} from '@/lib/game/bootstrap-competitions'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { competition } from '@/lib/schema/competition'

export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	const comps = await db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})
	const results = []
	const deadlineLockedRoundIds: string[] = []
	for (const c of comps) {
		const summary = await syncCompetition(c, { footballDataApiKey: apiKey })
		results.push({
			competitionId: c.id,
			rounds: summary.rounds,
			fixtures: summary.fixtures,
		})
		if (summary.transitionedRoundIds?.length) {
			deadlineLockedRoundIds.push(...summary.transitionedRoundIds)
		}
		// For FPL-bootstrapped competitions, merge football-data IDs onto fresh
		// fixtures + teams so the live-score poll can match by external_ids.football_data.
		// Was previously only run by the manual `scripts/bootstrap-competitions.ts`
		// path; missing it here meant new fixtures (rescheduled / late-published)
		// stayed invisible to live polling.
		if (c.dataSource === 'fpl' && apiKey) {
			await mergeFootballDataIds(c, apiKey)
		}
	}

	// Pre-schedule a poll-scores trigger for every upcoming fixture across all
	// competitions. Solves the "GH Actions heartbeat missed the match window"
	// gap: each fixture gets its own QStash trigger 10 min before kickoff,
	// which starts the self-perpetuating chain reliably.
	await scheduleUpcomingFixturePolls()
	let deadlineLock: {
		autoPicksInserted: number
		playersEliminated: number
		paymentsRefunded: number
	} | null = null
	if (deadlineLockedRoundIds.length > 0) {
		deadlineLock = await processDeadlineLock(deadlineLockedRoundIds)
	}
	return NextResponse.json({ competitions: results, deadlineLock })
}
