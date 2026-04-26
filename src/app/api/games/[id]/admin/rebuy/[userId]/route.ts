import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, userId: targetUserId } = await ctx.params

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (gameRow.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	const playerRow = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, targetUserId)),
	})
	if (!playerRow) return NextResponse.json({ error: 'not-in-game' }, { status: 404 })

	const rounds = await db.query.round.findMany({
		where: eq(round.competitionId, gameRow.competitionId),
	})
	const round1 = rounds.find((r) => r.number === 1)
	const round2 = rounds.find((r) => r.number === 2)
	if (!round1 || !round2) {
		return NextResponse.json({ error: 'rounds-not-set-up' }, { status: 400 })
	}

	const payments = await db.query.payment.findMany({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, targetUserId)),
	})

	const eligible = isRebuyEligible({
		game: {
			gameMode: gameRow.gameMode,
			modeConfig: gameRow.modeConfig as { allowRebuys?: boolean } | null,
		},
		gamePlayer: {
			status: playerRow.status,
			eliminatedRoundId: playerRow.eliminatedRoundId,
		},
		round1: { id: round1.id },
		round2: { deadline: round2.deadline },
		paymentRowCount: payments.length,
		now: new Date(),
	})
	if (!eligible) return NextResponse.json({ error: 'not-eligible' }, { status: 403 })

	let insertedPaymentId = ''
	await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(payment)
			.values({
				gameId,
				userId: targetUserId,
				amount: gameRow.entryFee ?? '0.00',
				status: 'pending',
				method: 'manual',
			})
			.returning()
		insertedPaymentId = inserted.id

		await tx
			.update(gamePlayer)
			.set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
			.where(eq(gamePlayer.id, playerRow.id))
	})

	return NextResponse.json({ paymentId: insertedPaymentId, status: 'pending' })
}
