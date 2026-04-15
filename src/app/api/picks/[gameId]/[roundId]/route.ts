import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { validateClassicPick, validateTurboPicks } from '@/lib/picks/validate'
import { fixture, round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

type Params = Promise<{ gameId: string; roundId: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
	await requireSession()
	const { gameId, roundId } = await params

	const picks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
		with: { team: true, gamePlayer: true },
	})

	return NextResponse.json(picks)
}

export async function POST(request: Request, { params }: { params: Params }) {
	const session = await requireSession()
	const { gameId, roundId } = await params
	const body = await request.json()

	// Get game and player
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
	})
	if (!gameData) {
		return NextResponse.json({ error: 'Game not found' }, { status: 404 })
	}

	const player = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})
	if (!player) {
		return NextResponse.json({ error: 'Not a member of this game' }, { status: 403 })
	}

	// Get round
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: { fixtures: true },
	})
	if (!roundData) {
		return NextResponse.json({ error: 'Round not found' }, { status: 404 })
	}

	const now = new Date()

	if (gameData.gameMode === 'classic') {
		const { teamId } = body

		// Get previously used teams
		const previousPicks = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, player.id), eq(pick.gameId, gameId)),
		})
		const usedTeamIds = previousPicks.filter((p) => p.roundId !== roundId).map((p) => p.teamId)

		const fixtureTeamIds = roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])

		const validation = validateClassicPick({
			teamId,
			playerStatus: player.status,
			roundStatus: roundData.status,
			deadline: roundData.deadline,
			now,
			usedTeamIds,
			fixtureTeamIds,
		})

		if (!validation.valid) {
			return NextResponse.json({ error: validation.reason }, { status: 400 })
		}

		// Find the fixture this team is in
		const teamFixture = roundData.fixtures.find(
			(f) => f.homeTeamId === teamId || f.awayTeamId === teamId,
		)

		// Delete existing pick for this player+round if it exists, then insert new one.
		// We cannot use onConflictDoUpdate because the unique index includes confidenceRank,
		// which is null for classic picks, and PostgreSQL treats nulls as distinct.
		const existingPick = previousPicks.find((p) => p.roundId === roundId)
		if (existingPick) {
			await db.delete(pick).where(eq(pick.id, existingPick.id))
		}

		const [newPick] = await db
			.insert(pick)
			.values({
				gameId,
				gamePlayerId: player.id,
				roundId,
				teamId,
				fixtureId: teamFixture?.id,
			})
			.returning()

		return NextResponse.json(newPick, { status: 201 })
	}

	// Turbo and Cup modes
	const { picks: pickEntries } = body
	const numberOfPicks = (gameData.modeConfig as { numberOfPicks?: number })?.numberOfPicks ?? 10

	const validation = validateTurboPicks({
		playerStatus: player.status,
		roundStatus: roundData.status,
		deadline: roundData.deadline,
		now,
		numberOfPicks,
		fixtureIds: roundData.fixtures.map((f) => f.id),
		picks: pickEntries,
	})

	if (!validation.valid) {
		return NextResponse.json({ error: validation.reason }, { status: 400 })
	}

	// Delete existing picks for this round, then insert new ones
	const existingPicks = await db.query.pick.findMany({
		where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
	})
	if (existingPicks.length > 0) {
		const existingIds = existingPicks.map((p) => p.id)
		await db.delete(pick).where(inArray(pick.id, existingIds))
	}

	const newPicks = await db
		.insert(pick)
		.values(
			pickEntries.map(
				(entry: { fixtureId: string; confidenceRank: number; predictedResult: string }) => ({
					gameId,
					gamePlayerId: player.id,
					roundId,
					teamId: entry.fixtureId, // For turbo/cup, teamId stores the fixture context
					fixtureId: entry.fixtureId,
					confidenceRank: entry.confidenceRank,
					predictedResult: entry.predictedResult,
				}),
			),
		)
		.returning()

	return NextResponse.json(newPicks, { status: 201 })
}
