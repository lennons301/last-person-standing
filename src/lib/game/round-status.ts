/**
 * Per-game round status derivation.
 *
 * Round records (in the `round` table) are competition-scoped: every game
 * using the same competition shares the same fixtures and the same
 * `round.status`. But the *user-facing* round state — "is this round
 * accepting picks for THIS game?" — is per-game, because games are created
 * at different times and advance through rounds independently.
 *
 * The driver is `game.currentRoundId`: the engine advances it after each
 * call to processGameRound. Pick gates and UI status both derive from
 * (a) is this round the game's current round, (b) has the deadline passed,
 * and (c) has the round's processing run.
 *
 * Lifecycle for a single round, from one game's POV:
 *   upcoming   game hasn't reached this round yet
 *   open       it's the game's current round AND deadline > now
 *   active     it's the game's current round AND deadline ≤ now (matches in flight)
 *   completed  game has advanced past it OR processGameRound ran on it
 */

export interface DeriveGameRoundStatusInput {
	round: {
		id: string
		number: number
		/** Competition-level status from the bootstrap sync. */
		status: 'upcoming' | 'open' | 'active' | 'completed'
		deadline: Date | null
	}
	game: {
		currentRoundId: string | null
		/**
		 * The number of the round currently pointed at by `currentRoundId`.
		 * Required to determine whether a non-current round is in the past
		 * (completed) or future (upcoming) for this specific game. If the
		 * game's currentRoundId is null (game over), pass null here.
		 */
		currentRoundNumber: number | null
	}
	now: Date
}

export function deriveGameRoundStatus(
	input: DeriveGameRoundStatusInput,
): 'upcoming' | 'open' | 'active' | 'completed' {
	const { round, game, now } = input
	// Round has been processed already — completed regardless of game state.
	if (round.status === 'completed') return 'completed'
	// The game is on a different round.
	if (round.id !== game.currentRoundId) {
		if (game.currentRoundNumber == null) return 'completed'
		return round.number < game.currentRoundNumber ? 'completed' : 'upcoming'
	}
	// It's the game's current round.
	if (round.deadline && now >= round.deadline) return 'active'
	return 'open'
}

export interface PicksLockedRound {
	/** Competition-level status from the bootstrap sync. */
	status: 'upcoming' | 'open' | 'active' | 'completed'
	deadline: Date | null
}

/**
 * Are this round's picks locked and revealable to everyone? The round has been
 * processed, or its own deadline has gone. A round with no deadline recorded is
 * never locked — nothing has closed.
 *
 * Deliberately keyed on the ROUND and not on where a game has got to, which is
 * what separates it from `deriveGameRoundStatus`: that function reports
 * 'completed' for every round once `game.currentRoundId` is null (the game is
 * over), which is the right answer for "has this game finished with this
 * round?" and the wrong one for "may these picks be shown?" — a completed game
 * can still hold advance picks on a gameweek that hasn't kicked off (#225).
 */
export function arePicksLocked(round: PicksLockedRound, now: Date): boolean {
	if (round.status === 'completed') return true
	return round.deadline != null && now >= round.deadline
}
