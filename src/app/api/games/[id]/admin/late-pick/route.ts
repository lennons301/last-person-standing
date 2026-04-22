import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params
	const { userId } = await request.json()

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
	})

	if (!gameData || gameData.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
	}

	// For now, late pick just means we return a token the frontend uses
	// to allow submission past deadline. The actual deadline bypass is
	// handled by passing `bypassDeadline: true` in the pick submission.
	// Here we just verify the player exists and is alive.

	const player = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, id), eq(gamePlayer.userId, userId)),
	})

	if (!player) {
		return NextResponse.json({ error: 'Player not found in game' }, { status: 404 })
	}

	if (player.status !== 'alive') {
		return NextResponse.json({ error: 'Player is not alive' }, { status: 400 })
	}

	return NextResponse.json({ allowed: true, playerId: player.id, gameId: id })
}
