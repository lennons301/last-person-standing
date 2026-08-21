/**
 * The **pre-match** win chance a pick went in at.
 *
 * The number is the de-vigged bookmaker probability the daily sync already
 * persisted for the fixture, frozen once the round's deadline passed — so it is
 * a pre-match figure sitting beside a live score, never an in-play price. No
 * surface may render it unlabelled: read as a live price it would be a lie about
 * what the app knows. In-play pricing is out of scope entirely (a request per
 * fixture, on a free tier).
 */

/** A fixture as the join needs it: its two sides, and its market if we hold one. */
export interface PreMatchFixtureRow {
	homeTeamId: string
	awayTeamId: string
	/** Absent for a fixture — or a whole competition — we hold no prices for. */
	odds: { homeProbability: number; awayProbability: number } | null | undefined
}

/**
 * The picked team's own win chance, 0–1, or null where there is none to give.
 *
 * Null rather than zero in every absent case: an unpriced fixture, a fixture the
 * round doesn't hold, and a pick with no team on it at all — which is the shape
 * the live payload gives every **hidden** pick, so a hidden pick can carry no
 * probability by construction.
 */
export function preMatchWinProbability(
	pick: { fixtureId: string | null; teamId: string | null },
	fixturesById: Map<string, PreMatchFixtureRow>,
): number | null {
	if (!pick.fixtureId || !pick.teamId) return null
	const fixture = fixturesById.get(pick.fixtureId)
	if (!fixture?.odds) return null
	if (pick.teamId === fixture.homeTeamId) return fixture.odds.homeProbability
	if (pick.teamId === fixture.awayTeamId) return fixture.odds.awayProbability
	return null
}
