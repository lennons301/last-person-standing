import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	classicTiebreaker,
	cupTiebreaker,
	resolveWipeout,
	turboTiebreaker,
	type WipeoutPlayerInput,
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
	| 'turbo-total-wipeout'
	| 'cup-longest-streak'
	| 'cup-total-wipeout'

export interface CompletionCheckResult {
	completed: boolean
	winnerPlayerIds: string[]
	reason?: CompletionReason
	/** total wipeout — every player got every pick wrong → refund everyone, no payout. */
	refund?: boolean
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

/**
 * Turbo is a SINGLE round decided by the longest streak of correct predictions.
 * The wipeout rule (see `resolveWipeout`) skips any leading ranks that were a
 * universal loss, then crowns the longest rebased streak (tiebreak: goals — no
 * lives in turbo). A total wipeout (no player got a single pick right anywhere)
 * refunds everyone with no winner. The caller only invokes this once the round
 * is fully settled.
 */
export function checkTurboCompletion(players: WipeoutPlayerInput[]): CompletionCheckResult {
	if (players.length === 0) {
		return { completed: true, winnerPlayerIds: [], reason: 'turbo-single-round' }
	}
	const outcome = resolveWipeout(players)
	if (outcome.totalWipeout) {
		return {
			completed: true,
			winnerPlayerIds: [],
			reason: 'turbo-total-wipeout',
			refund: true,
		}
	}
	const winners = turboTiebreaker(
		outcome.scores.map((s) => ({
			gamePlayerId: s.gamePlayerId,
			streak: s.streak,
			goalsInStreak: s.goalsInStreak,
		})),
	)
	return { completed: true, winnerPlayerIds: winners, reason: 'turbo-single-round' }
}

/**
 * Cup is a SINGLE gameweek decided by the longest streak (with the tier
 * handicap + lives folded into the streak). The caller only invokes this once
 * the whole gameweek is fully settled.
 *
 * The streak is a *consecutive* run of surviving picks (win / draw_success /
 * saved_by_life) counted in confidence-rank order — the wipeout rule
 * (`resolveWipeout`) skips any leading ranks that were a universal loss, so the
 * game restarts from the first rank anyone got right, then crowns the longest
 * rebased streak (tiebreak: lives → goals). The winner can be a player whose
 * streak later *broke*: a long broken streak still beats a short unbroken one.
 * A total wipeout (no rank has a single correct pick anywhere) refunds everyone
 * with no winner. No per-round elimination winner and no advancement — cup
 * never spans gameweeks.
 */
export async function checkCupCompletion(gameId: string): Promise<CompletionCheckResult> {
	const allPlayers = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.gameId, gameId),
	})
	if (allPlayers.length === 0) return { completed: false, winnerPlayerIds: [] }

	const allPicks = await db.query.pick.findMany({
		where: eq(pick.gameId, gameId),
	})
	const players: WipeoutPlayerInput[] = allPlayers.map((p) => ({
		gamePlayerId: p.id,
		livesRemaining: p.livesRemaining,
		picks: allPicks
			.filter((pk) => pk.gamePlayerId === p.id)
			// Settled, non-void picks only. Void (cancelled fixture) and pending
			// picks contribute nothing — the streak walks past a void gap and stops
			// at any pending pick (there should be none once the gameweek is done).
			.filter((pk) => pk.result != null && pk.result !== 'void' && pk.result !== 'pending')
			.map((pk) => ({
				rank: pk.confidenceRank ?? 0,
				correct: pk.result === 'win' || pk.result === 'draw' || pk.result === 'saved_by_life',
				goals: pk.goalsScored ?? 0,
			})),
	}))

	const outcome = resolveWipeout(players)
	if (outcome.totalWipeout) {
		return {
			completed: true,
			winnerPlayerIds: [],
			reason: 'cup-total-wipeout',
			refund: true,
		}
	}
	const winners = cupTiebreaker(
		outcome.scores.map((s) => ({
			gamePlayerId: s.gamePlayerId,
			cumulativeStreak: s.streak,
			livesRemaining: s.livesRemaining,
			cumulativeGoals: s.goalsInStreak,
		})),
	)
	return { completed: true, winnerPlayerIds: winners, reason: 'cup-longest-streak' }
}

export async function applyAutoCompletion(
	gameId: string,
	winnerPlayerIds: string[],
	options?: { refund?: boolean },
): Promise<void> {
	// Total wipeout: no winner. Refund every contributing stake and complete the
	// game. No payout rows are written.
	if (options?.refund) {
		await db
			.update(payment)
			.set({ status: 'refunded', refundedAt: new Date() })
			.where(and(eq(payment.gameId, gameId), inArray(payment.status, ['paid', 'claimed'])))
		await db
			.update(game)
			.set({ status: 'completed', currentRoundId: null })
			.where(eq(game.id, gameId))
		return
	}

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
