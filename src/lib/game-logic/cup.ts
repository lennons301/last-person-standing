import { determineFixtureOutcome } from './common'

export interface CupPickInput {
	confidenceRank: number
	predictedResult: 'home_win' | 'draw' | 'away_win'
	homeScore: number
	awayScore: number
	tierDifference: number
}

export interface CupPickResult {
	confidenceRank: number
	correct: boolean
	lifeGained: boolean
	lifeLost: boolean
	savedByDraw: boolean
	goalsCounted: number
}

export interface CupResult {
	livesChange: number
	finalLives: number
	eliminated: boolean
	pickResults: CupPickResult[]
}

export function evaluateCupPicks(picks: CupPickInput[], startingLives: number): CupResult {
	const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)
	let currentLives = startingLives
	let livesChange = 0
	let eliminated = false
	const pickResults: CupPickResult[] = []

	for (const pick of sorted) {
		if (eliminated) {
			pickResults.push({
				confidenceRank: pick.confidenceRank,
				correct: false,
				lifeGained: false,
				lifeLost: false,
				savedByDraw: false,
				goalsCounted: 0,
			})
			continue
		}

		const actualOutcome = determineFixtureOutcome(pick.homeScore, pick.awayScore)
		const correct = actualOutcome === pick.predictedResult
		const isHighTierMismatch = pick.tierDifference >= 2
		const isDraw = actualOutcome === 'draw'
		const goalsCounted = pick.tierDifference === -1 ? 0 : pick.homeScore + pick.awayScore

		let lifeGained = false
		let lifeLost = false
		let savedByDraw = false

		if (correct) {
			if (isHighTierMismatch) {
				lifeGained = true
				currentLives++
				livesChange++
			}
		} else if (isDraw && isHighTierMismatch) {
			savedByDraw = true
		} else {
			if (currentLives > 0) {
				lifeLost = true
				currentLives--
				livesChange--
			} else {
				eliminated = true
				lifeLost = true
				livesChange--
			}
		}

		pickResults.push({
			confidenceRank: pick.confidenceRank,
			correct,
			lifeGained,
			lifeLost,
			savedByDraw,
			goalsCounted,
		})
	}

	return { livesChange, finalLives: Math.max(0, currentLives), eliminated, pickResults }
}
