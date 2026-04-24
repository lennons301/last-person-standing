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
	await syncCompetition(wc, opts)
	await applyPotAssignments(wc.id)
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
		const transitioningToOpen =
			!!existingRound && existingRound.status !== 'open' && newStatus === 'open'
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

		if (transitioningToOpen) {
			transitionedRoundIds.push(roundId)
			if (ar.deadline) {
				const plans = await db.query.plannedPick.findMany({
					where: eq(plannedPick.roundId, roundId),
				})
				const autoPlans = plans.filter((p) => p.autoSubmit)
				const notBefore = new Date(ar.deadline.getTime() - AUTO_SUBMIT_LEAD_MS)
				for (const p of autoPlans) {
					await enqueueAutoSubmit(p.gamePlayerId, p.roundId, p.teamId, notBefore)
				}
			}
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
