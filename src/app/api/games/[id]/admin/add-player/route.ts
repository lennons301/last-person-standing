import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { user } from '@/lib/schema/auth'
import { game, gamePlayer } from '@/lib/schema/game'

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await params
	const body = (await request.json()) as { userId?: string }

	if (!body.userId) {
		return NextResponse.json({ error: 'missing-userId' }, { status: 400 })
	}

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!gameRow) {
		return NextResponse.json({ error: 'not-found' }, { status: 404 })
	}
	if (gameRow.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	const targetUser = await db.query.user.findFirst({ where: eq(user.id, body.userId) })
	if (!targetUser) {
		return NextResponse.json({ error: 'user-not-found' }, { status: 404 })
	}

	const existing = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, body.userId)),
	})
	if (existing) {
		return NextResponse.json({ error: 'already-in-game' }, { status: 409 })
	}

	// Honour modeConfig.startingLives if set; only cup has lives and its default
	// is 0 (they're earned via underdog picks, not handed out). See
	// `resolveModeConfig` — the join route reads the same answer.
	const modeConfig = resolveModeConfig(gameRow)
	const startingLives = modeConfig.mode === 'cup' ? modeConfig.startingLives : 0
	const [inserted] = await db
		.insert(gamePlayer)
		.values({
			gameId,
			userId: body.userId,
			status: 'alive',
			livesRemaining: startingLives,
		})
		.returning()

	return NextResponse.json({ gamePlayer: inserted })
}
