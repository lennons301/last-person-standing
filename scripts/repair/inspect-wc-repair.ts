/**
 * Read-only inspector for the two games covered by issue #119.
 *
 * Prints the full endgame state of "World Cup LPS" (players, picks by round,
 * payouts, payments) and the existence + dependent-row census of the
 * "SI World Cup" husk game. SELECT-only — safe to run against prod at any
 * time, before or after the repair scripts.
 *
 * Usage (prod):
 *   doppler run --config prd -- pnpm exec tsx scripts/repair/inspect-wc-repair.ts
 */

import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { user } from '../../src/lib/schema/auth'
import { round, team } from '../../src/lib/schema/competition'
import { game, gamePlayer, pick, plannedPick } from '../../src/lib/schema/game'
import { payment, payout } from '../../src/lib/schema/payment'
import { heading, SI_WC_GAME_ID, WC_LPS_GAME_ID } from './shared'

async function userNames(userIds: string[]): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map()
	const rows = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, userIds))
	return new Map(rows.map((r) => [r.id, r.name]))
}

async function inspectWcLps(): Promise<void> {
	heading(`World Cup LPS — ${WC_LPS_GAME_ID}`)

	const g = await db.query.game.findFirst({ where: eq(game.id, WC_LPS_GAME_ID) })
	if (!g) {
		console.log('Game NOT FOUND.')
		return
	}
	console.log(
		`name=${JSON.stringify(g.name)} mode=${g.gameMode} status=${g.status} currentRoundId=${g.currentRoundId}`,
	)

	const rounds = await db
		.select()
		.from(round)
		.where(eq(round.competitionId, g.competitionId))
		.orderBy(asc(round.number))
	const roundById = new Map(rounds.map((r) => [r.id, r]))
	const roundLabel = (roundId: string | null) => {
		if (roundId == null) return '—'
		const r = roundById.get(roundId)
		return r ? `R${r.number} ${r.name ?? ''}`.trim() : roundId
	}

	const players = await db.select().from(gamePlayer).where(eq(gamePlayer.gameId, g.id))
	const names = await userNames(players.map((p) => p.userId))

	console.log(`\nPlayers (${players.length}):`)
	for (const p of players) {
		const elim =
			p.status === 'eliminated'
				? ` eliminatedIn=${roundLabel(p.eliminatedRoundId)} reason=${p.eliminatedReason}`
				: ''
		console.log(`  ${names.get(p.userId) ?? p.userId}: ${p.status}${elim}`)
	}

	const picks = await db
		.select({
			playerId: pick.gamePlayerId,
			roundId: pick.roundId,
			result: pick.result,
			goals: pick.goalsScored,
			teamShort: team.shortName,
			createdAt: pick.createdAt,
		})
		.from(pick)
		.innerJoin(team, eq(pick.teamId, team.id))
		.where(eq(pick.gameId, g.id))
	const playerById = new Map(players.map((p) => [p.id, p]))
	const byRound = new Map<string, typeof picks>()
	for (const p of picks) {
		const bucket = byRound.get(p.roundId) ?? []
		bucket.push(p)
		byRound.set(p.roundId, bucket)
	}
	console.log(`\nPicks (${picks.length}):`)
	for (const r of rounds) {
		const bucket = byRound.get(r.id)
		if (!bucket) continue
		console.log(`  ${roundLabel(r.id)} deadline=${r.deadline?.toISOString() ?? '—'}:`)
		for (const p of bucket) {
			const who = playerById.get(p.playerId)
			const name = who ? (names.get(who.userId) ?? who.userId) : p.playerId
			console.log(
				`    ${name}: ${p.teamShort} → ${p.result} (goals=${p.goals ?? '—'}, made=${p.createdAt.toISOString()})`,
			)
		}
	}

	const payouts = await db.select().from(payout).where(eq(payout.gameId, g.id))
	console.log(`\nPayouts (${payouts.length}):`)
	for (const p of payouts) {
		console.log(
			`  ${names.get(p.userId) ?? p.userId}: £${p.amount} isSplit=${p.isSplit} status=${p.status} id=${p.id}`,
		)
	}

	const payments = await db.select().from(payment).where(eq(payment.gameId, g.id))
	const byStatus = new Map<string, number>()
	for (const p of payments) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1)
	console.log(
		`\nPayments (${payments.length}): ${[...byStatus].map(([s, n]) => `${s}=${n}`).join(' ')}`,
	)
}

async function inspectSiWorldCup(): Promise<void> {
	heading(`SI World Cup — ${SI_WC_GAME_ID}`)

	const g = await db.query.game.findFirst({ where: eq(game.id, SI_WC_GAME_ID) })
	if (!g) {
		console.log('Game NOT FOUND (deleted or never existed).')
		return
	}
	console.log(
		`name=${JSON.stringify(g.name)} mode=${g.gameMode} status=${g.status} createdAt=${g.createdAt.toISOString()}`,
	)

	const players = await db.select().from(gamePlayer).where(eq(gamePlayer.gameId, g.id))
	const names = await userNames(players.map((p) => p.userId))
	const picks = await db.select().from(pick).where(eq(pick.gameId, g.id))
	const planned =
		players.length > 0
			? await db
					.select()
					.from(plannedPick)
					.where(
						inArray(
							plannedPick.gamePlayerId,
							players.map((p) => p.id),
						),
					)
			: []
	const payments = await db.select().from(payment).where(eq(payment.gameId, g.id))
	const payouts = await db.select().from(payout).where(eq(payout.gameId, g.id))

	console.log(
		`Dependent rows: players=${players.length} picks=${picks.length} plannedPicks=${planned.length} payments=${payments.length} payouts=${payouts.length}`,
	)
	for (const p of players) {
		console.log(`  player: ${names.get(p.userId) ?? p.userId} status=${p.status}`)
	}
	for (const p of payments) {
		console.log(`  payment: ${names.get(p.userId) ?? p.userId} £${p.amount} status=${p.status}`)
	}
}

async function main() {
	await inspectWcLps()
	await inspectSiWorldCup()
	console.log()
	process.exit(0)
}

main().catch((err) => {
	console.error('Inspect failed:', err)
	process.exit(1)
})
