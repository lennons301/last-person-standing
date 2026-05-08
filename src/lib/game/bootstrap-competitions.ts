import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter } from '@/lib/data/fpl'
import { enqueuePollScoresAt } from '@/lib/data/qstash'
import type { CompetitionAdapter } from '@/lib/data/types'
import { WC_2026_POTS } from '@/lib/data/wc-pots'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'

export interface BootstrapOptions {
	footballDataApiKey?: string
}

type CompetitionRow = typeof competition.$inferSelect

export async function bootstrapCompetitions(opts: BootstrapOptions): Promise<void> {
	let pl = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'fpl'), eq(competition.season, '2025/26')),
	})
	if (!pl) {
		const [created] = await db
			.insert(competition)
			.values({
				name: 'Premier League 2025/26',
				type: 'league',
				dataSource: 'fpl',
				season: '2025/26',
				status: 'active',
			})
			.returning()
		pl = created
	}

	let wc = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'football_data'), eq(competition.externalId, 'WC')),
	})
	if (!wc) {
		const [created] = await db
			.insert(competition)
			.values({
				name: 'FIFA World Cup 2026',
				type: 'group_knockout',
				dataSource: 'football_data',
				externalId: 'WC',
				season: '2026',
				status: 'active',
			})
			.returning()
		wc = created
	}

	await syncCompetition(pl, opts)
	if (pl.dataSource === 'fpl' && opts.footballDataApiKey) {
		await mergeFootballDataIds(pl, opts.footballDataApiKey)
	}
	await syncCompetition(wc, opts)
	await applyPotAssignments(wc.id)

	// Pre-schedule a poll-scores trigger for each upcoming fixture across both
	// competitions. Without this, the live-score chain only restarts when the
	// GitHub Actions heartbeat happens to fire during a match window — and on
	// the free tier those run every ~60-90 minutes. A 90-min match could end
	// without the chain ever waking.
	await scheduleUpcomingFixturePolls()
}

/**
 * For every fixture whose kickoff is in the future (and within a 7-day
 * lookahead — beyond that we'd risk QStash dedup expiring before the message
 * fires), enqueue a single QStash trigger scheduled for `kickoff − 10 min`.
 * The trigger hits /api/cron/poll-scores, which starts a self-perpetuating
 * chain that runs through the match window and self-terminates.
 *
 * Idempotent within QStash's dedup window: re-running this within ~10 min
 * (e.g. multiple bootstrap calls in quick succession) won't queue duplicates.
 * Across longer intervals (the daily cron), duplicates are technically possible
 * but harmless — each just starts a redundant chain that converges on the same
 * DB state.
 */
const PRE_SCHEDULE_LEAD_MS = 10 * 60 * 1000
const PRE_SCHEDULE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000

export async function scheduleUpcomingFixturePolls(): Promise<void> {
	const now = new Date()
	const lookahead = new Date(now.getTime() + PRE_SCHEDULE_LOOKAHEAD_MS)
	const upcoming = await db
		.select({ id: fixture.id, kickoff: fixture.kickoff })
		.from(fixture)
		.where(and(gt(fixture.kickoff, now), lt(fixture.kickoff, lookahead)))

	for (const f of upcoming) {
		if (!f.kickoff) continue
		const triggerAt = new Date(f.kickoff.getTime() - PRE_SCHEDULE_LEAD_MS)
		// Don't schedule for moments already past — covers the edge case where a
		// fixture's kickoff is closer than the lead window.
		if (triggerAt <= now) continue
		// Stable dedup id per fixture+trigger so a second bootstrap inside the
		// QStash dedup window is a no-op. Use epoch ms (not ISO) because QStash
		// rejects deduplication IDs containing `:`. If a fixture's kickoff is
		// rescheduled, it gets a different epoch → different dedup key.
		const dedupId = `poll-fixture-${f.id}-${triggerAt.getTime()}`
		try {
			await enqueuePollScoresAt(triggerAt, dedupId)
		} catch (e) {
			// Don't fail the whole bootstrap if a single enqueue errors.
			console.warn(`[scheduleUpcomingFixturePolls] enqueue failed for fixture ${f.id}`, e)
		}
	}
}

/**
 * Alias for the (rare) cases where FPL and football-data disagree on a team's
 * 3-letter code. Map: FPL `short_name` → football-data `tla`.
 *
 * Known mismatches:
 * - Nottingham Forest: FPL `NFO`, football-data `NOT`. Confirmed 2026-05-03
 *   on the 2025/26 PL season — every other PL team's tla aligns across sources.
 *
 * If a new mismatch surfaces (e.g. promoted team next season), add an entry
 * here and re-run bootstrap.
 */
const FPL_TO_FD_TLA: Record<string, string> = {
	NFO: 'NOT',
}

function fdTlaForFplShortName(fplShortName: string): string {
	return FPL_TO_FD_TLA[fplShortName] ?? fplShortName
}

/**
 * For competitions whose primary adapter is FPL, this fetches the same matchdays
 * from football-data.org and merges football-data IDs into existing teams +
 * fixtures. The FPL adapter remains the source of truth for round structure
 * (deadlines, names, finished flag); football-data IDs are added so live-score
 * polling — which uses football-data.org — can match against the right rows.
 *
 * Matching strategy:
 * - Teams: match our `team.short_name` against football-data's `tla`, with the
 *   `FPL_TO_FD_TLA` alias map covering the known mismatch (NFO → NOT).
 * - Fixtures: within a round (same `matchday` number), match by the resolved
 *   home/away team UUIDs. We do NOT trust kickoff times to match exactly — FPL
 *   sometimes has slightly older snapshots than football-data after a match
 *   reschedule.
 *
 * Idempotent: re-running this on already-merged data is a no-op.
 */
export async function mergeFootballDataIds(comp: CompetitionRow, apiKey: string): Promise<void> {
	if (!comp.externalId && comp.dataSource !== 'fpl') return // PL is the only fpl source today
	const fdCode = comp.externalId ?? 'PL'
	const fdAdapter = new FootballDataAdapter(fdCode, apiKey)

	// Pull football-data teams + rounds (with embedded fixtures).
	const fdTeams = await fdAdapter.fetchTeams()
	const fdRounds = await fdAdapter.fetchRounds()

	// 1) Merge football-data team IDs onto our teams via short_name === tla
	// (with the FPL_TO_FD_TLA alias map covering the NFO → NOT case).
	const ourTeams = await db.query.team.findMany({})
	const ourTeamIdByFdId = new Map<string, string>() // football-data id -> our team UUID
	for (const fdTeam of fdTeams) {
		const ourTeam = ourTeams.find((t) => fdTlaForFplShortName(t.shortName) === fdTeam.shortName)
		if (!ourTeam) continue
		ourTeamIdByFdId.set(fdTeam.externalId, ourTeam.id)
		await db
			.update(team)
			.set({
				externalIds: {
					...((ourTeam.externalIds as Record<string, string | number>) ?? {}),
					football_data: fdTeam.externalId,
				},
				// Prefer football-data's crest URL — works for newly-promoted PL teams
				// where the FPL CDN URL (`/badges/rb/t{code}.svg`) returns 404.
				...(fdTeam.badgeUrl ? { badgeUrl: fdTeam.badgeUrl } : {}),
			})
			.where(eq(team.id, ourTeam.id))
	}

	// 2) Merge football-data fixture IDs onto our fixtures via (home, away) team
	// UUIDs alone — NOT including matchday. Rescheduled matches sometimes end
	// up under a different matchday in football-data than the FPL gameweek
	// they're tracked under in our DB. Since each PL pairing happens exactly
	// once per home venue per season, (home, away) is a unique key across the
	// whole competition and gives us a one-shot match regardless of round.
	const ourRounds = await db.query.round.findMany({
		where: eq(round.competitionId, comp.id),
		with: { fixtures: true },
	})
	const ourFixtureByPair = new Map<string, (typeof ourRounds)[number]['fixtures'][number]>()
	for (const r of ourRounds) {
		for (const f of r.fixtures) {
			ourFixtureByPair.set(`${f.homeTeamId}|${f.awayTeamId}`, f)
		}
	}

	for (const fdRound of fdRounds) {
		for (const fdFx of fdRound.fixtures) {
			const ourHomeId = ourTeamIdByFdId.get(fdFx.homeTeamExternalId)
			const ourAwayId = ourTeamIdByFdId.get(fdFx.awayTeamExternalId)
			if (!ourHomeId || !ourAwayId) continue
			const ourFx = ourFixtureByPair.get(`${ourHomeId}|${ourAwayId}`)
			if (!ourFx) continue
			await db
				.update(fixture)
				.set({
					externalIds: {
						...((ourFx.externalIds as Record<string, string | number>) ?? {}),
						football_data: fdFx.externalId,
					},
				})
				.where(eq(fixture.id, ourFx.id))
		}
	}

	// 3) Coverage assertion. Self-diagnosing for the next time the FPL/football-
	// data data shape drifts (likely each August when promoted PL teams arrive).
	// Fails loudly on team-level gaps because every PL team must be matchable
	// for live scoring to work; warns on fixture-level gaps because rescheduled
	// or yet-to-be-published fixtures may legitimately be absent from
	// football-data temporarily.
	const refreshedTeams = await db.query.team.findMany({})
	const fplTeams = refreshedTeams.filter(
		(t) => (t.externalIds as Record<string, string | number> | null)?.fpl != null,
	)
	const teamsMissing = fplTeams.filter(
		(t) => (t.externalIds as Record<string, string | number> | null)?.football_data == null,
	)
	if (teamsMissing.length > 0) {
		const detail = teamsMissing.map((t) => `${t.shortName} (${t.name})`).join(', ')
		throw new Error(
			`mergeFootballDataIds: ${teamsMissing.length}/${fplTeams.length} FPL team(s) missing football-data IDs after merge: ${detail}. Likely tla mismatch — add to FPL_TO_FD_TLA alias map.`,
		)
	}

	const fixturesAll = (
		await db.query.round.findMany({
			where: eq(round.competitionId, comp.id),
			with: { fixtures: true },
		})
	).flatMap((r) => r.fixtures)
	const fixturesMissing = fixturesAll.filter(
		(f) => (f.externalIds as Record<string, string | number> | null)?.football_data == null,
	)
	if (fixturesMissing.length > 0) {
		console.warn(
			`[mergeFootballDataIds] ${fixturesMissing.length}/${fixturesAll.length} fixtures still missing football-data IDs after merge. Usually rescheduled or not yet published; will be filled on a future bootstrap run. First few: ${fixturesMissing
				.slice(0, 5)
				.map((f) => f.id)
				.join(', ')}`,
		)
	}
}

export async function syncCompetition(
	comp: CompetitionRow,
	opts: BootstrapOptions,
): Promise<{ rounds: number; fixtures: number; deadlinePassedRoundIds: string[] }> {
	const adapter = adapterFor(comp, opts)
	if (!adapter) return { rounds: 0, fixtures: 0, deadlinePassedRoundIds: [] }

	const key = comp.dataSource === 'fpl' ? 'fpl' : 'football_data'
	const adapterTeams = await adapter.fetchTeams()
	for (const at of adapterTeams) {
		const existing = await db.query.team.findFirst({ where: eq(team.name, at.name) })
		if (existing) {
			await db
				.update(team)
				.set({
					badgeUrl: at.badgeUrl ?? existing.badgeUrl,
					externalIds: { ...(existing.externalIds ?? {}), [key]: at.externalId },
				})
				.where(eq(team.id, existing.id))
		} else {
			await db.insert(team).values({
				name: at.name,
				shortName: at.shortName,
				badgeUrl: at.badgeUrl,
				externalIds: { [key]: at.externalId },
			})
		}
	}

	const allTeams = await db.query.team.findMany({})

	// Persist latest league standings into team.leaguePosition when the adapter
	// supports standings. Scope by externalIds[key] so updates stay within this
	// competition's data source.
	if (typeof adapter.fetchStandings === 'function') {
		const standings = await adapter.fetchStandings()
		for (const row of standings) {
			const match = allTeams.find(
				(t) =>
					String((t.externalIds as Record<string, string | number> | null)?.[key]) ===
					row.teamExternalId,
			)
			if (!match) continue
			await db.update(team).set({ leaguePosition: row.position }).where(eq(team.id, match.id))
		}
	}

	const adapterRounds = await adapter.fetchRounds()
	let totalFixtures = 0
	const deadlinePassedRoundIds: string[] = []
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, comp.id), eq(round.number, ar.number)),
		})
		// Round status now follows game lifecycle, not wall-clock time:
		//   'upcoming' → 'open' on game creation / round advance (see api/games
		//                and process-round.ts:advanceGameToNextRound)
		//   'open' → 'completed' on processGameRound
		// Bootstrap only mirrors the adapter's `finished` flag (all fixtures
		// finished, so the round can be considered settled at the data layer)
		// and otherwise preserves whatever state the game lifecycle has set.
		const newStatus: 'upcoming' | 'open' | 'active' | 'completed' = ar.finished
			? 'completed'
			: (existingRound?.status ?? 'upcoming')
		let roundId: string
		// Detect deadlines that have just passed for an open round. Drives
		// processDeadlineLock (no-pick handler) — idempotent, so safe to fire on
		// subsequent sync runs until the round advances to 'completed'.
		const nowForDeadline = new Date()
		const deadlineHasPassed =
			!!existingRound &&
			existingRound.status === 'open' &&
			existingRound.deadline != null &&
			existingRound.deadline.getTime() <= nowForDeadline.getTime()
		if (existingRound) {
			roundId = existingRound.id
			await db
				.update(round)
				.set({
					name: ar.name,
					deadline: ar.deadline,
					status: newStatus,
				})
				.where(eq(round.id, existingRound.id))
		} else {
			const [created] = await db
				.insert(round)
				.values({
					competitionId: comp.id,
					number: ar.number,
					name: ar.name,
					deadline: ar.deadline,
					status: newStatus,
				})
				.returning()
			roundId = created.id
		}

		if (deadlineHasPassed) {
			deadlinePassedRoundIds.push(roundId)
		}

		for (const af of ar.fixtures) {
			const home = allTeams.find(
				(t) =>
					String((t.externalIds as Record<string, string | number> | null)?.[key]) ===
					af.homeTeamExternalId,
			)
			const away = allTeams.find(
				(t) =>
					String((t.externalIds as Record<string, string | number> | null)?.[key]) ===
					af.awayTeamExternalId,
			)
			if (!home || !away) continue

			const existingFixture = await db.query.fixture.findFirst({
				where: eq(fixture.externalId, af.externalId),
			})
			if (existingFixture) {
				await db
					.update(fixture)
					.set({
						kickoff: af.kickoff,
						status: af.status,
						homeScore: af.homeScore,
						awayScore: af.awayScore,
						externalIds: {
							...((existingFixture.externalIds as Record<string, string | number>) ?? {}),
							[key]: af.externalId,
						},
					})
					.where(eq(fixture.id, existingFixture.id))
			} else {
				await db.insert(fixture).values({
					roundId,
					homeTeamId: home.id,
					awayTeamId: away.id,
					kickoff: af.kickoff,
					status: af.status,
					homeScore: af.homeScore,
					awayScore: af.awayScore,
					externalId: af.externalId,
					externalIds: { [key]: af.externalId },
				})
				totalFixtures++
			}
		}
	}

	return { rounds: adapterRounds.length, fixtures: totalFixtures, deadlinePassedRoundIds }
}

export async function applyPotAssignments(
	competitionId: string,
): Promise<{ matched: number; unmatched: string[] }> {
	const rounds = await db.query.round.findMany({
		where: eq(round.competitionId, competitionId),
		with: { fixtures: true },
	})
	const teamIds = new Set<string>()
	for (const r of rounds) {
		for (const f of r.fixtures) {
			teamIds.add(f.homeTeamId)
			teamIds.add(f.awayTeamId)
		}
	}
	if (teamIds.size === 0) return { matched: 0, unmatched: [] }

	const teams = await db.query.team.findMany({
		where: inArray(team.id, [...teamIds]),
	})
	let matched = 0
	const unmatched: string[] = []
	for (const t of teams) {
		const fdId = (t.externalIds as Record<string, string | number> | null)?.football_data
		// Match by football-data ID first (when WC_2026_POTS has been backfilled
		// from /competitions/WC/teams), fall back to team name. Name matching
		// covers the common case today: pots are seeded with names only and
		// football-data uses canonical country names that align with the list.
		const entry =
			(fdId
				? WC_2026_POTS.find((p) => p.footballDataId && p.footballDataId === String(fdId))
				: undefined) ?? WC_2026_POTS.find((p) => p.name.toLowerCase() === t.name.toLowerCase())
		if (!entry) {
			unmatched.push(t.name)
			continue
		}
		await db
			.update(team)
			.set({
				externalIds: { ...(t.externalIds ?? {}), fifa_pot: entry.pot },
			})
			.where(eq(team.id, t.id))
		matched++
	}
	if (unmatched.length > 0) {
		console.warn(
			`[bootstrap] ${unmatched.length} WC team(s) not in WC_2026_POTS — cup tier-difference will be 0:`,
			unmatched.join(', '),
		)
	}
	return { matched, unmatched }
}

function adapterFor(comp: CompetitionRow, opts: BootstrapOptions): CompetitionAdapter | null {
	if (comp.dataSource === 'fpl') return new FplAdapter()
	if (comp.dataSource === 'football_data') {
		if (!opts.footballDataApiKey) return null
		if (!comp.externalId) return null
		return new FootballDataAdapter(comp.externalId, opts.footballDataApiKey)
	}
	return null
}
