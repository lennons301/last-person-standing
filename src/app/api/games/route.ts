import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { generateInviteCode } from '@/lib/game/invite-code'
import { competition, round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function GET() {
	const session = await requireSession()

	const myGames = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.userId, session.user.id),
		with: {
			game: {
				with: {
					competition: true,
					players: true,
				},
			},
		},
	})

	const games = myGames.map((gp) => ({
		id: gp.game.id,
		name: gp.game.name,
		gameMode: gp.game.gameMode,
		status: gp.game.status,
		competition: gp.game.competition.name,
		playerCount: gp.game.players.length,
		aliveCount: gp.game.players.filter((p) => p.status === 'alive').length,
		myStatus: gp.status,
		entryFee: gp.game.entryFee,
		isAdmin: gp.game.createdBy === session.user.id,
	}))

	return NextResponse.json(games)
}

export async function POST(request: Request) {
	const session = await requireSession()
	const body = await request.json()

	const { name, competitionId, gameMode, modeConfig, entryFee, maxPlayers } = body

	if (!name || !competitionId || !gameMode) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}

	// Verify competition exists
	const comp = await db.query.competition.findFirst({
		where: eq(competition.id, competitionId),
	})

	if (!comp) {
		return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
	}

	const inviteCode = generateInviteCode()

	// Link to the competition's earliest non-completed round so the game
	// has somewhere to start. If none exist the game just waits.
	const firstRound = await db.query.round.findFirst({
		where: and(
			eq(round.competitionId, competitionId),
			inArray(round.status, ['open', 'active', 'upcoming']),
		),
		orderBy: [asc(round.number)],
	})

	const [newGame] = await db
		.insert(game)
		.values({
			name,
			createdBy: session.user.id,
			competitionId,
			gameMode,
			modeConfig: modeConfig ?? {},
			entryFee: entryFee ?? null,
			maxPlayers: maxPlayers ?? null,
			inviteCode,
			status: firstRound ? 'active' : 'open',
			currentRoundId: firstRound?.id ?? null,
		})
		.returning()

	// Creator automatically joins the game
	await db.insert(gamePlayer).values({
		gameId: newGame.id,
		userId: session.user.id,
	})

	// Create payment record if entry fee is set
	if (entryFee) {
		await db.insert(payment).values({
			gameId: newGame.id,
			userId: session.user.id,
			amount: entryFee,
		})
	}

	return NextResponse.json(newGame, { status: 201 })
}
