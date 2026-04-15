type ValidationResult = { valid: true } | { valid: false; reason: string }

export interface ClassicPickValidation {
	teamId: string
	playerStatus: 'alive' | 'eliminated' | 'winner'
	roundStatus: 'upcoming' | 'open' | 'active' | 'completed'
	deadline: Date | null
	now: Date
	usedTeamIds: string[]
	fixtureTeamIds: string[]
}

export function validateClassicPick(input: ClassicPickValidation): ValidationResult {
	if (input.playerStatus !== 'alive') return { valid: false, reason: 'Player is not alive' }
	if (input.roundStatus !== 'open') return { valid: false, reason: 'Round is not open for picks' }
	if (input.deadline && input.now > input.deadline)
		return { valid: false, reason: 'Deadline has passed' }
	if (input.usedTeamIds.includes(input.teamId))
		return { valid: false, reason: 'Team already used in a previous round' }
	if (!input.fixtureTeamIds.includes(input.teamId))
		return { valid: false, reason: 'Team is not playing in this round' }
	return { valid: true }
}

export interface TurboPickEntry {
	fixtureId: string
	confidenceRank: number
	predictedResult: 'home_win' | 'draw' | 'away_win'
}

export interface TurboPicksValidation {
	playerStatus: 'alive' | 'eliminated' | 'winner'
	roundStatus: 'upcoming' | 'open' | 'active' | 'completed'
	deadline: Date | null
	now: Date
	numberOfPicks: number
	fixtureIds: string[]
	picks: TurboPickEntry[]
}

export function validateTurboPicks(input: TurboPicksValidation): ValidationResult {
	if (input.playerStatus !== 'alive') return { valid: false, reason: 'Player is not alive' }
	if (input.roundStatus !== 'open') return { valid: false, reason: 'Round is not open for picks' }
	if (input.deadline && input.now > input.deadline)
		return { valid: false, reason: 'Deadline has passed' }
	if (input.picks.length !== input.numberOfPicks)
		return {
			valid: false,
			reason: `Expected ${input.numberOfPicks} picks, got ${input.picks.length}`,
		}

	const fixtureSet = new Set(input.picks.map((p) => p.fixtureId))
	if (fixtureSet.size !== input.picks.length)
		return { valid: false, reason: 'Duplicate fixture in picks' }

	const ranks = input.picks.map((p) => p.confidenceRank).sort((a, b) => a - b)
	const expected = Array.from({ length: input.numberOfPicks }, (_, i) => i + 1)
	if (JSON.stringify(ranks) !== JSON.stringify(expected))
		return { valid: false, reason: 'Confidence ranks must be unique sequential integers from 1' }

	for (const pick of input.picks) {
		if (!input.fixtureIds.includes(pick.fixtureId))
			return { valid: false, reason: `Invalid fixture ID: ${pick.fixtureId}` }
	}

	return { valid: true }
}
