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

	if (gameData.status !== 'open') {
		return NextResponse.json({ error: 'Game is not accepting new players' }, { status: 400 })
	}

	if (gameData.maxPlayers && gameData.players.length >= gameData.maxPlayers) {
		return NextResponse.json({ error: 'Game is full' }, { status: 400 })
	}

	const existing = gameData.players.find((p) => p.userId === session.user.id)
	if (existing) {
		return NextResponse.json({ error: 'Already a member of this game' }, { status: 400 })
	}

	// Cup mode players start with a configurable number of lives. Without this
	// the cup mechanic is broken (the lives field stays at the schema default
	// of 0 and players never earn the upset bonus). Other modes ignore the
	// field; it's safe to set it universally.
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
