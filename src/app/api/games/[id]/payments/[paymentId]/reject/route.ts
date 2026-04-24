import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; paymentId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, paymentId } = await ctx.params

	const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!g) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (g.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.id, paymentId), eq(payment.gameId, gameId)),
	})
	if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (existing.status !== 'paid') {
		return NextResponse.json({ error: 'not-paid' }, { status: 400 })
	}

	await db
		.update(payment)
		.set({ status: 'pending', paidAt: null })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
