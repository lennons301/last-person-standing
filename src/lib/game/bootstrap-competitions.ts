import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { type FdCurrentSeason, FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter, type FplPreFetched } from '@/lib/data/fpl'
import { enqueuePollScoresAt } from '@/lib/data/qstash'
import type { AdapterStanding, CompetitionAdapter } from '@/lib/data/types'
import { WC_2026_POTS } from '@/lib/data/wc-pots'
import { db } from '@/lib/db'
import { settleFixture } from '@/lib/game/settle'
import {
	findByTeamPair,
	type PlannerRound,
	planKnockoutSeeding,
} from '@/lib/game-logic/knockout-bracket'
import { competition, fixture, round, team } from '@/lib/schema/competition'

export interface BootstrapOptions {
	footballDataApiKey?: string
	// Pre-fetched FPL payloads — required in production because FPL's
	// Cloudflare 403s Vercel egress (see /api/cron/daily-sync). GH Actions
	// fetches and ships them in the POST body.
	fplData?: FplPreFetched
}

type CompetitionRow = typeof competition.$inferSelect

/**
 * Season detection could not produce a trustworthy answer (source data
 * missing, malformed, or the two sources disagree). Always fatal: the sync
 * must abort with zero writes rather than guess a season — a wrong guess is
 * exactly how the 2026/27 silent-corruption incident happened.
 */
export class SeasonDetectionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SeasonDetectionError'
	}
}

/**
 * Derive the PL season label (e.g. '2026/27') from football-data's explicit
 * `currentSeason`, cross-checked against the year of FPL's Gameweek 1
 * deadline. Throws SeasonDetectionError on any absence, malformed dates, or
 * disagreement between the sources — it never guesses.
 */
export function deriveSeasonLabel(
	fdSeason: FdCurrentSeason | null,
	fplGw1Deadline: Date | null,
): string {
	if (!fdSeason) {
		throw new SeasonDetectionError(
			'football-data reported no currentSeason for the PL — cannot derive the season; aborting sync',
		)
	}
	const startYear = new Date(fdSeason.startDate).getUTCFullYear()
	const endYear = new Date(fdSeason.endDate).getUTCFullYear()
	if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
		throw new SeasonDetectionError(
			`football-data currentSeason dates are unparseable (startDate=${fdSeason.startDate}, endDate=${fdSeason.endDate}); aborting sync`,
		)
	}
	if (endYear !== startYear + 1) {
		throw new SeasonDetectionError(
			`football-data currentSeason is not a cross-year league season (startDate=${fdSeason.startDate}, endDate=${fdSeason.endDate}); aborting sync`,
		)
	}
	if (!fplGw1Deadline || Number.isNaN(fplGw1Deadline.getTime())) {
		throw new SeasonDetectionError(
			'FPL bootstrap carries no Gameweek 1 deadline — cannot cross-check the season; aborting sync',
		)
	}
	const fplYear = fplGw1Deadline.getUTCFullYear()
	if (fplYear !== startYear) {
		throw new SeasonDetectionError(
			`season disagreement: football-data currentSeason starts in ${startYear} but FPL's Gameweek 1 deadline is in ${fplYear} (${fplGw1Deadline.toISOString()}); aborting sync`,
		)
	}
	return `${startYear}/${String(endYear).slice(-2)}`
}

/**
 * Detect the current PL season from the sources and return the competition
 * row to sync into, creating it (and archiving its predecessor) when the
 * season has rolled over. Runs BEFORE any sync writes so a detection failure
 * (SeasonDetectionError) aborts the run with zero writes.
 *
 * Idempotent: once the detected season's competition exists and is the only
 * active fpl-sourced one, this is a pure read.
 */
export async function ensureCurrentPlSeasonCompetition(
	opts: BootstrapOptions,
): Promise<CompetitionRow> {
	if (!opts.footballDataApiKey) {
		throw new SeasonDetectionError(
			'FOOTBALL_DATA_API_KEY is not configured — season detection needs football-data currentSeason; aborting sync',
		)
	}
	const fplAdapter = new FplAdapter(opts.fplData)
	const fdAdapter = new FootballDataAdapter('PL', opts.footballDataApiKey)
	const [fdSeason, fplGw1Deadline] = await Promise.all([
		fdAdapter.fetchCurrentSeason(),
		fplAdapter.fetchGw1Deadline(),
	])
	const season = deriveSeasonLabel(fdSeason, fplGw1Deadline)

	const existing = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'fpl'), eq(competition.season, season)),
	})
	if (existing?.status === 'archived') {
		// An archived competition is permanently immutable — if the CURRENT
		// season's row is archived, something is wrong (manual intervention?).
		// Abort rather than resurrect it or create a duplicate.
		throw new Error(
			`detected current PL season ${season}, but competition "${existing.name}" (${existing.id}) is archived — refusing to sync into an archived season`,
		)
	}

	// Any other still-active fpl-sourced competition is a predecessor season.
	const predecessors = (
		await db.query.competition.findMany({
			where: and(eq(competition.dataSource, 'fpl'), eq(competition.status, 'active')),
		})
	).filter((c) => c.season !== season)

	// Steady state: the detected season's competition is the only active one.
	if (existing && predecessors.length === 0) return existing

	// Create the new season's competition and archive its predecessors in one
	// transaction so a crash can never leave two active PL competitions.
	return await db.transaction(async (tx) => {
		let current = existing
		if (!current) {
			const [created] = await tx
				.insert(competition)
				.values({
					name: `Premier League ${season}`,
					type: 'league',
					dataSource: 'fpl',
					season,
					status: 'active',
				})
				.returning()
			current = created
			console.warn(
				`[bootstrap] season rollover: created "${created.name}" (${created.id}) for detected PL season ${season}`,
			)
		}
		for (const old of predecessors) {
			await tx.update(competition).set({ status: 'archived' }).where(eq(competition.id, old.id))
			console.warn(
				`[bootstrap] season rollover: archived predecessor "${old.name}" (${old.id}) — superseded by "${current.name}" (${current.id})`,
			)
		}
		return current
	})
}

export async function bootstrapCompetitions(opts: BootstrapOptions): Promise<void> {
	const pl = await ensureCurrentPlSeasonCompetition(opts)

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
// Only pre-schedule polls for fixtures within 2 days. daily-sync runs daily, so
// each fixture still gets its kickoff trigger queued ~1-2 days out, but a 7-day
// window made every daily run re-publish a week of fixtures — wasted QStash
// quota (free-tier 1000/day). The single-chain dedup (enqueuePollScores) means
// even if several of these triggers fire at once they converge to one chain.
const PRE_SCHEDULE_LOOKAHEAD_MS = 2 * 24 * 60 * 60 * 1000

export async function scheduleUpcomingFixturePolls(): Promise<void> {
	const now = new Date()
	const lookahead = new Date(now.getTime() + PRE_SCHEDULE_LOOKAHEAD_MS)
	// Join up to the competition so archived competitions never get polls
	// enqueued — their fixtures are history, not upcoming matches.
	const upcoming = await db
		.select({ id: fixture.id, kickoff: fixture.kickoff })
		.from(fixture)
		.innerJoin(round, eq(fixture.roundId, round.id))
		.innerJoin(competition, eq(round.competitionId, competition.id))
		.where(
			and(
				gt(fixture.kickoff, now),
				lt(fixture.kickoff, lookahead),
				eq(competition.status, 'active'),
			),
		)

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

export function fdTlaForFplShortName(fplShortName: string): string {
	return FPL_TO_FD_TLA[fplShortName] ?? fplShortName
}

/**
 * A competition's rounds with their fixtures — the scope boundary for every
 * sync-owned mutation. External ids are unique only within (competition,
 * data source), so matching always starts from this set, never the whole
 * fixture or team table.
 */
function competitionRoundsWithFixtures(competitionId: string) {
	return db.query.round.findMany({
		where: eq(round.competitionId, competitionId),
		with: { fixtures: true },
	})
}

/**
 * Write source standings into team.leaguePosition, resolved strictly through
 * the given external-id → team-UUID map (payload-built in syncCompetition,
 * merge-built in mergeFootballDataIds) so writes stay within the competition
 * being synced. Rows whose team is not in the map are skipped. Feeds the
 * pick-UI ordinals and the auto-pick worst-placed-team ordering.
 */
async function persistLeaguePositions(
	standings: AdapterStanding[],
	teamIdByExternalId: Map<string, string>,
): Promise<void> {
	for (const row of standings) {
		const teamId = teamIdByExternalId.get(row.teamExternalId)
		if (!teamId) continue
		await db.update(team).set({ leaguePosition: row.position }).where(eq(team.id, teamId))
	}
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
	// Same immutability rule as syncCompetition: never touch an archived
	// competition's team/fixture external ids.
	if (comp.status === 'archived') return
	if (!comp.externalId && comp.dataSource !== 'fpl') return // PL is the only fpl source today
	const fdCode = comp.externalId ?? 'PL'
	const fdAdapter = new FootballDataAdapter(fdCode, apiKey)

	// Pull football-data teams + rounds (with embedded fixtures).
	const fdTeams = await fdAdapter.fetchTeams()
	const fdRounds = await fdAdapter.fetchRounds()

	// Everything this merge touches must belong to the competition being
	// merged (same identity rule as syncCompetition's upsert scoping). The
	// competition's fixtures define its team set — matching by tla over the
	// whole team table could hit another competition's row (e.g. a WC country
	// sharing a promoted club's code) and rewrite its badge + football-data id.
	const ourRounds = await competitionRoundsWithFixtures(comp.id)
	const compTeamIds = new Set<string>()
	for (const r of ourRounds) {
		for (const f of r.fixtures) {
			compTeamIds.add(f.homeTeamId)
			compTeamIds.add(f.awayTeamId)
		}
	}
	const teamsInCompetition = async () =>
		(await db.query.team.findMany({})).filter((t) => compTeamIds.has(t.id))

	// 1) Merge football-data team IDs onto this competition's teams via
	// short_name === tla (with the FPL_TO_FD_TLA alias map covering NFO → NOT).
	const ourTeams = await teamsInCompetition()
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

	// 3) Persist current league standings into team.leaguePosition, resolved
	// through the football-data ids merged in step 1. The FPL adapter has no
	// standings source, so this merge step is what makes positions real for
	// FPL-bootstrapped competitions.
	await persistLeaguePositions(await fdAdapter.fetchStandings(), ourTeamIdByFdId)

	// 4) Coverage assertion. Self-diagnosing for the next time the FPL/football-
	// data data shape drifts (likely each August when promoted PL teams arrive).
	// Fails loudly on team-level gaps because every PL team must be matchable
	// for live scoring to work; warns on fixture-level gaps because rescheduled
	// or yet-to-be-published fixtures may legitimately be absent from
	// football-data temporarily. Scoped to this competition's teams — a dormant
	// relegated club's row (stale fpl id, no current-season fd merge) plays no
	// part here and must not trip the loud failure.
	const refreshedTeams = await teamsInCompetition()
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

	const fixturesAll = (await competitionRoundsWithFixtures(comp.id)).flatMap((r) => r.fixtures)
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
): Promise<{
	rounds: number
	fixtures: number
	deadlinePassedRoundIds: string[]
	settledFixtureIds: string[]
}> {
	// Archived competitions are immutable — their rounds, fixtures, and external
	// ids must never change again. The daily-sync loop only enumerates active
	// competitions, but this guard is the structural backstop for every other
	// path that reaches here (stale QStash sync_competition jobs, the hardcoded
	// bootstrap lookups, future callers).
	if (comp.status === 'archived') {
		console.warn(`[syncCompetition] skipping archived competition ${comp.id} (${comp.name})`)
		return { rounds: 0, fixtures: 0, deadlinePassedRoundIds: [], settledFixtureIds: [] }
	}
	const adapter = adapterFor(comp, opts)
	if (!adapter) return { rounds: 0, fixtures: 0, deadlinePassedRoundIds: [], settledFixtureIds: [] }

	const key = comp.dataSource === 'fpl' ? 'fpl' : 'football_data'
	const adapterTeams = await adapter.fetchTeams()
	// Resolve payload team ids to club rows through the payload itself (club
	// identity = name). Source-assigned ids restart and get reshuffled across
	// clubs every season (FPL), so they must never be resolved through ids
	// stored on team rows by an earlier season — a relegated club's stale id
	// would swallow the promoted club that inherited it.
	const teamIdByPayloadId = new Map<string, string>()
	for (const at of adapterTeams) {
		const existing = await db.query.team.findFirst({ where: eq(team.name, at.name) })
		if (existing) {
			await db
				.update(team)
				.set({
					// For FPL-sourced competitions, never write the constructed FPL
					// badge URL over what we have: the football-data crest (set by
					// mergeFootballDataIds) is the durable badge, the FPL CDN 404s
					// for promoted clubs, and the merge that would re-fix a stomped
					// crest is exactly the step that fails loudly on a new-season
					// tla gap.
					badgeUrl:
						comp.dataSource === 'fpl' ? existing.badgeUrl : (at.badgeUrl ?? existing.badgeUrl),
					externalIds: { ...(existing.externalIds ?? {}), [key]: at.externalId },
				})
				.where(eq(team.id, existing.id))
			teamIdByPayloadId.set(at.externalId, existing.id)
		} else {
			const [created] = await db
				.insert(team)
				.values({
					name: at.name,
					shortName: at.shortName,
					// FPL's badge CDN 404s for clubs it has never hosted before
					// (newly promoted), so an unseen club gets no badge here — the
					// UI colour fallback applies until mergeFootballDataIds lands
					// the football-data crest in the same bootstrap pass.
					badgeUrl: comp.dataSource === 'fpl' ? null : at.badgeUrl,
					externalIds: { [key]: at.externalId },
				})
				.returning()
			teamIdByPayloadId.set(at.externalId, created.id)
		}
	}

	// Persist latest league standings into team.leaguePosition when the adapter
	// supports standings. Resolved through the current payload's team list so
	// updates stay within this competition's own teams.
	if (typeof adapter.fetchStandings === 'function') {
		await persistLeaguePositions(await adapter.fetchStandings(), teamIdByPayloadId)
	}

	// Fixture upsert matching is scoped to this competition's own rounds:
	// external ids are unique only within (competition, data source), so a
	// global match would let restarted FPL ids rewrite another season's rows
	// in place (the 2026/27 silent-corruption incident).
	const compRoundsForUpsert = await competitionRoundsWithFixtures(comp.id)
	const compFixtureByExternalId = new Map<
		string,
		(typeof compRoundsForUpsert)[number]['fixtures'][number]
	>()
	for (const r of compRoundsForUpsert) {
		for (const f of r.fixtures) {
			if (f.externalId != null) compFixtureByExternalId.set(f.externalId, f)
		}
	}

	const adapterRounds = await adapter.fetchRounds()
	let totalFixtures = 0
	const deadlinePassedRoundIds: string[] = []
	// Fixtures whose status transitioned non-finished → finished during this
	// sync run. Settled after the loop so the round/fixture writes are all
	// committed first, then per-fixture pick settlement runs against the
	// final state.
	const transitionedToFinishedIds: string[] = []
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
		// Prefer the deadline from playable (drawn) fixtures; fall back to the
		// all-matches schedule so a knockout round carries a correct deadline even
		// before its bracket is drawn (the R16 pre-draw incident).
		const roundDeadline = ar.deadline ?? ar.allMatchesDeadline
		if (existingRound) {
			roundId = existingRound.id
			await db
				.update(round)
				.set({
					name: ar.name,
					deadline: roundDeadline,
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
					deadline: roundDeadline,
					status: newStatus,
				})
				.returning()
			roundId = created.id
		}

		if (deadlineHasPassed) {
			deadlinePassedRoundIds.push(roundId)
		}

		// Provisional (source-less) fixtures we may have seeded ahead of the draw.
		// Tier 1 binds them to the real match by team pair when the source draws.
		const unboundRoundFixtures = await db.query.fixture.findMany({
			where: and(eq(fixture.roundId, roundId), isNull(fixture.externalId)),
		})

		for (const af of ar.fixtures) {
			const homeTeamId = teamIdByPayloadId.get(af.homeTeamExternalId)
			const awayTeamId = teamIdByPayloadId.get(af.awayTeamExternalId)
			if (!homeTeamId || !awayTeamId) continue

			const existingFixture = compFixtureByExternalId.get(af.externalId)
			// A provisional tie we seeded for this same matchup, not yet bound.
			const provisional = existingFixture
				? undefined
				: findByTeamPair(homeTeamId, awayTeamId, unboundRoundFixtures)
			if (existingFixture) {
				await db
					.update(fixture)
					.set({
						kickoff: af.kickoff,
						status: af.status,
						homeScore: af.homeScore,
						awayScore: af.awayScore,
						regularHomeScore: af.regularHomeScore ?? null,
						regularAwayScore: af.regularAwayScore ?? null,
						winner: af.winner ?? null,
						externalIds: {
							...((existingFixture.externalIds as Record<string, string | number>) ?? {}),
							[key]: af.externalId,
						},
					})
					.where(eq(fixture.id, existingFixture.id))
				// Capture transition for post-loop settlement. Settlement covers
				// both happy-path (finished with scores) and cancellation
				// (cancelled / postponed → cancelled). settleFixture routes
				// internally to the void path when status is cancelled.
				const wasTerminal =
					existingFixture.status === 'finished' || existingFixture.status === 'cancelled'
				const nowTerminal =
					af.status === 'finished' || af.status === 'cancelled' || af.status === 'postponed'
				if (!wasTerminal && nowTerminal) {
					transitionedToFinishedIds.push(existingFixture.id)
				}
			} else if (provisional) {
				// Bind the provisional tie to the real match: adopt the source's
				// externalId, kickoff, scores AND home/away orientation (picks reference
				// teamId, so re-orienting is pick-safe). This is the ONLY correct way to
				// resolve a slot — by teams, never by a guessed bracket position.
				await db
					.update(fixture)
					.set({
						homeTeamId,
						awayTeamId,
						kickoff: af.kickoff,
						status: af.status,
						homeScore: af.homeScore,
						awayScore: af.awayScore,
						regularHomeScore: af.regularHomeScore ?? null,
						regularAwayScore: af.regularAwayScore ?? null,
						winner: af.winner ?? null,
						externalId: af.externalId,
						externalIds: { [key]: af.externalId },
					})
					.where(eq(fixture.id, provisional.id))
				const nowTerminal =
					af.status === 'finished' || af.status === 'cancelled' || af.status === 'postponed'
				if (nowTerminal) transitionedToFinishedIds.push(provisional.id)
			} else {
				await db.insert(fixture).values({
					roundId,
					homeTeamId,
					awayTeamId,
					kickoff: af.kickoff,
					status: af.status,
					homeScore: af.homeScore,
					awayScore: af.awayScore,
					regularHomeScore: af.regularHomeScore ?? null,
					regularAwayScore: af.regularAwayScore ?? null,
					winner: af.winner ?? null,
					externalId: af.externalId,
					externalIds: { [key]: af.externalId },
				})
				totalFixtures++
			}
		}
	}

	// Tier 2: seed not-yet-drawn knockout ties from finished feeders, so a
	// survivor game has the full set of pickable teams before the round deadline
	// even when the source lags the bracket draw (the R16 pre-draw incident).
	// Provisional fixtures are UNBOUND (externalId=null) — Tier 1 binds them to
	// the real match by team pair once the source draws it. Derivation is
	// self-validated; unvalidatable rounds are skipped, not guessed.
	totalFixtures += await seedProvisionalKnockoutTies(comp.id, adapterRounds, key)

	// Run per-fixture settlement for every fixture that flipped finished
	// during this sync. Done after the loop so all related round/fixture
	// rows are committed and settle reads consistent state.
	for (const fid of transitionedToFinishedIds) {
		await settleFixture(fid)
	}

	return {
		rounds: adapterRounds.length,
		fixtures: totalFixtures,
		deadlinePassedRoundIds,
		settledFixtureIds: transitionedToFinishedIds,
	}
}

/**
 * Derive and insert the not-yet-drawn ties for every knockout round whose feeder
 * has finished. Returns the number of fixtures seeded. Idempotent: a tie already
 * present (bound or provisional, either orientation) is not re-seeded.
 */
async function seedProvisionalKnockoutTies(
	competitionId: string,
	adapterRounds: { number: number; isKnockout: boolean; allMatchesDeadline: Date | null }[],
	key: string,
): Promise<number> {
	const dbRounds = await competitionRoundsWithFixtures(competitionId)
	const metaByNumber = new Map(adapterRounds.map((r) => [r.number, r]))

	const plannerRounds: PlannerRound[] = dbRounds.map((r) => ({
		number: r.number,
		isKnockout: metaByNumber.get(r.number)?.isKnockout ?? false,
		fixtures: r.fixtures.map((f) => {
			const fdId = (f.externalIds as Record<string, string | number> | null)?.[key]
			return {
				externalId: fdId != null ? String(fdId) : (f.externalId ?? null),
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				status: f.status,
				winner: f.winner,
			}
		}),
	}))

	const { plan, skipped } = planKnockoutSeeding(plannerRounds)
	for (const s of skipped) {
		// Only worth surfacing when a knockout round could not be filled despite a
		// finished feeder — a missing-teams / broken-convention signal for humans.
		if (
			metaByNumber.get(s.roundNumber)?.isKnockout &&
			metaByNumber.get(s.roundNumber - 1)?.isKnockout
		) {
			console.warn(`[syncCompetition] knockout round ${s.roundNumber} not seeded: ${s.reason}`)
		}
	}

	let seeded = 0
	for (const entry of plan) {
		const dbRound = dbRounds.find((r) => r.number === entry.roundNumber)
		if (!dbRound) continue
		// Benign placeholder kickoff (round's earliest scheduled match); Tier 1
		// overwrites it with the exact per-match kickoff on bind.
		const deadline = metaByNumber.get(entry.roundNumber)?.allMatchesDeadline ?? null
		const placeholderKickoff = deadline ? new Date(deadline.getTime() + 90 * 60 * 1000) : null
		for (const tie of entry.ties) {
			await db.insert(fixture).values({
				roundId: dbRound.id,
				homeTeamId: tie.homeTeamId,
				awayTeamId: tie.awayTeamId,
				kickoff: placeholderKickoff,
				status: 'scheduled',
				externalId: null,
				externalIds: {},
			})
			seeded++
		}
		console.log(
			`[syncCompetition] seeded ${entry.ties.length} provisional ${dbRound.name} tie(s) [${entry.validation}]`,
		)
	}
	return seeded
}

export async function applyPotAssignments(
	competitionId: string,
): Promise<{ matched: number; unmatched: string[] }> {
	// Pot tags land on team rows via external_ids — a sync-owned mutation, so
	// the archived-competition immutability rule applies here too.
	const comp = await db.query.competition.findFirst({
		where: eq(competition.id, competitionId),
	})
	if (!comp || comp.status === 'archived') return { matched: 0, unmatched: [] }
	const rounds = await competitionRoundsWithFixtures(competitionId)
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
	if (comp.dataSource === 'fpl') return new FplAdapter(opts.fplData)
	if (comp.dataSource === 'football_data') {
		if (!opts.footballDataApiKey) return null
		if (!comp.externalId) return null
		return new FootballDataAdapter(comp.externalId, opts.footballDataApiKey)
	}
	return null
}
