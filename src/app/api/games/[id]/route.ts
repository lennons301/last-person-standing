import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { calculatePot } from '@/lib/game-logic/prizes'
import { game, gamePlayer, pick, plannedPick } from '@/lib/schema/game'
import { payment, payout } from '@/lib/schema/payment'

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

/**
 * Hard-delete a game and every row that FKs back to it. Admin (game creator)
 * only. Removes test/abandoned games cleanly. Order is deepest-first so FK
 * constraints don't trip; wrapped in a transaction for atomicity.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, id) })
	if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (gameRow.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	await db.transaction(async (tx) => {
		const playerIds = (
			await tx.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, id) })
		).map((p) => p.id)
		if (playerIds.length > 0) {
			// plannedPick FKs to gamePlayer (not to game directly).
			await tx.delete(plannedPick).where(inArray(plannedPick.gamePlayerId, playerIds))
		}
		await tx.delete(pick).where(eq(pick.gameId, id))
		await tx.delete(payment).where(eq(payment.gameId, id))
		await tx.delete(payout).where(eq(payout.gameId, id))
		await tx.delete(gamePlayer).where(eq(gamePlayer.gameId, id))
		await tx.delete(game).where(eq(game.id, id))
	})

	return NextResponse.json({ deleted: true })
}
