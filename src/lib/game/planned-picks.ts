export interface PastPick {
	roundNumber: number
	teamId: string
}

export interface PlannedPick {
	roundNumber: number
	teamId: string
}

export function computeUsedTeamIds(input: {
	pastPicks: PastPick[]
	plannedPicks: PlannedPick[]
	excludeRoundNumber: number
}): Set<string> {
	const used = new Set<string>()
	for (const p of input.pastPicks) used.add(p.teamId)
	for (const p of input.plannedPicks) {
		if (p.roundNumber === input.excludeRoundNumber) continue
		used.add(p.teamId)
	}
	return used
}

export type ValidationResult =
	| { valid: true }
	| { valid: false; reason: 'team-already-used' | 'team-already-planned'; roundNumber: number }

export function validatePlannedPick(input: {
	teamId: string
	roundNumber: number
	pastPicks: PastPick[]
	plannedPicks: PlannedPick[]
}): ValidationResult {
	const pastHit = input.pastPicks.find((p) => p.teamId === input.teamId)
	if (pastHit)
		return { valid: false, reason: 'team-already-used', roundNumber: pastHit.roundNumber }
	const planHit = input.plannedPicks.find(
		(p) => p.teamId === input.teamId && p.roundNumber !== input.roundNumber,
	)
	if (planHit)
		return { valid: false, reason: 'team-already-planned', roundNumber: planHit.roundNumber }
	return { valid: true }
}
