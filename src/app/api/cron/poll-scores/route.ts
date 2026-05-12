import { eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter, resolveFootballDataCode } from '@/lib/data/football-data'
import { hasActiveFixture } from '@/lib/data/match-window'
import { enqueuePollScores } from '@/lib/data/qstash'
import { db } from '@/lib/db'
import { settleFixture } from '@/lib/game/settle'
import { fixture, round } from '@/lib/schema/competition'
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
	if (!apiKey) {
		return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 500 })
	}

	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
		with: { currentRound: true, competition: true },
	})

	// A game is dispatchable if it has a current round AND its competition
	// maps to a football-data.org code. Any later gating (live-window,
	// dispatch loop) must agree on this set.
	const dispatchableGames = activeGames.flatMap((g) => {
		if (!g.currentRoundId) return []
		const code = resolveFootballDataCode(g.competition)
		if (!code) return []
		return [{ id: g.id, currentRoundId: g.currentRoundId, code }]
	})

	const activeRoundIds = [...new Set(dispatchableGames.map((g) => g.currentRoundId))]

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

	// One adapter per competition external code — WC and PL may both be active.
	const competitionsByExternalCode = new Map<string, string[]>()
	for (const { currentRoundId, code } of dispatchableGames) {
		const list = competitionsByExternalCode.get(code) ?? []
		if (!list.includes(currentRoundId)) list.push(currentRoundId)
		competitionsByExternalCode.set(code, list)
	}

	let totalUpdated = 0

	for (const [code, roundIds] of competitionsByExternalCode) {
		const adapter = new FootballDataAdapter(code, apiKey)
		for (const roundId of roundIds) {
			const roundData = await db.query.round.findFirst({ where: eq(round.id, roundId) })
			if (!roundData) continue

			const scoresUpdates = await adapter.fetchLiveScores(roundData.number)
			const transitionedFixtureIds: string[] = []

			for (const score of scoresUpdates) {
				// Match by external_ids.football_data so FPL-bootstrapped fixtures
				// (where external_id is the FPL id) still get score updates from the
				// football-data adapter. The merge step in bootstrap-competitions
				// populates external_ids.football_data on FPL fixtures. For
				// football-data-bootstrapped competitions (e.g., WC), external_ids.football_data
				// equals external_id by construction.
				const [existing] = await db
					.select({ id: fixture.id, status: fixture.status })
					.from(fixture)
					.where(sql`${fixture.externalIds}->>'football_data' = ${score.externalId}`)
				if (!existing) continue

				await db
					.update(fixture)
					.set({
						homeScore: score.homeScore,
						awayScore: score.awayScore,
						status: score.status,
					})
					.where(eq(fixture.id, existing.id))

				if (existing.status !== 'finished' && score.status === 'finished') {
					transitionedFixtureIds.push(existing.id)
				}
				totalUpdated++
			}

			// Per-fixture settlement: every transition triggers immediate pick
			// settlement, elimination, and game-completion checks for that
			// fixture's picks. Replaces the old round-batched
			// enqueueProcessRound path.
			for (const fid of transitionedFixtureIds) {
				await settleFixture(fid)
			}
		}
	}

	// Self-perpetuating chain: GitHub Actions free-tier crons run every ~60-90
	// minutes in practice (despite the `* * * * *` schedule), which is far too
	// slow for live football scoring. To get true per-minute polling during
	// match windows, this route enqueues the next call to itself via QStash
	// with a 60s delay. The chain self-terminates when hasActiveFixture()
	// returns false at the top of a future call. The hourly heartbeat from
	// GitHub Actions restarts the chain after any breakage.
	await enqueuePollScores(60)

	return NextResponse.json({ updated: totalUpdated, chained: true })
}
