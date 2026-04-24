import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const body = (await request.json().catch(() => null)) as { paymentId?: string } | null
	if (!body?.paymentId) {
		return NextResponse.json({ error: 'missing-paymentId' }, { status: 400 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(
			eq(payment.id, body.paymentId),
			eq(payment.gameId, gameId),
			eq(payment.userId, session.user.id),
		),
	})
	if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (existing.status !== 'pending') {
		return NextResponse.json({ error: 'not-pending' }, { status: 400 })
	}
	await db
		.update(payment)
		.set({ status: 'paid', paidAt: new Date() })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
