import { eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { serializeError } from '@/lib/cron/serialize-error'
import { FootballDataAdapter, resolveFootballDataCode } from '@/lib/data/football-data'
import { hasActiveFixture } from '@/lib/data/match-window'
import { enqueueCompetitionSync, enqueuePollScores } from '@/lib/data/qstash'
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

	try {
		return await pollScores(apiKey)
	} catch (err) {
		const serialized = serializeError(err)
		console.error('[cron/poll-scores] failed', serialized)
		return NextResponse.json({ error: serialized }, { status: 500 })
	}
}

async function pollScores(apiKey: string): Promise<NextResponse> {
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
		.select({
			id: fixture.id,
			kickoff: fixture.kickoff,
			roundId: fixture.roundId,
			status: fixture.status,
		})
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
	// Resolve each external code back to its competition (id + type) so we can
	// trigger a bracket re-sync after a knockout fixture finishes.
	const compByCode = new Map<string, { id: string; type: string }>()
	for (const g of activeGames) {
		const code = resolveFootballDataCode(g.competition)
		if (code) compByCode.set(code, { id: g.competition.id, type: g.competition.type })
	}

	let totalUpdated = 0
	// Competitions whose bracket should be re-synced because a knockout-stage
	// fixture just finished (its result may confirm the next round's matchups).
	const syncCompetitionIds = new Set<string>()

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
						regularHomeScore: score.regularHomeScore ?? null,
						regularAwayScore: score.regularAwayScore ?? null,
						status: score.status,
						winner: score.winner ?? null,
					})
					.where(eq(fixture.id, existing.id))

				// Capture any transition into a terminal state (finished or
				// cancelled). settleFixture internally dispatches to the void
				// path when the new status is cancelled.
				const wasTerminal = existing.status === 'finished' || existing.status === 'cancelled'
				const nowTerminal = score.status === 'finished' || score.status === 'cancelled'
				if (!wasTerminal && nowTerminal) {
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

			// A finished group_knockout fixture from matchday 3 onward (the
			// group→knockout boundary and every knockout round) may confirm the
			// next round's matchups — flag the competition for a re-sync.
			const comp = compByCode.get(code)
			if (
				transitionedFixtureIds.length > 0 &&
				comp?.type === 'group_knockout' &&
				roundData.number >= 3
			) {
				syncCompetitionIds.add(comp.id)
			}
		}
	}

	// Populate the next round's fixtures (and advance/open rounds) shortly after a
	// knockout match settles — keeps the bracket current as the tournament plays
	// out, independent of the daily cron. Deduped + delayed inside the helper.
	for (const compId of syncCompetitionIds) {
		try {
			await enqueueCompetitionSync(compId)
		} catch (e) {
			console.warn('[poll-scores] enqueueCompetitionSync failed', e)
		}
	}

	// Self-perpetuating chain: GitHub Actions free-tier crons run every ~60-90
	// minutes in practice (despite the `* * * * *` schedule), too slow for live
	// football scoring. This route enqueues the next call to itself via QStash to
	// poll at the chain interval during match windows; it self-terminates when
	// hasActiveFixture() returns false on a future call, and the GitHub Actions
	// heartbeat restarts it after any breakage. enqueuePollScores grid-aligns +
	// dedups the next link, so concurrent chains collapse into one (quota-safe).
	await enqueuePollScores()

	return NextResponse.json({ updated: totalUpdated, chained: true })
}
