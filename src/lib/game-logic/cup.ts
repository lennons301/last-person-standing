export interface CupPickInput {
	confidenceRank: number
	pickedTeam: 'home' | 'away'
	homeScore: number
	awayScore: number
	tierDifference: number // from HOME team perspective: positive = home higher tier
	/**
	 * Authoritative winner for a knockout fixture decided on ET/penalties (level
	 * full-time score). When set it overrides the score: the match is a win for
	 * that side, never a draw. Null/undefined → use the score.
	 */
	winner?: 'home' | 'away' | null
}

export interface CupPickResult {
	confidenceRank: number
	result: 'win' | 'draw_success' | 'saved_by_life' | 'loss' | 'restricted'
	livesGained: number
	goalsCounted: number
	restricted: boolean
}

export interface CupResult {
	finalLives: number
	eliminated: boolean
	pickResults: CupPickResult[]
}

export function evaluateCupPicks(picks: CupPickInput[], startingLives: number): CupResult {
	const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)
	let currentLives = startingLives
	let streakBroken = false
	const pickResults: CupPickResult[] = []

	for (const pick of sorted) {
		const tierDiffFromPicked =
			pick.pickedTeam === 'home' ? pick.tierDifference : -pick.tierDifference

		if (tierDiffFromPicked > 1) {
			pickResults.push({
				confidenceRank: pick.confidenceRank,
				result: 'restricted',
				livesGained: 0,
				goalsCounted: 0,
				restricted: true,
			})
			continue
		}

		const pickedTeamGoals = pick.pickedTeam === 'home' ? pick.homeScore : pick.awayScore
		const opponentGoals = pick.pickedTeam === 'home' ? pick.awayScore : pick.homeScore
		// A recorded winner (ET/penalties) is authoritative — the match is a win
		// for that side and never a draw, regardless of the level full-time score.
		const pickedTeamWon =
			pick.winner != null ? pick.winner === pick.pickedTeam : pickedTeamGoals > opponentGoals
		const isDraw = pick.winner != null ? false : pickedTeamGoals === opponentGoals

		let result: CupPickResult['result'] = 'loss'
		let livesGained = 0
		let goalsCounted = 0

		if (pickedTeamWon) {
			result = 'win'
			if (tierDiffFromPicked !== 1) {
				goalsCounted = pickedTeamGoals
			}
			// Lives are earned only while the streak is alive. A win after the
			// streak has broken (the player is already eliminated) earns nothing
			// usable — counting it would inflate the lives tiebreaker with lives
			// the player can never spend. Goals still count; only life accrual is
			// frozen at the eliminating pick.
			if (tierDiffFromPicked < 0 && !streakBroken) {
				livesGained = Math.abs(tierDiffFromPicked)
				currentLives += livesGained
			}
		} else if (isDraw) {
			if (tierDiffFromPicked <= -1) {
				result = 'draw_success'
				// Goals NOT counted on draw_success (matches old app stored procedure)
				if (tierDiffFromPicked <= -2 && !streakBroken) {
					livesGained = 1
					currentLives += 1
				}
			} else {
				if (!streakBroken && currentLives > 0) {
					result = 'saved_by_life'
					currentLives--
					goalsCounted = pickedTeamGoals
				} else {
					result = 'loss'
					streakBroken = true
				}
			}
		} else {
			if (!streakBroken && currentLives > 0) {
				result = 'saved_by_life'
				currentLives--
				goalsCounted = pickedTeamGoals
			} else {
				result = 'loss'
				streakBroken = true
			}
		}

		pickResults.push({
			confidenceRank: pick.confidenceRank,
			result,
			livesGained,
			goalsCounted,
			restricted: false,
		})
	}

	return { finalLives: currentLives, eliminated: streakBroken, pickResults }
}
