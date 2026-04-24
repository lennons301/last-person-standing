interface FixtureRef {
	id: string
	homeTeamId: string
	awayTeamId: string
}

interface PickLowestRankedInput {
	fixtures: FixtureRef[]
	usedTeamIds: Set<string>
	teamPositions: Map<string, number>
}

export function pickLowestRankedUnusedTeam({
	fixtures,
	usedTeamIds,
	teamPositions,
}: PickLowestRankedInput): string | null {
	const candidates = new Set<string>()
	for (const fx of fixtures) {
		if (!usedTeamIds.has(fx.homeTeamId)) candidates.add(fx.homeTeamId)
		if (!usedTeamIds.has(fx.awayTeamId)) candidates.add(fx.awayTeamId)
	}
	if (candidates.size === 0) return null

	let best: { teamId: string; position: number } | null = null
	for (const teamId of candidates) {
		const position = teamPositions.get(teamId) ?? Number.POSITIVE_INFINITY
		if (best === null) {
			best = { teamId, position }
			continue
		}
		if (position > best.position) {
			best = { teamId, position }
		} else if (position === best.position && teamId < best.teamId) {
			best = { teamId, position }
		}
	}
	return best?.teamId ?? null
}
