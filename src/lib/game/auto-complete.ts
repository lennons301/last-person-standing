import { and, eq, inArray } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { calculatePayouts, calculatePot } from '@/lib/game-logic/prizes'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment, payout } from '@/lib/schema/payment'

/** A transaction handle, as drizzle hands one to `db.transaction`'s callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The money-moving step: crown the winners, write their payout rows and mark the
 * game complete — or, on a total wipeout, refund every stake and complete with no
 * winner.
 *
 * The whole sequence runs inside a transaction — the caller's, which is
 * `applyPlan` (`settle.ts`) and covers the pick rows and eliminations that
 * decided the winner too. A crash or statement timeout part way through used to
 * leave the game in a state nothing repairs: a payout row against a game still
 * marked `active`, or (worse) winners crowned and the pot paid out with
 * `game.status` never flipped, so the next settle pass runs the completion check
 * again and inserts the payouts a second time. The idempotency guard against
 * that re-run is settlement's `g.status !== 'active'` bail-out, which is only
 * trustworthy if the status flip lands with the payouts rather than after them.
 *
 * Reads sit inside the transaction too, so the pot is calculated from the same
 * snapshot the payout rows are written against.
 */
export async function applyCompletion(
	tx: Tx,
	gameId: string,
	winnerPlayerIds: string[],
	options?: { refund?: boolean },
): Promise<void> {
	// Nothing to write and nothing to complete.
	if (!options?.refund && winnerPlayerIds.length === 0) return

	// Total wipeout: no winner. Refund every contributing stake and complete the
	// game. No payout rows are written.
	if (options?.refund) {
		await tx
			.update(payment)
			.set({ status: 'refunded', refundedAt: new Date() })
			.where(and(eq(payment.gameId, gameId), inArray(payment.status, ['paid', 'claimed'])))
		await tx
			.update(game)
			.set({ status: 'completed', currentRoundId: null })
			.where(eq(game.id, gameId))
		return
	}

	for (const playerId of winnerPlayerIds) {
		await tx.update(gamePlayer).set({ status: 'winner' }).where(eq(gamePlayer.id, playerId))
	}

	const players = await tx.query.gamePlayer.findMany({
		where: eq(gamePlayer.gameId, gameId),
	})
	const winnerUserIds = winnerPlayerIds
		.map((pid) => players.find((p) => p.id === pid)?.userId)
		.filter((u): u is string => u != null)

	const payments = await tx.query.payment.findMany({
		where: eq(payment.gameId, gameId),
	})
	const pot = calculatePot(payments)
	const payoutEntries = calculatePayouts(pot.total, winnerUserIds)
	if (payoutEntries.length > 0) {
		await tx.insert(payout).values(
			payoutEntries.map((p) => ({
				gameId,
				userId: p.userId,
				amount: p.amount,
				isSplit: p.isSplit,
			})),
		)
	}

	await tx
		.update(game)
		.set({ status: 'completed', currentRoundId: null })
		.where(eq(game.id, gameId))
}
