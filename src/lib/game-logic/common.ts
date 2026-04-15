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
}

export function determinePickResult(input: PickResultInput): PickResult {
	const outcome = determineFixtureOutcome(input.homeScore, input.awayScore)
	const pickedHome = input.pickedTeamId === input.homeTeamId
	if (outcome === 'draw') return 'draw'
	if (pickedHome && outcome === 'home_win') return 'win'
	if (!pickedHome && outcome === 'away_win') return 'win'
	return 'loss'
}
