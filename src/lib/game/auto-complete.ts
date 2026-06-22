import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	classicTiebreaker,
	cupTiebreaker,
	type TurboTiebreakerInput,
	turboTiebreaker,
} from '@/lib/game-logic/auto-complete-tiebreakers'
import { calculatePayouts, calculatePot } from '@/lib/game-logic/prizes'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment, payout } from '@/lib/schema/payment'

export type CompletionReason =
	| 'last-alive'
	| 'mass-extinction'
	| 'rounds-exhausted'
	| 'turbo-single-round'
	| 'cup-round1-reprieve'
	| 'cup-wipeout-refund'

export interface CompletionCheckResult {
	completed: boolean
	winnerPlayerIds: string[]
	reason?: CompletionReason
}

async function nextRoundExists(
	competitionId: string,
	completedRoundNumber: number,
): Promise<boolean> {
	const next = await db.query.round.findFirst({
		where: and(eq(round.competitionId, competitionId), gt(round.number, completedRoundNumber)),
		orderBy: [asc(round.number)],
	})
	return next != null
}

async function tiebreakClassicByGoals(
	gameId: string,
	candidatePlayerIds: string[],
): Promise<string[]> {
	const allPicks = await db.query.pick.findMany({
		where: eq(pick.gameId, gameId),
	})
	const inputs = candidatePlayerIds.map((pid) => ({
		gamePlayerId: pid,
		totalWinningGoals: allPicks
			.filter((p) => p.gamePlayerId === pid && p.result === 'win')
			.reduce((sum, p) => sum + (p.goalsScored ?? 0), 0),
	}))
	return classicTiebreaker(inputs)
}

async function tiebreakCup(
	gameId: string,
	candidates: { id: string; livesRemaining: number }[],
): Promise<string[]> {
	const allPicks = await db.query.pick.findMany({
		where: eq(pick.gameId, gameId),
	})
	const inputs = candidates.map((c) => {
		const myPicks = allPicks.filter((p) => p.gamePlayerId === c.id)
		const cumulativeStreak = myPicks.filter(
			(p) => p.result === 'win' || p.result === 'draw' || p.result === 'saved_by_life',
		).length
		const cumulativeGoals = myPicks.reduce((sum, p) => sum + (p.goalsScored ?? 0), 0)
		return {
			gamePlayerId: c.id,
			cumulativeStreak,
			livesRemaining: c.livesRemaining,
			cumulativeGoals,
		}
	})
	return cupTiebreaker(inputs)
}

export async function checkClassicCompletion(
	gameId: string,
	competitionId: string,
	completedRoundId: string,
	completedRoundNumber: number,
): Promise<CompletionCheckResult> {
	const allPlayers = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.gameId, gameId),
	})
	const alive = allPlayers.filter((p) => p.status === 'alive')

	if (alive.length === 1) {
		return { completed: true, winnerPlayerIds: [alive[0].id], reason: 'last-alive' }
	}

	if (alive.length === 0) {
		const cohort = allPlayers.filter(
			(p) => p.status === 'eliminated' && p.eliminatedRoundId === completedRoundId,
		)
		if (cohort.length === 0) return { completed: false, winnerPlayerIds: [] }
		const winners = await tiebreakClassicByGoals(
			gameId,
			cohort.map((p) => p.id),
		)
		return { completed: true, winnerPlayerIds: winners, reason: 'mass-extinction' }
	}

	const hasNext = await nextRoundExists(competitionId, completedRoundNumber)
	if (!hasNext) {
		const winners = await tiebreakClassicByGoals(
			gameId,
			alive.map((p) => p.id),
		)
		return { completed: true, winnerPlayerIds: winners, reason: 'rounds-exhausted' }
	}

	return { completed: false, winnerPlayerIds: [] }
}

export function checkTurboCompletion(playerScores: TurboTiebreakerInput[]): CompletionCheckResult {
	const winners = turboTiebreaker(playerScores)
	return {
		completed: true,
		winnerPlayerIds: winners,
		reason: 'turbo-single-round',
	}
}

export async function checkCupCompletion(
	gameId: string,
	competitionId: string,
	completedRoundId: string,
	completedRoundNumber: number,
): Promise<CompletionCheckResult> {
	const allPlayers = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.gameId, gameId),
	})
	const alive = allPlayers.filter((p) => p.status === 'alive')

	if (alive.length === 1) {
		return { completed: true, winnerPlayerIds: [alive[0].id], reason: 'last-alive' }
	}

	if (alive.length === 0) {
		const cohort = allPlayers.filter(
			(p) => p.status === 'eliminated' && p.eliminatedRoundId === completedRoundId,
		)
		if (cohort.length === 0) return { completed: false, winnerPlayerIds: [] }

		const hasNext = await nextRoundExists(competitionId, completedRoundNumber)

		// Round-1 reprieve: a mass loss in the FIRST round crowns nobody — the
		// whole field advances to round 2 and competes again (the caller resets
		// everyone to alive + advances). Only when there's a next round to go to;
		// a single-round cup falls through to a normal mass-extinction crown.
		if (completedRoundNumber === 1 && hasNext) {
			return { completed: false, winnerPlayerIds: [], reason: 'cup-round1-reprieve' }
		}

		// Consecutive-wipeout refund: after a round-1 reprieve the whole field
		// carries into round 2. If THAT round is also a total wipeout there's no
		// rightful winner → refund. cohort == all players ⟺ nobody survived an
		// earlier round ⟺ this field only exists because round 1 was reprieved.
		if (completedRoundNumber > 1 && cohort.length === allPlayers.length) {
			return { completed: true, winnerPlayerIds: [], reason: 'cup-wipeout-refund' }
		}

		// Normal mass-extinction: crown the best of the just-eliminated cohort by
		// tiebreaker. A losing pick winning here is intended.
		const winners = await tiebreakCup(gameId, cohort)
		return { completed: true, winnerPlayerIds: winners, reason: 'mass-extinction' }
	}

	const hasNext = await nextRoundExists(competitionId, completedRoundNumber)
	if (!hasNext) {
		const winners = await tiebreakCup(gameId, alive)
		return { completed: true, winnerPlayerIds: winners, reason: 'rounds-exhausted' }
	}

	return { completed: false, winnerPlayerIds: [] }
}

export async function applyAutoCompletion(
	gameId: string,
	winnerPlayerIds: string[],
): Promise<void> {
	if (winnerPlayerIds.length === 0) return

	for (const playerId of winnerPlayerIds) {
		await db.update(gamePlayer).set({ status: 'winner' }).where(eq(gamePlayer.id, playerId))
	}

	const players = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.gameId, gameId),
	})
	const winnerUserIds = winnerPlayerIds
		.map((pid) => players.find((p) => p.id === pid)?.userId)
		.filter((u): u is string => u != null)

	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, gameId),
	})
	const pot = calculatePot(payments)
	const payoutEntries = calculatePayouts(pot.total, winnerUserIds)
	if (payoutEntries.length > 0) {
		await db.insert(payout).values(
			payoutEntries.map((p) => ({
				gameId,
				userId: p.userId,
				amount: p.amount,
				isSplit: p.isSplit,
			})),
		)
	}

	await db
		.update(game)
		.set({ status: 'completed', currentRoundId: null })
		.where(eq(game.id, gameId))
}

/**
 * No-winner completion: refund every entrant's collected (paid/claimed) payment,
 * write no payout, and mark the game completed. Used when a cup/turbo game ends
 * with no rightful winner — a total wipeout in the round following a round-1
 * reprieve. Pending/unpaid rows are left as-is; no money was in them.
 */
export async function applyNoWinnerRefund(gameId: string): Promise<void> {
	await db
		.update(payment)
		.set({ status: 'refunded', refundedAt: new Date() })
		.where(and(eq(payment.gameId, gameId), inArray(payment.status, ['paid', 'claimed'])))

	await db
		.update(game)
		.set({ status: 'completed', currentRoundId: null })
		.where(eq(game.id, gameId))
}
