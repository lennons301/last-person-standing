/**
 * One-off repair for LPS 1 2026/7 (#227 follow-up): the deadline lock's
 * second-round branch eliminated *every* no-picker, which was the behaviour from
 * before a rebuy carried its own payment row. Two players were caught by it in
 * Gameweek 2:
 *
 *   - a survivor on merit (opening pick won, then missed the deadline) — should
 *     have taken the ordinary worst-placed-unused-team auto-pick;
 *   - a player who bought back in, paid, and then missed the deadline — stays
 *     eliminated, but the rebuy bought nothing so it comes off the pot.
 *
 * The fix is in `processDeadlineLock`; this script brings the live rows into line
 * with it. The auto-pick is not hand-written — the survivor is put back to the
 * state they were in at the deadline and the *real* lock is run, so the team it
 * assigns is the one the engine would have chosen.
 *
 * Dry-run by default. Pass --apply to write.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { processDeadlineLock } from '../../src/lib/game/no-pick-handler'
import { round, team } from '../../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../../src/lib/schema/game'
import { payment } from '../../src/lib/schema/payment'

const GAME_ID = 'ea6f9907-2f79-4061-b7ce-eaf2d1078f6c'
/** Survivor on merit — opening pick won, no Gameweek 2 pick. */
const MERIT_PLAYER_ID = '9567be2b-2e0b-49fb-a881-2e3753f7fa4e'
/** Paid rebuy, no Gameweek 2 pick — the payment to reverse. */
const REBUY_PAYMENT_ID = 'e1471187-48cc-4210-867d-e8db2bc080c5'

const APPLY = process.argv.includes('--apply')

async function pot(): Promise<string> {
	const rows = await db.select().from(payment).where(eq(payment.gameId, GAME_ID))
	const pence = rows
		.filter((r) => r.status === 'paid' || r.status === 'claimed')
		.reduce((sum, r) => sum + Math.round(Number.parseFloat(r.amount) * 100), 0)
	return (pence / 100).toFixed(2)
}

async function main() {
	const g = (await db.select().from(game).where(eq(game.id, GAME_ID)))[0]
	if (!g) throw new Error('game not found')
	const roundId = g.currentRoundId
	if (!roundId) throw new Error('game has no current round')
	const r = (await db.select().from(round).where(eq(round.id, roundId)))[0]

	console.log(
		`game "${g.name}" round #${r.number} ${r.name} (deadline ${r.deadline?.toISOString()})`,
	)
	console.log(`pot before: £${await pot()}`)
	console.log(APPLY ? 'MODE: APPLY\n' : 'MODE: DRY RUN (pass --apply to write)\n')

	const merit = (await db.select().from(gamePlayer).where(eq(gamePlayer.id, MERIT_PLAYER_ID)))[0]
	if (!merit || merit.gameId !== GAME_ID) throw new Error('merit player not in this game')
	const rebuyPay = (await db.select().from(payment).where(eq(payment.id, REBUY_PAYMENT_ID)))[0]
	if (!rebuyPay || rebuyPay.gameId !== GAME_ID) throw new Error('rebuy payment not in this game')

	// --- 1. The survivor: back to how they stood at the deadline, then let the
	// real lock give them the auto-pick it should have given them then.
	console.log(
		`survivor ${merit.id}: status=${merit.status} reason=${merit.eliminatedReason} → alive, then auto-pick`,
	)
	if (APPLY) {
		await db
			.update(gamePlayer)
			.set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
			.where(eq(gamePlayer.id, merit.id))

		const result = await processDeadlineLock([roundId])
		console.log('  processDeadlineLock:', JSON.stringify(result))

		const inserted = (
			await db
				.select()
				.from(pick)
				.where(and(eq(pick.gamePlayerId, merit.id), eq(pick.roundId, roundId)))
		)[0]
		if (!inserted) throw new Error('no auto-pick was written — investigate before re-running')
		const t = (await db.select().from(team).where(eq(team.id, inserted.teamId)))[0]
		console.log(
			`  auto-pick: ${t?.shortName} (position ${t?.leaguePosition}) isAuto=${inserted.isAuto}`,
		)
	}

	// --- 2. The paid rebuy that bought nothing.
	console.log(`\nrebuy payment ${rebuyPay.id}: £${rebuyPay.amount} ${rebuyPay.status} → refunded`)
	if (APPLY) {
		await db
			.update(payment)
			.set({ status: 'refunded', refundedAt: new Date() })
			.where(eq(payment.id, rebuyPay.id))
	}

	console.log(`\npot after: £${await pot()}${APPLY ? '' : ' (unchanged — dry run)'}`)
	process.exit(0)
}
main()
