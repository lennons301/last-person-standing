/**
 * Issue #280 — a paid-for rebuy that bought a seat in no game.
 *
 * `POST /api/games/[id]/admin/add-rebuy/[userId]` recorded the extra entry and
 * deliberately left the player's status alone, on the reading that reactivating
 * was the rebuy routes' job. But those routes refuse the moment a second payment
 * row exists (`isRebuyEligible` → `hasBoughtBackIn`), so the admin's rebuy closed
 * every door behind it: the player stayed `eliminated`, no rebuy button appeared
 * anywhere, and the admin's acting-as pick came back "Player is not alive". The
 * code fix reinstates on the way in; this script finds the rows that already
 * went through the old route and puts those players back.
 *
 * What it looks for, per classic game that hasn't completed:
 *
 *   - the player is `eliminated` and not `admin_removed`, and
 *   - they hold a rebuy payment row (a second or later entry, not refunded) that
 *     has been claimed or paid — money actually handed over, and
 *   - **they have made no pick since that row was written** — which is what says
 *     the entry bought nothing. A player who bought back in and then lost again
 *     picked after their rebuy, so they are left alone; this is the one test that
 *     separates the two, and it is why the payment's own `created_at` is read
 *     rather than the elimination round.
 *
 * Both directions of error are one-sided on purpose. An advance pick locked in
 * *before* the exit and sitting on a later round can make a genuinely stuck
 * player look like they played on, so the script misses them (a name the owner
 * can still see in the unpaid/review lists) rather than reviving anyone who used
 * their rebuy and lost it.
 *
 * Completed games are printed and never written: their pot has been paid, and
 * reviving a player there is a human decision about money, not a repair.
 *
 * Read-only by default — it prints every intended mutation. Pass --apply to
 * write, which it does in a single transaction.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { canAdminReinstate, reinstatementUpdate } from '../../src/lib/game/elimination'
import { resolveModeConfig } from '../../src/lib/game/mode-config'
import { gamePlayer } from '../../src/lib/schema/game'
import { payment } from '../../src/lib/schema/payment'
import { heading } from './shared'

const APPLY = process.argv.includes('--apply')

interface Stuck {
	gamePlayerId: string
	gameId: string
	gameName: string
	gameStatus: string
	userId: string
	eliminatedReason: string
	rebuyPaymentId: string
	rebuyStatus: string
	rebuyAmount: string
	rebuyCreatedAt: Date
	picksSinceRebuy: number
}

function line(s: Stuck): string {
	return (
		`  ${s.gameName} [${s.gameStatus}] — player ${s.gamePlayerId.slice(0, 8)} (user ${s.userId.slice(0, 8)}), ` +
		`out as '${s.eliminatedReason}': rebuy £${s.rebuyAmount} ${s.rebuyStatus} ` +
		`on ${s.rebuyCreatedAt.toISOString().slice(0, 10)}, ${s.picksSinceRebuy} pick(s) since`
	)
}

async function main() {
	const games = await db.query.game.findMany({
		with: { players: { with: { picks: true } } },
	})

	const toReinstate: Stuck[] = []
	const completedGames: Stuck[] = []
	const unpaidRebuy: Stuck[] = []
	const pickedSince: Stuck[] = []
	let scanned = 0

	for (const g of games) {
		if (resolveModeConfig(g).mode !== 'classic') continue

		for (const p of g.players) {
			// Only a player who is out has anything to put back, and an admin
			// removal is not reversed by a payment row (see `canAdminReinstate`).
			if (!canAdminReinstate(p)) continue
			scanned++

			const payments = await db.query.payment.findMany({
				where: and(eq(payment.gameId, g.id), eq(payment.userId, p.userId)),
			})
			// The entry is the first row; anything after it is a rebuy. A refunded
			// row is money returned, so it bought nothing and is not a rebuy here.
			const live = payments
				.filter((row) => row.status !== 'refunded')
				.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
			const rebuyRow = live.length > 1 ? live[live.length - 1] : undefined
			if (!rebuyRow) continue

			const picksSinceRebuy = p.picks.filter(
				(pick) => pick.createdAt.getTime() > rebuyRow.createdAt.getTime(),
			).length

			const stuck: Stuck = {
				gamePlayerId: p.id,
				gameId: g.id,
				gameName: g.name,
				gameStatus: g.status,
				userId: p.userId,
				eliminatedReason: p.eliminatedReason ?? '(none recorded)',
				rebuyPaymentId: rebuyRow.id,
				rebuyStatus: rebuyRow.status,
				rebuyAmount: rebuyRow.amount,
				rebuyCreatedAt: rebuyRow.createdAt,
				picksSinceRebuy,
			}

			if (picksSinceRebuy > 0) pickedSince.push(stuck)
			else if (rebuyRow.status === 'pending') unpaidRebuy.push(stuck)
			else if (g.status === 'completed') completedGames.push(stuck)
			else toReinstate.push(stuck)
		}
	}

	heading(`Scanned ${scanned} eliminated classic player(s) across ${games.length} game(s)`)

	console.log(`Paid rebuy, no pick since, game still running — ${toReinstate.length} to reinstate:`)
	for (const s of toReinstate) console.log(line(s))
	if (toReinstate.length === 0) console.log('  (none)')

	if (unpaidRebuy.length > 0) {
		heading(`Rebuy still PENDING — ${unpaidRebuy.length} row(s), NOT written`)
		console.log('  No money has moved on these. Mark the entry paid and re-run, or')
		console.log('  reinstate the player through the admin rebuy if the window is open.')
		for (const s of unpaidRebuy) console.log(line(s))
	}

	if (completedGames.length > 0) {
		heading(`COMPLETED games — ${completedGames.length} row(s), NOT written`)
		console.log('  The pot has been paid out. Putting a player back is a decision about')
		console.log('  money, which belongs to a human and not to this script.')
		for (const s of completedGames) console.log(line(s))
	}

	if (pickedSince.length > 0) {
		heading(`Picked since the rebuy — ${pickedSince.length} row(s), left alone`)
		console.log('  These players used their rebuy and went out again. Listed only so the')
		console.log('  census above accounts for every rebuy row on an eliminated player.')
		for (const s of pickedSince) console.log(line(s))
	}

	console.log('')
	if (toReinstate.length === 0) {
		console.log('Nothing to apply.')
		return
	}
	if (!APPLY) {
		console.log('Dry run — pass --apply to reinstate the players listed above.')
		return
	}

	await db.transaction(async (tx) => {
		for (const s of toReinstate) {
			// Re-read under the transaction: the player must still be out, so this
			// can never be the write that reverses a reinstatement someone else made.
			const [row] = await tx.select().from(gamePlayer).where(eq(gamePlayer.id, s.gamePlayerId))
			if (!row) throw new Error(`game_player ${s.gamePlayerId} vanished mid-repair`)
			if (!canAdminReinstate(row)) {
				throw new Error(
					`game_player ${s.gamePlayerId} is now '${row.status}'/'${row.eliminatedReason}' — aborting`,
				)
			}
			await tx.update(gamePlayer).set(reinstatementUpdate()).where(eq(gamePlayer.id, row.id))
		}
	})

	console.log(`✔ Reinstated ${toReinstate.length} player(s).`)
	for (const s of toReinstate) {
		const row = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, s.gamePlayerId) })
		console.log(`  ${s.gamePlayerId}: ${row?.status} / reason ${row?.eliminatedReason ?? 'null'}`)
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
