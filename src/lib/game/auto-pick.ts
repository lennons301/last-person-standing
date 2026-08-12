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

/**
 * The fallback pick for a player who missed the deadline: the worst-placed team
 * in the round they haven't already used — worst placed meaning highest league
 * position in the table the standings sync last persisted.
 *
 * Pre-season that table is the competition's opening one (see `openingTable` in
 * bootstrap-competitions): every club at zero, so the tiebreak chain resolves to
 * alphabetical and this returns **the alphabetically-last club in the round** —
 * West Ham or Wolves, on a full Premier League gameweek. That is arbitrary as
 * football, but it is deterministic and it is a real team on a real position:
 * before the opening table existed, an unpositioned club fell to the
 * Infinity default below and the pick landed on whichever id sorted first.
 *
 * Missing positions still default to Infinity — a competition whose sync has
 * never run has no table to be worst in, and picking a team is better than
 * eliminating the player.
 */
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
