import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { calculatePot, type PotBreakdown } from '@/lib/game-logic/prizes'
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

function sortScore(g: DashboardGame): number {
	if (g.status === 'completed') return 3
	if (g.myStatus === 'eliminated') return 2
	if (!g.myPickSubmitted && g.myStatus === 'alive') return 0 // action needed
	return 1
}
