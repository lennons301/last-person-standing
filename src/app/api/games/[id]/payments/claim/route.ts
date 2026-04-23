import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, session.user.id)),
	})
	if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (existing.status !== 'pending') {
		return NextResponse.json({ error: 'not-pending' }, { status: 400 })
	}
	await db
		.update(payment)
		.set({ status: 'claimed', claimedAt: new Date() })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
