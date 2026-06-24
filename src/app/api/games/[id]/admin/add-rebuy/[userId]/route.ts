import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/**
 * Admin-only: record a rebuy (an additional entry) for a player at ANY stage —
 * including after the round-2 rebuy window has closed, when the self-service
 * rebuy is no longer available. Creates a second `pending` payment row; it then
 * flows through the normal pay/mark-paid mechanics (admin "Mark paid", or the
 * player claiming) and increments the pot once paid.
 *
 * Payment-only: it does NOT change the player's alive/eliminated status (that's
 * the separate self-service rebuy). Guarded so the admin can't stack multiple
 * outstanding entries — mark the existing one paid first.
 */
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

	// Don't stack outstanding entries — an existing unpaid one must be settled
	// first (keeps the pot maths and the player's pay prompt unambiguous).
	const pending = await db.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, targetUserId),
			eq(payment.status, 'pending'),
		),
	})
	if (pending) {
		return NextResponse.json({ error: 'pending-entry-exists' }, { status: 400 })
	}

	const [inserted] = await db
		.insert(payment)
		.values({
			gameId,
			userId: targetUserId,
			amount: gameRow.entryFee ?? '0.00',
			status: 'pending',
			method: 'manual',
		})
		.returning()

	return NextResponse.json({ paymentId: inserted.id, status: 'pending' })
}
