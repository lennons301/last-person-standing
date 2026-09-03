import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { evaluateJoinability, JOIN_BLOCKED_COPY } from '@/lib/game/joinability'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
		with: { players: true, startingRound: true },
	})

	if (!gameData) {
		return NextResponse.json({ error: 'Game not found' }, { status: 404 })
	}

	// Self-service entry closes as soon as the game starts — see
	// `evaluateJoinability` for the rule and why it reads the starting round
	// rather than the status. Past that point the creator adds people through
	// the admin add-player route, which stays unrestricted.
	const joinability = evaluateJoinability({
		game: gameData,
		startingRound: gameData.startingRound ?? null,
		now: new Date(),
	})
	if (joinability.reason) {
		const copy = JOIN_BLOCKED_COPY[joinability.reason]
		return NextResponse.json({ error: copy.code, message: copy.message }, { status: 400 })
	}

	if (gameData.maxPlayers && gameData.players.length >= gameData.maxPlayers) {
		return NextResponse.json({ error: 'Game is full' }, { status: 400 })
	}

	const existing = gameData.players.find((p) => p.userId === session.user.id)
	if (existing) {
		return NextResponse.json({ error: 'Already a member of this game' }, { status: 400 })
	}

	// Honour modeConfig.startingLives if the game creator set one. Only cup has
	// them, and its default is 0: lives are earned via underdog picks, not handed
	// out. See `resolveModeConfig`.
	const modeConfig = resolveModeConfig(gameData)
	const startingLives = modeConfig.mode === 'cup' ? modeConfig.startingLives : 0

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
