import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
		with: { players: true },
	})

	if (!gameData) {
		return NextResponse.json({ error: 'Game not found' }, { status: 404 })
	}

	// Allow joining 'open' and 'active' games. Games are created in 'active'
	// state directly (the 'open' enum value is currently unused by the
	// creation flow), so requiring 'open' here would reject every invite-code
	// join. Only 'completed' (game ended) and 'setup' (admin still configuring)
	// are blocked.
	if (gameData.status === 'completed' || gameData.status === 'setup') {
		return NextResponse.json({ error: 'Game is not accepting new players' }, { status: 400 })
	}

	if (gameData.maxPlayers && gameData.players.length >= gameData.maxPlayers) {
		return NextResponse.json({ error: 'Game is full' }, { status: 400 })
	}

	const existing = gameData.players.find((p) => p.userId === session.user.id)
	if (existing) {
		return NextResponse.json({ error: 'Already a member of this game' }, { status: 400 })
	}

	// Honour modeConfig.startingLives if the game creator set one. Default 0:
	// in cup mode lives are earned via underdog picks, not handed out.
	const startingLives =
		(gameData.modeConfig as { startingLives?: number } | null)?.startingLives ?? 0

	const [player] = await db
		.insert(gamePlayer)
		.values({
			gameId: id,
			userId: session.user.id,
			livesRemaining: startingLives,
		})
		.returning()

	// Create payment record if entry fee is set
	if (gameData.entryFee) {
		await db.insert(payment).values({
			gameId: id,
			userId: session.user.id,
			amount: gameData.entryFee,
		})
	}

	return NextResponse.json(player, { status: 201 })
}
