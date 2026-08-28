interface FixtureRef {
	id: string
	homeTeamId: string
	awayTeamId: string
}

interface PickWorstUnusedTeamInput {
	fixtures: FixtureRef[]
	usedTeamIds: Set<string>
	/** Each team's place in the table the standings sync last persisted. */
	teamPositions: Map<string, number>
	/**
	 * Each team's own de-vigged pre-match win probability (0–1) in its fixture
	 * this round, from the `fixture_odds` row the daily sync already wrote — the
	 * same figure the pick table's win-chance column and the live view's
	 * pre-match chip read. Absent for an unpriced fixture, and for a whole
	 * competition the odds source doesn't cover (the World Cup, the FA Cup).
	 */
	teamWinProbabilities?: Map<string, number>
}

/**
 * The fallback pick for a player who missed the deadline: the **worst** team in
 * the round they haven't already used.
 *
 * "Worst" is measured two ways, and the order matters.
 *
 * **The market first.** Among the candidates the round holds a price for, the
 * worst team is the one with the lowest win probability. That is the honest
 * reading of the question — a table says where a club has finished up to now, a
 * price says what it is expected to do in *this* fixture — and it is what makes
 * the fallback robust in early season, where a handful of games leaves the table
 * saying almost nothing (a champion beaten once sits 20th on gameweek one, and a
 * position-only rule would hand them out as the worst team in the league). It
 * also removes a real arbitrariness: the source ties clubs on position while
 * they're level on points and goals, and a position-only rule broke those ties
 * on team id, which is no football reason at all.
 *
 * **League position second**, when the round carries no price at all. Whole
 * competitions have none, so this is a genuine fallback rather than a
 * theoretical one, and it is the rule this function had before prices existed:
 * the highest league position in the last persisted table.
 *
 * A **partly-priced** round decides on the priced teams alone. Mixing the two
 * measures would mean comparing a probability with a table place, which says
 * nothing; and an unpriced fixture is a team we cannot call worst rather than a
 * team we know is bad. The consequence — a round where only the top clubs are
 * priced hands out a better team than the table would have — is rare (a missing
 * market, not a missing competition) and errs toward the player.
 *
 * Pre-season with no prices, the persisted table is the competition's opening
 * one (see `openingTable` in bootstrap-competitions): every club at zero, so the
 * tiebreak chain resolves to alphabetical and this returns **the
 * alphabetically-last club in the round**. Arbitrary as football, but
 * deterministic, and a real team on a real position. Prices are what make that
 * case rare rather than the norm.
 *
 * Missing positions still default to Infinity — a competition whose sync has
 * never run has no table to be worst in, and picking a team is better than
 * eliminating the player.
 */
export function pickWorstUnusedTeam({
	fixtures,
	usedTeamIds,
	teamPositions,
	teamWinProbabilities,
}: PickWorstUnusedTeamInput): string | null {
	const candidates = new Set<string>()
	for (const fx of fixtures) {
		if (!usedTeamIds.has(fx.homeTeamId)) candidates.add(fx.homeTeamId)
		if (!usedTeamIds.has(fx.awayTeamId)) candidates.add(fx.awayTeamId)
	}
	if (candidates.size === 0) return null

	const probabilityOf = (teamId: string): number | null => {
		const p = teamWinProbabilities?.get(teamId)
		return typeof p === 'number' && Number.isFinite(p) ? p : null
	}
	const priced = [...candidates].filter((teamId) => probabilityOf(teamId) !== null)

	if (priced.length > 0) {
		// Longest odds win. Two teams on the same price fall back to the table,
		// then to the id — the same last-resort ordering the position rule uses.
		let best: { teamId: string; probability: number; position: number } | null = null
		for (const teamId of priced) {
			const probability = probabilityOf(teamId) as number
			const position = teamPositions.get(teamId) ?? Number.POSITIVE_INFINITY
			if (
				best === null ||
				probability < best.probability ||
				(probability === best.probability &&
					(position > best.position || (position === best.position && teamId < best.teamId)))
			) {
				best = { teamId, probability, position }
			}
		}
		return best?.teamId ?? null
	}

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
