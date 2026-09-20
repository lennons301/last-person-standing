import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { resolveModeConfig } from '@/lib/game/mode-config'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { resolveRoundAfterStarting, resolveStartingRound } from '@/lib/game/starting-round'
import { calculatePot, type PotBreakdown } from '@/lib/game-logic/prizes'
import { round } from '@/lib/schema/competition'
import { gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export interface DashboardGame {
	id: string
	name: string
	gameMode: 'classic' | 'turbo' | 'cup'
	status: 'setup' | 'open' | 'active' | 'completed'
	competition: string
	playerCount: number
	aliveCount: number
	pot: PotBreakdown
	entryFee: string | null
	myStatus: 'alive' | 'eliminated' | 'winner'
	isAdmin: boolean
	currentRoundName: string | null
	currentRoundDeadline: Date | null
	myPickSubmitted: boolean
	unpaidCount: number
	winnerName: string | null
	/**
	 * Eliminated in the game's own starting round, with rebuys on and the
	 * window still open — see `isRebuyEligible` (`src/lib/game/rebuy.ts`).
	 * The dashboard reads this to keep a rebuy-eligible player's game out of
	 * "past games": a week-1 exit that can still be bought back into is not
	 * the same thing as being fully eliminated (#277).
	 */
	isRebuyEligible: boolean
}

export async function getMyGames(userId: string): Promise<DashboardGame[]> {
	const memberships = await db.query.gamePlayer.findMany({
		where: eq(gamePlayer.userId, userId),
		with: {
			game: {
				with: {
					competition: true,
					currentRound: true,
					players: true,
				},
			},
		},
	})

	const result: DashboardGame[] = []

	for (const membership of memberships) {
		const g = membership.game
		const aliveCount = g.players.filter((p) => p.status === 'alive').length

		// Load payments for this game once and use them for pot + unpaidCount.
		const payments = await db.query.payment.findMany({
			where: eq(payment.gameId, g.id),
		})
		const pot = calculatePot(payments)

		let myPickSubmitted = false
		if (g.currentRoundId) {
			const myPick = await db.query.pick.findFirst({
				where: and(
					eq(pick.gameId, g.id),
					eq(pick.gamePlayerId, membership.id),
					eq(pick.roundId, g.currentRoundId),
				),
			})
			myPickSubmitted = !!myPick
		}

		let unpaidCount = 0
		const winnerName: string | null = null
		if (g.createdBy === userId) {
			unpaidCount = payments.filter((p) => p.status !== 'paid').length
		}

		let rebuyEligible = false
		if (membership.status === 'eliminated') {
			const competitionRounds = await db.query.round.findMany({
				where: eq(round.competitionId, g.competitionId),
			})
			const startingRound = resolveStartingRound(g, competitionRounds)
			const roundAfterStarting = resolveRoundAfterStarting(g, competitionRounds)
			if (startingRound && roundAfterStarting?.deadline) {
				rebuyEligible = isRebuyEligible({
					modeConfig: resolveModeConfig(g),
					gamePlayer: {
						status: membership.status,
						eliminatedRoundId: membership.eliminatedRoundId,
					},
					startingRound: { id: startingRound.id },
					roundAfterStarting: { deadline: roundAfterStarting.deadline },
					paymentRowCount: payments.filter((p) => p.userId === userId).length,
					now: new Date(),
				})
			}
		}

		result.push({
			id: g.id,
			name: g.name,
			gameMode: g.gameMode,
			status: g.status,
			competition: g.competition.name,
			playerCount: g.players.length,
			aliveCount,
			pot,
			entryFee: g.entryFee,
			myStatus: membership.status,
			isAdmin: g.createdBy === userId,
			currentRoundName: g.currentRound?.name ?? null,
			currentRoundDeadline: g.currentRound?.deadline ?? null,
			myPickSubmitted,
			unpaidCount,
			winnerName,
			isRebuyEligible: rebuyEligible,
		})
	}

	// Sort: games needing action first, then active, then completed
	result.sort((a, b) => {
		const scoreA = sortScore(a)
		const scoreB = sortScore(b)
		return scoreA - scoreB
	})

	return result
}

/**
 * Is this game done as far as the dashboard is concerned — completed, or an
 * elimination with no rebuy window left to act on?
 *
 * A rebuy-eligible elimination reads false: the starting-round exit is real,
 * but the window to buy back in is still open, so it isn't this player's
 * final word on the game the way a plain elimination is (#277). Both the
 * sort order and the dashboard's active/past split read this one function
 * rather than spelling the condition twice.
 */
export function isPastGame(
	g: Pick<DashboardGame, 'status' | 'myStatus' | 'isRebuyEligible'>,
): boolean {
	if (g.status === 'completed') return true
	return g.myStatus === 'eliminated' && !g.isRebuyEligible
}

function sortScore(g: DashboardGame): number {
	if (isPastGame(g)) return g.status === 'completed' ? 3 : 2
	if (!g.myPickSubmitted && g.myStatus === 'alive') return 0 // action needed
	if (g.isRebuyEligible) return 0 // rebuy window closing — action needed
	return 1
}
