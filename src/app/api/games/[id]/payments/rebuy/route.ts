import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { resolveRoundAfterStarting, resolveStartingRound } from '@/lib/game/starting-round'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params
	const userId = session.user.id

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })

	const playerRow = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, userId)),
	})
	if (!playerRow) return NextResponse.json({ error: 'not-in-game' }, { status: 404 })

	// The rebuy window is the game's own opening round, not the competition's
	// gameweek one: a game created in November starts at gameweek 12, and it's the
	// gameweek-12 exit its players can buy back from. See #203.
	const rounds = await db.query.round.findMany({
		where: eq(round.competitionId, gameRow.competitionId),
	})
	const startingRound = resolveStartingRound(gameRow, rounds)
	const roundAfterStarting = resolveRoundAfterStarting(gameRow, rounds)
	if (!startingRound || !roundAfterStarting) {
		return NextResponse.json({ error: 'rounds-not-set-up' }, { status: 400 })
	}

	const payments = await db.query.payment.findMany({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, userId)),
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
		startingRound: { id: startingRound.id },
		roundAfterStarting: { deadline: roundAfterStarting.deadline },
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
				userId,
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
