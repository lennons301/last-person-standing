import { and, eq, inArray } from 'drizzle-orm'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter } from '@/lib/data/fpl'
import { enqueueAutoSubmit } from '@/lib/data/qstash'
import type { CompetitionAdapter } from '@/lib/data/types'
import { WC_2026_POTS } from '@/lib/data/wc-pots'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'
import { plannedPick } from '@/lib/schema/game'

export interface BootstrapOptions {
	footballDataApiKey?: string
}

const OPEN_WINDOW_MS = 48 * 3600 * 1000
const AUTO_SUBMIT_LEAD_MS = 60_000

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
}

/**
 * For competitions whose primary adapter is FPL, this fetches the same matchdays
 * from football-data.org and merges football-data IDs into existing teams +
 * fixtures. The FPL adapter remains the source of truth for round structure
 * (deadlines, names, finished flag); football-data IDs are added so live-score
 * polling — which uses football-data.org — can match against the right rows.
 *
 * Matching strategy:
 * - Teams: match our `team.short_name` against football-data's `tla`. PL team
 *   3-letter codes are stable and align across both sources.
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

	// 1) Merge football-data team IDs onto our teams via short_name === tla.
	const ourTeams = await db.query.team.findMany({})
	const ourTeamIdByFdId = new Map<string, string>() // football-data id -> our team UUID
	for (const fdTeam of fdTeams) {
		const ourTeam = ourTeams.find((t) => t.shortName === fdTeam.shortName)
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

	// 2) Merge football-data fixture IDs onto our fixtures via (matchday, home, away).
	const ourRounds = await db.query.round.findMany({
		where: eq(round.competitionId, comp.id),
		with: { fixtures: true },
	})
	const ourRoundsByNumber = new Map(ourRounds.map((r) => [r.number, r]))

	for (const fdRound of fdRounds) {
		const ourRound = ourRoundsByNumber.get(fdRound.number)
		if (!ourRound) continue
		for (const fdFx of fdRound.fixtures) {
			const ourHomeId = ourTeamIdByFdId.get(fdFx.homeTeamExternalId)
			const ourAwayId = ourTeamIdByFdId.get(fdFx.awayTeamExternalId)
			if (!ourHomeId || !ourAwayId) continue
			const ourFx = ourRound.fixtures.find(
				(f) => f.homeTeamId === ourHomeId && f.awayTeamId === ourAwayId,
			)
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
}

export async function syncCompetition(
	comp: CompetitionRow,
	opts: BootstrapOptions,
): Promise<{ rounds: number; fixtures: number; transitionedRoundIds: string[] }> {
	const adapter = adapterFor(comp, opts)
	if (!adapter) return { rounds: 0, fixtures: 0, transitionedRoundIds: [] }

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
	const transitionedRoundIds: string[] = []
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, comp.id), eq(round.number, ar.number)),
		})
		const newStatus: 'upcoming' | 'open' | 'active' | 'completed' = ar.finished
			? 'completed'
			: ar.deadline && ar.deadline.getTime() - Date.now() < OPEN_WINDOW_MS
				? 'open'
				: (existingRound?.status ?? 'upcoming')
		let roundId: string
		// T-48h: pre-lock window opens. Used to enqueue the planned-pick auto-submit
		// job (fires at T-60s). Does NOT signal the deadline has passed.
		const transitioningToOpen =
			!!existingRound && existingRound.status !== 'open' && newStatus === 'open'
		// Actual deadline passed: the round is still `open` in the DB (we have not
		// transitioned it to `active` yet) AND its deadline is in the past. This is
		// what drives `processDeadlineLock` (rules 2 and 3) — firing earlier would
		// elim/auto-pick players who still have time to submit. The handler is
		// idempotent so it is safe to re-fire on subsequent sync runs until the
		// round advances to `active`/`completed`.
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

		if (transitioningToOpen && ar.deadline) {
			const plans = await db.query.plannedPick.findMany({
				where: eq(plannedPick.roundId, roundId),
			})
			const autoPlans = plans.filter((p) => p.autoSubmit)
			const notBefore = new Date(ar.deadline.getTime() - AUTO_SUBMIT_LEAD_MS)
			for (const p of autoPlans) {
				await enqueueAutoSubmit(p.gamePlayerId, p.roundId, p.teamId, notBefore)
			}
		}

		if (deadlineHasPassed) {
			transitionedRoundIds.push(roundId)
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

	return { rounds: adapterRounds.length, fixtures: totalFixtures, transitionedRoundIds }
}

export async function applyPotAssignments(competitionId: string): Promise<void> {
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
	if (teamIds.size === 0) return

	const teams = await db.query.team.findMany({
		where: inArray(team.id, [...teamIds]),
	})
	for (const t of teams) {
		const fdId = (t.externalIds as Record<string, string | number> | null)?.football_data
		if (!fdId) continue
		const entry = WC_2026_POTS.find((p) => p.footballDataId === String(fdId))
		if (!entry) continue
		await db
			.update(team)
			.set({
				externalIds: { ...(t.externalIds ?? {}), fifa_pot: entry.pot },
			})
			.where(eq(team.id, t.id))
	}
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
