import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FplAdapter } from '@/lib/data/fpl'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'

export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}
	if (request.headers.get('authorization') !== `Bearer ${secret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const adapter = new FplAdapter()

	// Find or create PL competition
	let pl = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'fpl'), eq(competition.status, 'active')),
	})

	if (!pl) {
		const [created] = await db
			.insert(competition)
			.values({
				name: 'Premier League',
				type: 'league',
				dataSource: 'fpl',
				season: '2025/26',
			})
			.returning()
		pl = created
	}

	// Sync teams
	const adapterTeams = await adapter.fetchTeams()
	for (const at of adapterTeams) {
		await db
			.insert(team)
			.values({
				name: at.name,
				shortName: at.shortName,
				badgeUrl: at.badgeUrl,
				externalIds: { fpl: at.externalId },
			})
			.onConflictDoNothing()
	}

	// Sync rounds and fixtures
	const adapterRounds = await adapter.fetchRounds()
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, pl.id), eq(round.number, ar.number)),
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
			const [newRound] = await db
				.insert(round)
				.values({
					competitionId: pl.id,
					number: ar.number,
					name: ar.name,
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : 'upcoming',
				})
				.returning()
			roundId = newRound.id
		}

		// Sync fixtures for this round
		for (const af of ar.fixtures) {
			// Look up team IDs by external ID
			const homeTeam = await db.query.team.findFirst({
				where: eq(team.externalIds, { fpl: af.homeTeamExternalId } as Record<
					string,
					string | number
				>),
			})
			const awayTeam = await db.query.team.findFirst({
				where: eq(team.externalIds, { fpl: af.awayTeamExternalId } as Record<
					string,
					string | number
				>),
			})

			if (!homeTeam || !awayTeam) continue

			await db
				.insert(fixture)
				.values({
					roundId,
					homeTeamId: homeTeam.id,
					awayTeamId: awayTeam.id,
					kickoff: af.kickoff,
					status: af.status,
					homeScore: af.homeScore,
					awayScore: af.awayScore,
					externalId: af.externalId,
				})
				.onConflictDoNothing()
		}
	}

	return NextResponse.json({ synced: true, rounds: adapterRounds.length })
}
