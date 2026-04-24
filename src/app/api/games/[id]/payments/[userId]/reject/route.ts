import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, userId } = await ctx.params

	const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (g.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, userId)),
	})
	if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (existing.status !== 'claimed') {
		return NextResponse.json({ error: 'not-claimed' }, { status: 400 })
	}
	await db
		.update(payment)
		.set({ status: 'pending', claimedAt: null })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
