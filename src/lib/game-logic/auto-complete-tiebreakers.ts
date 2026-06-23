// Tiebreaker rules ported from the predecessor app, with explicit secondary
// rules where the old SQL had undefined ordering. Confirmed 2026-05-07.

export interface ClassicTiebreakerInput {
	gamePlayerId: string
	totalWinningGoals: number
}

export interface TurboTiebreakerInput {
	gamePlayerId: string
	streak: number
	goalsInStreak: number
}

export interface CupTiebreakerInput {
	gamePlayerId: string
	cumulativeStreak: number
	livesRemaining: number
	cumulativeGoals: number
	/**
	 * Raw goals scored by the streak picks, ignoring the favourite-win goal
	 * suppression. Last-resort tiebreak when streak, lives and counted goals all
	 * tie — separates two players whose streaks were all 1-tier-favourite wins
	 * (counted 0) rather than splitting the pot. Optional; treated as 0 when absent.
	 */
	rawStreakGoals?: number
}

function maxBy<T>(items: T[], key: (t: T) => number): T[] {
	if (items.length === 0) return []
	const max = items.reduce((m, t) => Math.max(m, key(t)), Number.NEGATIVE_INFINITY)
	return items.filter((t) => key(t) === max)
}

export function classicTiebreaker(players: ClassicTiebreakerInput[]): string[] {
	const top = maxBy(players, (p) => p.totalWinningGoals)
	return top.map((p) => p.gamePlayerId)
}

export function turboTiebreaker(players: TurboTiebreakerInput[]): string[] {
	const topStreak = maxBy(players, (p) => p.streak)
	if (topStreak.length <= 1) return topStreak.map((p) => p.gamePlayerId)
	const topGoals = maxBy(topStreak, (p) => p.goalsInStreak)
	return topGoals.map((p) => p.gamePlayerId)
}

export function cupTiebreaker(players: CupTiebreakerInput[]): string[] {
	const topStreak = maxBy(players, (p) => p.cumulativeStreak)
	if (topStreak.length <= 1) return topStreak.map((p) => p.gamePlayerId)
	const topLives = maxBy(topStreak, (p) => p.livesRemaining)
	if (topLives.length <= 1) return topLives.map((p) => p.gamePlayerId)
	const topGoals = maxBy(topLives, (p) => p.cumulativeGoals)
	if (topGoals.length <= 1) return topGoals.map((p) => p.gamePlayerId)
	// Last-resort separator: raw goals of the streak picks (favourite suppression
	// ignored). Prefers a clear winner over a split whenever any goals separate them.
	const topRaw = maxBy(topGoals, (p) => p.rawStreakGoals ?? 0)
	return topRaw.map((p) => p.gamePlayerId)
}

// -- Wipeout rule (single-round modes: turbo + cup) --
//
// The winner is the longest *consecutive* streak of correct picks counted from
// rank 1 — but leading ranks that were a UNIVERSAL loss (every player got that
// rank wrong) are skipped, so the game effectively "restarts" from the first
// rank anyone got right. This is a cross-player, winner-determination-layer
// concern: the per-player evaluator can't see whether a rank was universally
// lost. It also fixes the inflated-streak bug where scattered post-break wins
// used to count toward the streak — here the streak stops at the first miss.
//
// Distinct from the "confirmed prefix / stop at first pending" rule in the
// per-player evaluator: that bounds *which* picks are settled; this rebases
// *where* the streak count begins, across all players.

export interface WipeoutPickOutcome {
	/** confidence rank (1 = most confident). */
	rank: number
	/** did this pick keep the streak alive (turbo: predicted right; cup: win / draw_success / saved_by_life). */
	correct: boolean
	/** counted (tier-adjusted) goals — feeds the primary goals tiebreak if this pick is inside the streak. */
	goals: number
	/**
	 * Raw goals the picked team actually scored, ignoring cup favourite-win
	 * suppression — feeds the raw-goals backstop. Optional; defaults to `goals`
	 * (turbo has no suppression, so raw === counted there).
	 */
	rawGoals?: number
}

export interface WipeoutPlayerInput {
	gamePlayerId: string
	/** settled, non-void picks in any order (sorted internally by rank). */
	picks: WipeoutPickOutcome[]
	/** final lives — cup tiebreak only; pass 0 for turbo. */
	livesRemaining: number
}

export interface WipeoutScore {
	gamePlayerId: string
	streak: number
	goalsInStreak: number
	/** raw goals over the streak picks (favourite suppression ignored) — for the cup raw-goals backstop. */
	rawGoalsInStreak: number
	livesRemaining: number
}

export interface WipeoutOutcome {
	/** true when no rank had a single correct pick anywhere → full refund, no winner. */
	totalWipeout: boolean
	/** lowest rank any player got right; null on a total wipeout. */
	startingRank: number | null
	/** per-player streak rebased to startingRank; empty on a total wipeout. */
	scores: WipeoutScore[]
}

export function resolveWipeout(players: WipeoutPlayerInput[]): WipeoutOutcome {
	// Starting rank = the lowest rank at which any player has a correct pick.
	// This subsumes the "skip leading universal-loss ranks" recursion: a rank
	// every player got wrong has no correct pick, so it's never the minimum.
	let startingRank: number | null = null
	for (const player of players) {
		for (const pk of player.picks) {
			if (pk.correct && (startingRank === null || pk.rank < startingRank)) {
				startingRank = pk.rank
			}
		}
	}
	if (startingRank === null) {
		return { totalWipeout: true, startingRank: null, scores: [] }
	}

	const start = startingRank
	const scores = players.map((player) => {
		const ordered = player.picks.filter((pk) => pk.rank >= start).sort((a, b) => a.rank - b.rank)
		let streak = 0
		let goalsInStreak = 0
		let rawGoalsInStreak = 0
		for (const pk of ordered) {
			if (!pk.correct) break
			streak++
			goalsInStreak += pk.goals
			rawGoalsInStreak += pk.rawGoals ?? pk.goals
		}
		return {
			gamePlayerId: player.gamePlayerId,
			streak,
			goalsInStreak,
			rawGoalsInStreak,
			livesRemaining: player.livesRemaining,
		}
	})
	return { totalWipeout: false, startingRank, scores }
}
