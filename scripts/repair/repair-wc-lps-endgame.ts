/**
 * One-off prod repair: "World Cup LPS" (classic) endgame record correction.
 * Issue #119 / parent #112 — both outcomes confirmed as deliberate rules
 * calls by the game owner.
 *
 * What it does (all-or-nothing, single transaction):
 *   1. Resolves the stuck Round-of-16 pick (left `pending` on a finished,
 *      decided fixture) as a loss — mirroring settleClassicPickRow: result
 *      via determinePickResult (fixture `winner` authoritative), goals 0.
 *   2. Moves that player's elimination from the quarter-final round to the
 *      Round of 16 (reason: loss). Their post-deadline quarter-final pick
 *      row is kept untouched, as history.
 *   3. Flips the pickless finalist from winner to eliminated in the final
 *      round (reason: no_pick_no_fallback) — they had no legal pick left.
 *   4. Deletes both £80 split payout rows and creates a single £160
 *      non-split payout for the sole remaining winner. ("Void" from the
 *      ticket is implemented as delete + replace: the payout table has no
 *      voided status, and the acceptance criteria require that no split
 *      payout rows remain.)
 *
 * All pick rows are preserved; only the one stuck pick's result changes.
 * Targets are found structurally (the pending pick, the winner without a
 * final-round pick) — never by hardcoded user ids — and every expectation
 * about the current state is asserted before anything is written.
 *
 * Usage (prod):
 *   dry run: doppler run --config prd -- pnpm exec tsx scripts/repair/repair-wc-lps-endgame.ts
 *   apply:   doppler run --config prd -- pnpm exec tsx scripts/repair/repair-wc-lps-endgame.ts --apply
 */

import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { determinePickResult } from '../../src/lib/game-logic/common'
import { user } from '../../src/lib/schema/auth'
import { fixture, round, team } from '../../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../../src/lib/schema/game'
import { payout } from '../../src/lib/schema/payment'
import { fail, heading, toPence, toPounds, WC_LPS_GAME_ID, WC_LPS_GAME_NAME } from './shared'

const EXPECTED_STUCK_TEAM_SHORT = 'COL'
const EXPECTED_SPLIT_PAYOUT_PENCE = 8000 // £80.00 each

type PickRow = typeof pick.$inferSelect

async function userName(userId: string): Promise<string> {
	const row = await db.query.user.findFirst({ where: eq(user.id, userId) })
	return row?.name ?? userId
}

async function main() {
	const apply = process.argv.includes('--apply')

	heading(`Repair: ${WC_LPS_GAME_NAME} endgame — ${apply ? 'APPLY' : 'DRY RUN'}`)

	// ── Game ──────────────────────────────────────────────────────────────
	const g = await db.query.game.findFirst({ where: eq(game.id, WC_LPS_GAME_ID) })
	if (!g) fail(`game ${WC_LPS_GAME_ID} not found`)
	if (g.name !== WC_LPS_GAME_NAME) {
		fail(`game name is ${JSON.stringify(g.name)}, expected ${JSON.stringify(WC_LPS_GAME_NAME)}`)
	}
	if (g.gameMode !== 'classic') fail(`game mode is ${g.gameMode}, expected classic`)
	if (g.status !== 'completed') fail(`game status is ${g.status}, expected completed`)

	const rounds = await db
		.select()
		.from(round)
		.where(eq(round.competitionId, g.competitionId))
		.orderBy(asc(round.number))
	if (rounds.length === 0) fail('no rounds found for competition')
	const finalRound = rounds[rounds.length - 1]
	if (finalRound.name !== 'Final') {
		fail(
			`last round (R${finalRound.number}) is named ${JSON.stringify(finalRound.name)}, expected "Final"`,
		)
	}

	// ── 1. The stuck pick ─────────────────────────────────────────────────
	const pendingPicks = await db
		.select()
		.from(pick)
		.where(and(eq(pick.gameId, g.id), eq(pick.result, 'pending')))
	if (pendingPicks.length !== 1) {
		fail(`expected exactly 1 pending pick, found ${pendingPicks.length}`)
	}
	const stuckPick = pendingPicks[0]

	const r16 = rounds.find((r) => r.id === stuckPick.roundId)
	if (!r16) fail(`stuck pick round ${stuckPick.roundId} not in competition rounds`)
	if (r16.name !== 'Round of 16') {
		fail(`stuck pick is in R${r16.number} ${JSON.stringify(r16.name)}, expected "Round of 16"`)
	}

	const stuckTeam = await db.query.team.findFirst({ where: eq(team.id, stuckPick.teamId) })
	if (!stuckTeam) fail(`stuck pick team ${stuckPick.teamId} not found`)
	if (stuckTeam.shortName !== EXPECTED_STUCK_TEAM_SHORT) {
		fail(`stuck pick team is ${stuckTeam.shortName}, expected ${EXPECTED_STUCK_TEAM_SHORT}`)
	}

	if (stuckPick.fixtureId == null) fail('stuck pick has no fixtureId')
	const fx = await db.query.fixture.findFirst({ where: eq(fixture.id, stuckPick.fixtureId) })
	if (!fx) fail(`stuck pick fixture ${stuckPick.fixtureId} not found`)
	if (fx.status !== 'finished') fail(`stuck pick fixture status is ${fx.status}, expected finished`)
	if (fx.homeScore == null || fx.awayScore == null) fail('stuck pick fixture has no score')

	// Mirror settleClassicPickRow: `winner` is authoritative for knockout ties.
	const resolvedResult = determinePickResult({
		pickedTeamId: stuckPick.teamId,
		homeTeamId: fx.homeTeamId,
		awayTeamId: fx.awayTeamId,
		homeScore: fx.homeScore,
		awayScore: fx.awayScore,
		winner: fx.winner,
	})
	if (resolvedResult !== 'loss') {
		fail(
			`fixture ${fx.homeScore}-${fx.awayScore} (winner=${fx.winner}) resolves the pick as ${resolvedResult}, expected loss`,
		)
	}

	// ── 2. The stuck player's elimination round ───────────────────────────
	const stuckPlayer = await db.query.gamePlayer.findFirst({
		where: eq(gamePlayer.id, stuckPick.gamePlayerId),
	})
	if (!stuckPlayer) fail(`game player ${stuckPick.gamePlayerId} not found`)
	if (stuckPlayer.status !== 'eliminated') {
		fail(`stuck-pick player status is ${stuckPlayer.status}, expected eliminated`)
	}
	const currentElimRound = rounds.find((r) => r.id === stuckPlayer.eliminatedRoundId)
	if (!currentElimRound || currentElimRound.name !== 'Quarter-finals') {
		fail(
			`stuck-pick player is eliminated in ${currentElimRound ? `R${currentElimRound.number} ${JSON.stringify(currentElimRound.name)}` : 'no round'}, expected "Quarter-finals"`,
		)
	}
	const qfHistoryPicks = await db
		.select()
		.from(pick)
		.where(and(eq(pick.gamePlayerId, stuckPlayer.id), eq(pick.roundId, currentElimRound.id)))
	if (qfHistoryPicks.length === 0) {
		fail('expected the post-deadline quarter-final pick row (kept as history) to exist')
	}
	const stuckPlayerName = await userName(stuckPlayer.userId)

	// ── 3. The two crowned winners ────────────────────────────────────────
	const winners = await db
		.select()
		.from(gamePlayer)
		.where(and(eq(gamePlayer.gameId, g.id), eq(gamePlayer.status, 'winner')))
	if (winners.length !== 2) fail(`expected exactly 2 winners, found ${winners.length}`)

	const finalPicksByWinner = new Map<string, PickRow[]>()
	for (const w of winners) {
		finalPicksByWinner.set(
			w.id,
			await db
				.select()
				.from(pick)
				.where(and(eq(pick.gamePlayerId, w.id), eq(pick.roundId, finalRound.id))),
		)
	}
	const pickless = winners.filter((w) => (finalPicksByWinner.get(w.id) ?? []).length === 0)
	if (pickless.length !== 1) {
		fail(`expected exactly 1 winner with no final-round pick, found ${pickless.length}`)
	}
	const picklessFinalist = pickless[0]
	const soleWinner = winners.find((w) => w.id !== picklessFinalist.id)
	if (!soleWinner) fail('unreachable: two winners but no sole winner')
	const soleWinnerFinalPicks = finalPicksByWinner.get(soleWinner.id) ?? []
	if (soleWinnerFinalPicks.length !== 1 || soleWinnerFinalPicks[0].result !== 'win') {
		fail(
			`expected the sole winner to have exactly 1 winning final-round pick, found ${soleWinnerFinalPicks.map((p) => p.result).join(', ') || 'none'}`,
		)
	}
	const picklessName = await userName(picklessFinalist.userId)
	const soleWinnerName = await userName(soleWinner.userId)

	// ── 4. The split payouts ──────────────────────────────────────────────
	const payouts = await db.select().from(payout).where(eq(payout.gameId, g.id))
	if (payouts.length !== 2) fail(`expected exactly 2 payout rows, found ${payouts.length}`)
	for (const p of payouts) {
		if (!p.isSplit) fail(`payout ${p.id} (£${p.amount}) is not a split payout`)
		if (toPence(p.amount) !== EXPECTED_SPLIT_PAYOUT_PENCE) {
			fail(`payout ${p.id} is £${p.amount}, expected £${toPounds(EXPECTED_SPLIT_PAYOUT_PENCE)}`)
		}
	}
	const payoutUserIds = new Set(payouts.map((p) => p.userId))
	const winnerUserIds = new Set(winners.map((w) => w.userId))
	if (payoutUserIds.size !== 2 || [...payoutUserIds].some((userId) => !winnerUserIds.has(userId))) {
		fail('payout user ids do not match the two crowned winners')
	}
	if (payouts[0].status !== payouts[1].status) {
		fail(`split payouts disagree on status (${payouts[0].status} vs ${payouts[1].status})`)
	}
	const newPayoutStatus = payouts[0].status
	const newPayoutPence = payouts.reduce((sum, p) => sum + toPence(p.amount), 0)

	// ── Intended mutations ────────────────────────────────────────────────
	heading('Intended mutations')
	console.log(
		`1. pick ${stuckPick.id} (${stuckPlayerName}, ${stuckTeam.shortName}, R${r16.number} ${r16.name}):\n` +
			`     result pending → loss, goalsScored ${stuckPick.goalsScored ?? 'null'} → 0\n` +
			`     (fixture ${fx.homeScore}-${fx.awayScore}, winner=${fx.winner ?? 'score-decided'})`,
	)
	console.log(
		`2. game_player ${stuckPlayer.id} (${stuckPlayerName}):\n` +
			`     eliminatedRound R${currentElimRound.number} ${currentElimRound.name} → R${r16.number} ${r16.name}, reason ${stuckPlayer.eliminatedReason} → loss\n` +
			`     (their R${currentElimRound.number} pick row${qfHistoryPicks.length > 1 ? 's' : ''} kept untouched as history)`,
	)
	console.log(
		`3. game_player ${picklessFinalist.id} (${picklessName}):\n` +
			`     status winner → eliminated, eliminatedRound → R${finalRound.number} ${finalRound.name}, reason → no_pick_no_fallback`,
	)
	for (const p of payouts) {
		console.log(`4. DELETE payout ${p.id}: £${p.amount} split → ${await userName(p.userId)}`)
	}
	console.log(
		`5. INSERT payout: £${toPounds(newPayoutPence)} non-split → ${soleWinnerName} (status=${newPayoutStatus})`,
	)

	if (!apply) {
		console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
		process.exit(0)
	}

	// ── Apply ─────────────────────────────────────────────────────────────
	await db.transaction(async (tx) => {
		await tx.update(pick).set({ result: 'loss', goalsScored: 0 }).where(eq(pick.id, stuckPick.id))
		await tx
			.update(gamePlayer)
			.set({ eliminatedRoundId: r16.id, eliminatedReason: 'loss' })
			.where(eq(gamePlayer.id, stuckPlayer.id))
		await tx
			.update(gamePlayer)
			.set({
				status: 'eliminated',
				eliminatedRoundId: finalRound.id,
				eliminatedReason: 'no_pick_no_fallback',
			})
			.where(eq(gamePlayer.id, picklessFinalist.id))
		for (const p of payouts) {
			await tx.delete(payout).where(eq(payout.id, p.id))
		}
		await tx.insert(payout).values({
			gameId: g.id,
			userId: soleWinner.userId,
			amount: toPounds(newPayoutPence),
			isSplit: false,
			status: newPayoutStatus,
		})
	})

	// ── Post-apply verification ───────────────────────────────────────────
	heading('Applied — post-state')
	const winnersAfter = await db
		.select()
		.from(gamePlayer)
		.where(and(eq(gamePlayer.gameId, g.id), eq(gamePlayer.status, 'winner')))
	const payoutsAfter = await db.select().from(payout).where(eq(payout.gameId, g.id))
	const pickAfter = await db.query.pick.findFirst({ where: eq(pick.id, stuckPick.id) })
	console.log(`winners: ${winnersAfter.length} (expect 1)`)
	console.log(
		`payouts: ${payoutsAfter.map((p) => `£${p.amount} isSplit=${p.isSplit}`).join(', ')} (expect one £${toPounds(newPayoutPence)} isSplit=false)`,
	)
	console.log(`stuck pick result: ${pickAfter?.result} (expect loss)`)
	console.log('\nRun scripts/repair/inspect-wc-repair.ts for the full corrected record.')
	process.exit(0)
}

main().catch((err) => {
	console.error('Repair failed:', err)
	process.exit(1)
})
