// Tiebreaker rules ported from the predecessor app, with explicit secondary
// rules where the old SQL had undefined ordering. Confirmed 2026-05-07.

export interface ClassicTiebreakerInput {
	gamePlayerId: string
	totalWinningGoals: number
}

export interface TurboTiebreakerInput {
	gamePlayerId: string
	streak: number
	goalsInStreak: number
}

export interface CupTiebreakerInput {
	gamePlayerId: string
	cumulativeStreak: number
	livesRemaining: number
	cumulativeGoals: number
}

function maxBy<T>(items: T[], key: (t: T) => number): T[] {
	if (items.length === 0) return []
	const max = items.reduce((m, t) => Math.max(m, key(t)), Number.NEGATIVE_INFINITY)
	return items.filter((t) => key(t) === max)
}

export function classicTiebreaker(players: ClassicTiebreakerInput[]): string[] {
	const top = maxBy(players, (p) => p.totalWinningGoals)
	return top.map((p) => p.gamePlayerId)
}

export function turboTiebreaker(players: TurboTiebreakerInput[]): string[] {
	const topStreak = maxBy(players, (p) => p.streak)
	if (topStreak.length <= 1) return topStreak.map((p) => p.gamePlayerId)
	const topGoals = maxBy(topStreak, (p) => p.goalsInStreak)
	return topGoals.map((p) => p.gamePlayerId)
}

export function cupTiebreaker(players: CupTiebreakerInput[]): string[] {
	const topStreak = maxBy(players, (p) => p.cumulativeStreak)
	if (topStreak.length <= 1) return topStreak.map((p) => p.gamePlayerId)
	const topLives = maxBy(topStreak, (p) => p.livesRemaining)
	if (topLives.length <= 1) return topLives.map((p) => p.gamePlayerId)
	const topGoals = maxBy(topLives, (p) => p.cumulativeGoals)
	return topGoals.map((p) => p.gamePlayerId)
}
