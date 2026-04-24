import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { gamePlayer, plannedPick } from '@/lib/schema/game'

type Ctx = { params: Promise<{ id: string; roundId: string }> }

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, roundId } = await ctx.params
	const membership = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})
	if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
	await db
		.delete(plannedPick)
		.where(and(eq(plannedPick.gamePlayerId, membership.id), eq(plannedPick.roundId, roundId)))
	return NextResponse.json({ ok: true })
}
