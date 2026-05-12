import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
	applyPotAssignments,
	mergeFootballDataIds,
	scheduleUpcomingFixturePolls,
	syncCompetition,
} from '@/lib/game/bootstrap-competitions'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { reconcileAllActiveGames } from '@/lib/game/reconcile'
import { openRoundForGame } from '@/lib/game/round-lifecycle'
import { competition } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

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
		const entry: {
			competitionId: string
			rounds: number
			fixtures: number
			pots?: { matched: number; unmatched: string[] }
		} = {
			competitionId: c.id,
			rounds: summary.rounds,
			fixtures: summary.fixtures,
		}
		if (summary.deadlinePassedRoundIds?.length) {
			deadlineLockedRoundIds.push(...summary.deadlinePassedRoundIds)
		}
		// For FPL-bootstrapped competitions, merge football-data IDs onto fresh
		// fixtures + teams so the live-score poll can match by external_ids.football_data.
		if (c.dataSource === 'fpl' && apiKey) {
			await mergeFootballDataIds(c, apiKey)
		}
		// Group-knockout competitions (e.g. World Cup) need FIFA pot assignments
		// on every team for cup-mode tier-difference maths. Run on every sync so
		// late-arriving teams (playoff winners) get tagged without a redeploy.
		if (c.type === 'group_knockout') {
			entry.pots = await applyPotAssignments(c.id)
		}
		results.push(entry)
	}

	// Reconciliation: any active game whose currentRoundId still points at an
	// 'upcoming' round means the open transition didn't fire (e.g. a game
	// created before the round-lifecycle fix shipped, or a future-round
	// advance whose new round was upcoming when the game advanced into it).
	// Heal here so the progress grid filter and processDeadlineLock both see
	// the round as open.
	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
		with: { currentRound: true },
	})
	const reconciledRoundIds: string[] = []
	for (const g of activeGames) {
		if (g.currentRound && g.currentRound.status === 'upcoming') {
			await openRoundForGame(g.currentRound.id)
			reconciledRoundIds.push(g.currentRound.id)
		}
	}

	// 24h safety-net: sweep all active games through reconcile. Per-fixture
	// settlement (called inline above from syncCompetition) handles the
	// happy path; this catches anything missed (network failure on the
	// inline settle, an in-flight migration, future bugs). settleFixture is
	// idempotent so this is a no-op for healthy games.
	const reconcileSummary = await reconcileAllActiveGames()

	// Pre-schedule a poll-scores trigger for every upcoming fixture across all
	// competitions. Each fixture gets its own QStash trigger 10 min before
	// kickoff, which starts the self-perpetuating chain reliably.
	await scheduleUpcomingFixturePolls()
	let deadlineLock: {
		autoPicksInserted: number
		playersEliminated: number
		paymentsRefunded: number
	} | null = null
	if (deadlineLockedRoundIds.length > 0) {
		deadlineLock = await processDeadlineLock(deadlineLockedRoundIds)
	}

	return NextResponse.json({
		competitions: results,
		deadlineLock,
		reconciledRoundIds,
		reconcile: reconcileSummary,
	})
}
