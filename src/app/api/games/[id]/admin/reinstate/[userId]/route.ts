import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { canAdminReinstate, isAdminRemoved, reinstatementUpdate } from '@/lib/game/elimination'
import { game, gamePlayer } from '@/lib/schema/game'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/**
 * Admin-only: put an eliminated player back in the game, and **take no money**.
 *
 * The other three reinstatements all come attached to something else — the
 * player's own rebuy and both admin rebuy routes write a payment row, and the
 * acting-as pick writes a pick. This one exists for the case where the entry has
 * already been settled and the player is still out: the #280 shape, where an
 * admin-recorded rebuy was paid but reactivated nobody, and more generally any
 * game where the money changed hands out-of-band. Charging a second entry fee to
 * undo that would be the wrong fix, and it is the only thing the existing routes
 * can do once the rebuy window has gone.
 *
 * It is the deliberate human act `POST .../admin/add-player` already is: no
 * window, no round, no payment state read. The verdict on whether there is
 * anything to undo is `canAdminReinstate` — so an alive player is a no-op 400
 * rather than a silent success, and an `admin_removed` one is refused, because a
 * removal is undone by un-removing and its entry was refunded on the way out.
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

	if (isAdminRemoved(playerRow)) {
		return NextResponse.json({ error: 'player-removed' }, { status: 400 })
	}
	if (!canAdminReinstate(playerRow)) {
		return NextResponse.json({ error: 'not-eliminated' }, { status: 400 })
	}

	await db.update(gamePlayer).set(reinstatementUpdate()).where(eq(gamePlayer.id, playerRow.id))

	return NextResponse.json({ status: 'alive' })
}
