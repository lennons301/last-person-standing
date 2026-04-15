import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { calculatePayouts, calculatePot } from '@/lib/game-logic/prizes'
import { game, gamePlayer } from '@/lib/schema/game'
import { payout } from '@/lib/schema/payment'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireSession()
	const { id } = await params

	const gameData = await db.query.game.findFirst({
		where: eq(game.id, id),
		with: { players: true },
	})

	if (!gameData || gameData.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
	}

	if (gameData.status === 'completed') {
		return NextResponse.json({ error: 'Game is already completed' }, { status: 400 })
	}

	const alivePlayers = gameData.players.filter((p) => p.status === 'alive')

	if (alivePlayers.length < 2) {
		return NextResponse.json({ error: 'Need at least 2 alive players to split' }, { status: 400 })
	}

	const pot = calculatePot(gameData.entryFee, gameData.players.length)
	const winnerIds = alivePlayers.map((p) => p.userId)
	const payoutEntries = calculatePayouts(pot, winnerIds)

	// Mark players as winners
	for (const player of alivePlayers) {
		await db.update(gamePlayer).set({ status: 'winner' }).where(eq(gamePlayer.id, player.id))
	}

	// Create payout records
	if (payoutEntries.length > 0) {
		await db.insert(payout).values(
			payoutEntries.map((p) => ({
				gameId: id,
				userId: p.userId,
				amount: p.amount,
				isSplit: p.isSplit,
			})),
		)
	}

	// Mark game as completed
	await db.update(game).set({ status: 'completed' }).where(eq(game.id, id))

	return NextResponse.json({ winners: payoutEntries, pot })
}
