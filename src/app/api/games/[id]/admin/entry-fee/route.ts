import { and, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Admin-only: change a game's entry fee mid-flight and bring the pot with it.
 *
 * The pot is derived from payment amounts, so changing `game.entryFee` alone
 * wouldn't move the existing pot — it would only affect future joiners. To
 * actually resize the pot we also bump every existing non-refunded payment to
 * the new fee (each entry, original or rebuy, is one fee). Refunded rows
 * (e.g. admin-removed players) are left alone.
 *
 * Refused on completed games: payouts are decided from the settled pot, so
 * editing the fee afterwards would desync the recorded result.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })
	if (gameRow.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}
	if (gameRow.status === 'completed') {
		return NextResponse.json({ error: 'game-completed' }, { status: 400 })
	}

	const body = (await request.json().catch(() => null)) as { entryFee?: string | number } | null
	const raw = body?.entryFee
	const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''))
	if (!Number.isFinite(parsed) || parsed < 0) {
		return NextResponse.json({ error: 'invalid-entry-fee' }, { status: 400 })
	}
	const entryFee = parsed.toFixed(2)

	await db.transaction(async (tx) => {
		await tx.update(game).set({ entryFee }).where(eq(game.id, gameId))
		// Bump every live entry to the new fee so the pot tracks the change.
		await tx
			.update(payment)
			.set({ amount: entryFee })
			.where(and(eq(payment.gameId, gameId), ne(payment.status, 'refunded')))
	})

	return NextResponse.json({ ok: true, entryFee })
}
