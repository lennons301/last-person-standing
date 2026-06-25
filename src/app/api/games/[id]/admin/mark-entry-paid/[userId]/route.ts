import { and, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/**
 * Admin-only: mark a player's entry fee paid when they have NO payment row at
 * all. This is the case for players added to the game after the deadline (the
 * add-player flow doesn't create a pending payment), which surface in the admin
 * payments panel as synthetic "unpaid" rows with no payment id — so the normal
 * "Mark paid" override (which needs a payment id) isn't reachable for them.
 *
 * Creates a `paid` payment row (entry fee, method 'manual'); the pot is derived
 * from paid payments, so this grows it exactly like confirming any other entry.
 *
 * Guarded so it can't duplicate an entry: if the player already has a
 * non-refunded payment they're not a synthetic row, and the admin should use
 * that row's existing Mark paid / Dispute controls instead.
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

	// Only for players with no live payment row. A refunded row (e.g. an
	// admin-removed player) doesn't count — re-adding them can take a fresh
	// paid entry.
	const existing = await db.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, targetUserId),
			ne(payment.status, 'refunded'),
		),
	})
	if (existing) {
		return NextResponse.json({ error: 'entry-exists' }, { status: 400 })
	}

	const [inserted] = await db
		.insert(payment)
		.values({
			gameId,
			userId: targetUserId,
			amount: gameRow.entryFee ?? '0.00',
			status: 'paid',
			method: 'manual',
			paidAt: new Date(),
		})
		.returning()

	return NextResponse.json({ paymentId: inserted.id, status: 'paid' })
}
