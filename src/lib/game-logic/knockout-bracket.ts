/**
 * Deterministic knockout-bracket derivation.
 *
 * A knockout bracket is fixed the moment its feeder round finishes — the next
 * round's ties are fully known from the feeder results, even before the data
 * source (football-data) draws them into its bracket slots. football-data can
 * lag the draw by days, which strands a survivor game with an incomplete set of
 * pickable teams while the round's deadline approaches (the 2026-07-04 R16
 * incident). This module reconstructs the ties ourselves so the game never has
 * to wait for the source.
 *
 * Observed football-data convention (verified against every drawn WC 2026
 * knockout tie, R32→R16 and the R16→QF/SF/Final structure): each next-round tie
 * pairs the winners of a CONSECUTIVE pair of feeder match IDs (sorted
 * numerically), with the home side being the winner of the lower-ID feeder. The
 * derivation is guarded by self-validation: replaying the rule against the
 * source's already-drawn ties must reproduce them exactly (teams AND home/away).
 * If it doesn't, we abort rather than seed a wrong tie — the convention may have
 * changed and a human should look.
 */

export interface FeederFixture {
	externalId: string | null
	homeTeamId: string
	awayTeamId: string
	status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
	winner: 'home' | 'away' | null
}

export interface KnockoutTie {
	homeTeamId: string
	awayTeamId: string
}

export type DeriveResult =
	| { valid: true; selfValidated: boolean; ties: KnockoutTie[] }
	| { valid: false; reason: string }

/** The team that advances from a finished knockout feeder. */
function advancer(f: FeederFixture): string {
	return f.winner === 'home' ? f.homeTeamId : f.awayTeamId
}

export function deriveKnockoutTies(
	feeders: FeederFixture[],
	drawnTies: KnockoutTie[],
): DeriveResult {
	if (feeders.length === 0) return { valid: false, reason: 'no-feeders' }
	if (feeders.length % 2 !== 0) {
		return { valid: false, reason: `odd feeder count (${feeders.length})` }
	}
	for (const f of feeders) {
		if (f.externalId == null) return { valid: false, reason: 'feeder missing externalId' }
		if (f.status !== 'finished') return { valid: false, reason: 'feeders not all finished' }
		if (f.winner == null) return { valid: false, reason: 'finished feeder has no winner' }
	}

	// Sort numerically by externalId; adjacent pairs feed one tie.
	const sorted = [...feeders].sort((a, b) => Number(a.externalId) - Number(b.externalId))
	const ties: KnockoutTie[] = []
	for (let i = 0; i < sorted.length; i += 2) {
		ties.push({ homeTeamId: advancer(sorted[i]), awayTeamId: advancer(sorted[i + 1]) })
	}

	// Self-validate: every already-drawn tie must be reproduced exactly.
	for (const drawn of drawnTies) {
		const match = ties.some(
			(t) => t.homeTeamId === drawn.homeTeamId && t.awayTeamId === drawn.awayTeamId,
		)
		if (!match) {
			return {
				valid: false,
				reason: `drawn tie ${drawn.homeTeamId} v ${drawn.awayTeamId} not reproduced by the consecutive-pair rule`,
			}
		}
	}

	return { valid: true, selfValidated: drawnTies.length > 0, ties }
}

/** Unordered team-pair key, so {A,B} and {B,A} collide. */
function pairKey(homeTeamId: string, awayTeamId: string): string {
	return [homeTeamId, awayTeamId].sort().join('|')
}

/**
 * Find a fixture involving exactly these two teams, regardless of which side is
 * home. Used to bind a provisional (source-less) tie to the real match once the
 * data source finally draws it — matching by teams, never by a guessed slot.
 */
export function findByTeamPair<T extends { homeTeamId: string; awayTeamId: string }>(
	homeTeamId: string,
	awayTeamId: string,
	fixtures: T[],
): T | undefined {
	const key = pairKey(homeTeamId, awayTeamId)
	return fixtures.find((f) => pairKey(f.homeTeamId, f.awayTeamId) === key)
}

export interface PlannerRound {
	number: number
	isKnockout: boolean
	fixtures: FeederFixture[]
}

export interface SeedPlanEntry {
	roundNumber: number
	ties: KnockoutTie[]
	validation: 'in-round' | 'prior-transition'
}

/**
 * Decide which knockout ties to seed, across all rounds, from finished feeders.
 *
 * A round T is derivable only when T and its feeder (T−1) are BOTH knockout
 * rounds — this deliberately excludes the first knockout round (whose feeder is
 * the group stage; its draw comes from group standings, not a bracket pairing).
 *
 * Every derivation is self-validated before it is trusted:
 *  - `in-round`: the source has already drawn ≥1 tie in T and the rule reproduces
 *    it (teams + home/away) exactly.
 *  - `prior-transition`: T has no drawn ties yet, so we instead confirm the rule
 *    reproduces the most recent completed transition (T−2 → T−1). If it holds one
 *    level down, we trust it one level up.
 * If neither validation is available/passes, the round is skipped (with a reason)
 * rather than seeded on faith.
 */
export function planKnockoutSeeding(rounds: PlannerRound[]): {
	plan: SeedPlanEntry[]
	skipped: Array<{ roundNumber: number; reason: string }>
} {
	const byNumber = new Map(rounds.map((r) => [r.number, r]))
	const toTie = (f: FeederFixture): KnockoutTie => ({
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
	})
	const drawnTiesOf = (r: PlannerRound): KnockoutTie[] =>
		r.fixtures.filter((f) => f.externalId != null).map(toTie)

	const plan: SeedPlanEntry[] = []
	const skipped: Array<{ roundNumber: number; reason: string }> = []

	for (const round of [...rounds].sort((a, b) => a.number - b.number)) {
		if (!round.isKnockout) continue
		const feeder = byNumber.get(round.number - 1)
		if (!feeder?.isKnockout) {
			skipped.push({ roundNumber: round.number, reason: 'feeder is not a knockout round' })
			continue
		}

		const derived = deriveKnockoutTies(feeder.fixtures, drawnTiesOf(round))
		if (!derived.valid) {
			skipped.push({ roundNumber: round.number, reason: derived.reason })
			continue
		}

		let validation: SeedPlanEntry['validation']
		if (derived.selfValidated) {
			validation = 'in-round'
		} else {
			// No drawn ties to check in this round — validate the rule against the
			// previous completed transition instead.
			const priorFeeder = byNumber.get(feeder.number - 1)
			const priorDrawn = drawnTiesOf(feeder)
			if (!priorFeeder?.isKnockout || priorDrawn.length === 0) {
				skipped.push({
					roundNumber: round.number,
					reason: 'no drawn ties and no prior transition to validate the rule',
				})
				continue
			}
			const prior = deriveKnockoutTies(priorFeeder.fixtures, priorDrawn)
			if (!prior.valid || !prior.selfValidated) {
				skipped.push({ roundNumber: round.number, reason: 'prior-transition validation failed' })
				continue
			}
			validation = 'prior-transition'
		}

		const existing = new Set(round.fixtures.map((f) => pairKey(f.homeTeamId, f.awayTeamId)))
		const ties = derived.ties.filter((t) => !existing.has(pairKey(t.homeTeamId, t.awayTeamId)))
		if (ties.length > 0) plan.push({ roundNumber: round.number, ties, validation })
	}

	return { plan, skipped }
}
