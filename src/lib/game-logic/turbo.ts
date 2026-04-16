import { determineFixtureOutcome } from './common'

export interface TurboPickInput {
	confidenceRank: number
	predictedResult: 'home_win' | 'draw' | 'away_win'
	homeScore: number
	awayScore: number
}

export interface TurboResult {
	streak: number
	goalsInStreak: number
	pickResults: Array<{ confidenceRank: number; correct: boolean; goals: number }>
}

export function evaluateTurboPicks(picks: TurboPickInput[]): TurboResult {
	if (picks.length === 0) return { streak: 0, goalsInStreak: 0, pickResults: [] }

	const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)
	let streak = 0
	let goalsInStreak = 0
	let streakBroken = false

	const pickResults = sorted.map((pick) => {
		const actualOutcome = determineFixtureOutcome(pick.homeScore, pick.awayScore)
		const correct = actualOutcome === pick.predictedResult
		let goals = 0
		if (correct) {
			if (pick.predictedResult === 'home_win') goals = pick.homeScore
			else if (pick.predictedResult === 'away_win') goals = pick.awayScore
			else goals = pick.homeScore + pick.awayScore
		}
		if (!streakBroken && correct) {
			streak++
			goalsInStreak += goals
		} else {
			streakBroken = true
		}
		return { confidenceRank: pick.confidenceRank, correct, goals }
	})

	return { streak, goalsInStreak, pickResults }
}

export interface TurboPlayerScore {
	gamePlayerId: string
	streak: number
	goalsInStreak: number
}

export interface TurboStanding extends TurboPlayerScore {
	position: number
}

export function calculateTurboStandings(players: TurboPlayerScore[]): TurboStanding[] {
	const sorted = [...players].sort((a, b) => {
		if (b.streak !== a.streak) return b.streak - a.streak
		return b.goalsInStreak - a.goalsInStreak
	})
	return sorted.map((player, index) => ({ ...player, position: index + 1 }))
}
