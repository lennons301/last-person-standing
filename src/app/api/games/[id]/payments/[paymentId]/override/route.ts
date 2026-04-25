import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; paymentId: string }> }

type OverrideStatus = 'pending' | 'paid' | 'refunded'
const ALLOWED: OverrideStatus[] = ['pending', 'paid', 'refunded']

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, paymentId } = await ctx.params

	const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!g) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (g.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	const body = (await request.json().catch(() => null)) as { status?: OverrideStatus } | null
	const status = body?.status
	if (!status || !ALLOWED.includes(status)) {
		return NextResponse.json({ error: 'invalid-status' }, { status: 400 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.id, paymentId), eq(payment.gameId, gameId)),
	})
	if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })

	const update: {
		status: OverrideStatus
		claimedAt?: Date | null
		paidAt?: Date | null
		refundedAt?: Date | null
	} = { status }
	if (status === 'pending') {
		update.claimedAt = null
		update.paidAt = null
	} else if (status === 'paid') {
		update.paidAt = new Date()
	} else if (status === 'refunded') {
		update.refundedAt = new Date()
	}

	await db.update(payment).set(update).where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
