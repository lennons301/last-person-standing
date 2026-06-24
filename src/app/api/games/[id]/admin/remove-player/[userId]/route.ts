import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

/**
 * Admin-only: remove a player who never engaged (no picks) — e.g. someone added
 * or who joined but never played and shouldn't sit in the pot/standings.
 *
 * Preserves history (no row deletes): the gamePlayer is flipped to
 * `eliminated` with reason `admin_removed`, and any of their payments are
 * refunded so they drop out of the pot. `admin_removed` players are excluded
 * from standings, counts and the pot target (see getGameDetail /
 * getProgressGridData). Guarded to no-pick players so a real participant's
 * history can never be wiped this way.
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

	// Only removable if they've never picked — protects a real participant's
	// history. If they've engaged, the admin should eliminate, not remove.
	const existingPick = await db.query.pick.findFirst({
		where: eq(pick.gamePlayerId, playerRow.id),
	})
	if (existingPick) {
		return NextResponse.json({ error: 'player-has-picks' }, { status: 400 })
	}

	await db.transaction(async (tx) => {
		await tx
			.update(gamePlayer)
			.set({ status: 'eliminated', eliminatedReason: 'admin_removed', eliminatedRoundId: null })
			.where(eq(gamePlayer.id, playerRow.id))
		// Refund any of their payments so they drop out of the pot (calculatePot
		// ignores refunded). Idempotent.
		await tx
			.update(payment)
			.set({ status: 'refunded', refundedAt: new Date() })
			.where(and(eq(payment.gameId, gameId), eq(payment.userId, targetUserId)))
	})

	return NextResponse.json({ status: 'removed' })
}
