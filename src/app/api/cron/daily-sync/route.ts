import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter } from '@/lib/data/fpl'
import type { CompetitionAdapter } from '@/lib/data/types'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'

type CompetitionRow = typeof competition.$inferSelect

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	const comps = await db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})

	const results: Array<{ competitionId: string; rounds: number }> = []
	for (const c of comps) {
		const adapter = adapterFor(c, apiKey)
		if (!adapter) continue
		const summary = await syncInline(c, adapter)
		results.push({ competitionId: c.id, rounds: summary.rounds })
	}

	return NextResponse.json({ competitions: results })
}

function adapterFor(c: CompetitionRow, apiKey: string | undefined): CompetitionAdapter | null {
	if (c.dataSource === 'fpl') return new FplAdapter()
	if (c.dataSource === 'football_data') {
		if (!apiKey || !c.externalId) return null
		return new FootballDataAdapter(c.externalId, apiKey)
	}
	return null
}

async function syncInline(
	c: CompetitionRow,
	adapter: CompetitionAdapter,
): Promise<{ rounds: number }> {
	const key = c.dataSource === 'fpl' ? 'fpl' : 'football_data'
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

	const adapterRounds = await adapter.fetchRounds()
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, c.id), eq(round.number, ar.number)),
		})
		let roundId: string
		if (existingRound) {
			roundId = existingRound.id
			await db
				.update(round)
				.set({
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : existingRound.status,
				})
				.where(eq(round.id, existingRound.id))
		} else {
			const [created] = await db
				.insert(round)
				.values({
					competitionId: c.id,
					number: ar.number,
					name: ar.name,
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : 'upcoming',
				})
				.returning()
			roundId = created.id
		}

		for (const af of ar.fixtures) {
			const allTeams = await db.query.team.findMany({})
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
			}
		}
	}

	return { rounds: adapterRounds.length }
}
