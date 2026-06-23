export type FixtureOutcome = 'home_win' | 'away_win' | 'draw'
export type PickResult = 'win' | 'loss' | 'draw'

export function determineFixtureOutcome(homeScore: number, awayScore: number): FixtureOutcome {
	if (homeScore > awayScore) return 'home_win'
	if (awayScore > homeScore) return 'away_win'
	return 'draw'
}

export interface PickResultInput {
	pickedTeamId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number
	awayScore: number
	/**
	 * Authoritative match winner for a fixture decided after a level full-time
	 * score (extra time / penalties — football-data `score.winner`). When set it
	 * overrides the score, so there's no draw. Null/undefined → use the score
	 * (the normal case, incl. legitimate group-stage draws).
	 */
	winner?: 'home' | 'away' | null
}

export function determinePickResult(input: PickResultInput): PickResult {
	const pickedHome = input.pickedTeamId === input.homeTeamId
	if (input.winner != null) {
		return (pickedHome ? 'home' : 'away') === input.winner ? 'win' : 'loss'
	}
	const outcome = determineFixtureOutcome(input.homeScore, input.awayScore)
	if (outcome === 'draw') return 'draw'
	if (pickedHome && outcome === 'home_win') return 'win'
	if (!pickedHome && outcome === 'away_win') return 'win'
	return 'loss'
}
