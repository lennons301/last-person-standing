import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
	})

	if (!gameData || gameData.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
	}

	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, id),
	})

	return NextResponse.json(payments)
}
