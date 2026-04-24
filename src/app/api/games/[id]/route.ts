import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { calculatePot } from '@/lib/game-logic/prizes'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
		with: {
			competition: true,
			currentRound: true,
			players: true,
			picks: {
				with: { team: true, round: true },
			},
		},
	})

	if (!gameData) {
		return NextResponse.json({ error: 'Game not found' }, { status: 404 })
	}

	// Check if current user is a member
	const myMembership = gameData.players.find((p) => p.userId === session.user.id)

	// Get payment statuses
	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, id),
	})

	const pot = calculatePot(payments)

	return NextResponse.json({
		...gameData,
		pot,
		myStatus: myMembership?.status ?? null,
		isMember: !!myMembership,
		isAdmin: gameData.createdBy === session.user.id,
		payments: gameData.createdBy === session.user.id ? payments : undefined,
	})
}
