import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { canAdminReinstate, isAdminRemoved, reinstatementUpdate } from '@/lib/game/elimination'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/**
 * Admin-only: record a rebuy (an additional entry) for a player at ANY stage —
 * including after the rebuy window has closed, when the self-service rebuy is no
 * longer available. Creates a second `pending` payment row; it then flows
 * through the normal pay/mark-paid mechanics (admin "Mark paid", or the player
 * claiming) and increments the pot once paid.
 *
 * It also puts an eliminated player **back in the game**, in the same
 * transaction, exactly as the player's own rebuy and the admin's windowed one
 * do. It was payment-only until #280, on the reading that reactivating was the
 * other routes' job — but those routes refuse once a second payment row exists
 * (`isRebuyEligible` → `hasBoughtBackIn`), so recording a rebuy here closed
 * every door behind it: the player stayed eliminated with a paid-for entry, no
 * rebuy button anywhere, and the admin's acting-as pick refused too. An entry
 * nobody can play is not an entry.
 *
 * The one player it won't reinstate is an `admin_removed` one — see
 * `canAdminReinstate`. Guarded, too, so the admin can't stack multiple
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

	// A removal is undone by un-removing, not by selling the player an entry:
	// their payments were refunded on the way out and every surface that counts
	// the field drops them. Refusing keeps that state the deliberate thing it is.
	if (isAdminRemoved(playerRow)) {
		return NextResponse.json({ error: 'player-removed' }, { status: 400 })
	}

	const reinstated = canAdminReinstate(playerRow)

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

		// The entry buys a seat back in the game, not just a line in the pot. The
		// payment can stay pending — the windowed rebuy routes reactivate on the
		// same terms, and the money is chased through the ordinary mark-paid flow.
		if (reinstated) {
			await tx.update(gamePlayer).set(reinstatementUpdate()).where(eq(gamePlayer.id, playerRow.id))
		}
	})

	return NextResponse.json({ paymentId: insertedPaymentId, status: 'pending', reinstated })
}
