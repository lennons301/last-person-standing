/**
 * One-off prod repair: delete the abandoned "SI World Cup" husk game.
 * Issue #119 / parent #112.
 *
 * The game is a one-player husk (single player, one pending payment, zero
 * picks) that would otherwise sit in every listing forever. Deleting it —
 * rather than flipping state — is an explicitly approved exception to the
 * preserve-history convention, confirmed by the game owner.
 *
 * Deletes, in FK order and in one transaction: planned picks → payments →
 * game players → the game row. Aborts loudly if the game has grown any
 * real history since the decision was made (more than one player, any pick,
 * any payout, any paid payment).
 *
 * Usage (prod):
 *   dry run: doppler run --config prd -- pnpm exec tsx scripts/repair/delete-si-world-cup.ts
 *   apply:   doppler run --config prd -- pnpm exec tsx scripts/repair/delete-si-world-cup.ts --apply
 */

import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { user } from '../../src/lib/schema/auth'
import { game, gamePlayer, pick, plannedPick } from '../../src/lib/schema/game'
import { payment, payout } from '../../src/lib/schema/payment'
import { fail, heading, SI_WC_GAME_ID, SI_WC_GAME_NAME } from './shared'

async function main() {
	const apply = process.argv.includes('--apply')

	heading(`Delete: ${SI_WC_GAME_NAME} husk game — ${apply ? 'APPLY' : 'DRY RUN'}`)

	const g = await db.query.game.findFirst({ where: eq(game.id, SI_WC_GAME_ID) })
	if (!g) fail(`game ${SI_WC_GAME_ID} not found (already deleted?)`)
	if (g.name !== SI_WC_GAME_NAME) {
		fail(`game name is ${JSON.stringify(g.name)}, expected ${JSON.stringify(SI_WC_GAME_NAME)}`)
	}

	const players = await db.select().from(gamePlayer).where(eq(gamePlayer.gameId, g.id))
	if (players.length !== 1) fail(`expected exactly 1 player, found ${players.length}`)

	const picks = await db.select().from(pick).where(eq(pick.gameId, g.id))
	if (picks.length !== 0) fail(`expected zero picks, found ${picks.length} — this is not a husk`)

	const payouts = await db.select().from(payout).where(eq(payout.gameId, g.id))
	if (payouts.length !== 0) fail(`expected zero payouts, found ${payouts.length}`)

	const payments = await db.select().from(payment).where(eq(payment.gameId, g.id))
	const paid = payments.filter((p) => p.status === 'paid')
	if (paid.length > 0) {
		fail(`found ${paid.length} PAID payment(s) — real money history, refusing to delete`)
	}

	const planned = await db
		.select()
		.from(plannedPick)
		.where(
			inArray(
				plannedPick.gamePlayerId,
				players.map((p) => p.id),
			),
		)

	const playerUser = await db.query.user.findFirst({ where: eq(user.id, players[0].userId) })
	const playerName = playerUser?.name ?? players[0].userId

	heading('Rows to delete')
	console.log(`game ${g.id}: ${JSON.stringify(g.name)} (${g.gameMode}, ${g.status})`)
	for (const p of planned) console.log(`planned_pick ${p.id}`)
	for (const p of payments) console.log(`payment ${p.id}: ${playerName} £${p.amount} ${p.status}`)
	for (const p of players) console.log(`game_player ${p.id}: ${playerName} (${p.status})`)
	console.log('(the user account itself is untouched — only this game and its rows go)')

	if (!apply) {
		console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
		process.exit(0)
	}

	await db.transaction(async (tx) => {
		if (planned.length > 0) {
			await tx.delete(plannedPick).where(
				inArray(
					plannedPick.id,
					planned.map((p) => p.id),
				),
			)
		}
		await tx.delete(payment).where(eq(payment.gameId, g.id))
		await tx.delete(gamePlayer).where(eq(gamePlayer.gameId, g.id))
		await tx.delete(game).where(eq(game.id, g.id))
	})

	heading('Applied — post-state')
	const gone = await db.query.game.findFirst({ where: eq(game.id, SI_WC_GAME_ID) })
	console.log(`game lookup after delete: ${gone ? 'STILL EXISTS (!)' : 'not found — deleted'}`)
	process.exit(0)
}

main().catch((err) => {
	console.error('Delete failed:', err)
	process.exit(1)
})
