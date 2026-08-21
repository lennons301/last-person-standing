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

import { formatWinChance } from '@/lib/game/round-summary-view'

/**
 * Every fixed word the figure is rendered with, in one table — the same
 * arrangement `ROUND_SUMMARY_COPY` uses, and for the same reason: two surfaces
 * of one game must not word the same number two ways.
 */
export const PRE_MATCH_COPY = {
	/** The chip's own prefix, beside a pick. */
	label: 'Pre-match',
	/** Spelled out where two words aren't enough — assistive text, tooltips. */
	description: 'Pre-match win chance for this pick — not a live price',
} as const

/**
 * The figure as a pick's chip prints it: `Pre-match 22%`.
 *
 * The percentage comes out of the round summary's `formatWinChance` rather than
 * a second rounding rule, so the card under the progress grid and the live
 * scores pop-out can never quote one pick's chance differently. Null in, null
 * out — an absent market renders no chip at all rather than a nought.
 */
export function formatPreMatchWinChance(probability: number | null | undefined): string | null {
	const chance = formatWinChance(probability)
	return chance == null ? null : `${PRE_MATCH_COPY.label} ${chance}`
}

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
 * The figure only ever answers one question — *will this team win?* — so it is
 * attached only where the pick says exactly that. Classic stores a hand-made
 * pick with no `predictedResult` at all, and picking a team there **is** backing
 * it to win, which is how a null prediction reads everywhere else in the
 * codebase (`projectPickOutcome`). A prediction that names a side must agree with
 * the team the row is stored against.
 *
 * A **draw** call carries nothing. Turbo and cup derive a pick's `teamId` from
 * the prediction and give the draw the *home* side, so the home team's win
 * chance would otherwise be printed beside a pick that called a draw — a figure
 * about an outcome the player didn't take, which no "pre-match" label makes
 * honest. Quoting the draw's own price instead is turbo work, out of scope
 * (#222).
 *
 * Null rather than zero in every absent case: an unpriced fixture, a fixture the
 * round doesn't hold, and a pick with no team on it at all — which is the shape
 * the live payload gives every **hidden** pick, so a hidden pick can carry no
 * probability by construction.
 */
export function preMatchWinProbability(
	pick: {
		fixtureId: string | null
		teamId: string | null
		/**
		 * Absent on a hand-made classic pick; `'draw'` only in turbo and cup. Typed
		 * as loosely as the column it comes from (a varchar), so anything that isn't
		 * a side winning — the draw included — is refused rather than guessed at.
		 */
		predictedResult?: string | null
	},
	fixturesById: Map<string, PreMatchFixtureRow>,
): number | null {
	if (!pick.fixtureId || !pick.teamId) return null
	const prediction = pick.predictedResult ?? null
	if (prediction !== null && prediction !== 'home_win' && prediction !== 'away_win') return null
	const fixture = fixturesById.get(pick.fixtureId)
	if (!fixture?.odds) return null
	if (pick.teamId === fixture.homeTeamId) {
		return prediction === 'away_win' ? null : fixture.odds.homeProbability
	}
	if (pick.teamId === fixture.awayTeamId) {
		return prediction === 'home_win' ? null : fixture.odds.awayProbability
	}
	return null
}
