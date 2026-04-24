import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

type OverrideStatus = 'pending' | 'claimed' | 'paid'
interface Body {
	status: OverrideStatus
}

const ALLOWED_STATUSES: OverrideStatus[] = ['pending', 'claimed', 'paid']

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, userId } = await ctx.params

	const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (g.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
	}

	const body = (await request.json()) as Body
	if (!ALLOWED_STATUSES.includes(body.status)) {
		return NextResponse.json({ error: 'invalid-status' }, { status: 400 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, userId)),
	})
	if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

	const update: {
		status: OverrideStatus
		claimedAt?: Date | null
		paidAt?: Date | null
	} = { status: body.status }
	if (body.status === 'pending') {
		update.claimedAt = null
		update.paidAt = null
	}
	if (body.status === 'claimed') {
		update.claimedAt = new Date()
		update.paidAt = null
	}
	if (body.status === 'paid') {
		update.paidAt = new Date()
	}
	await db.update(payment).set(update).where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
