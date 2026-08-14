/**
 * A game's **starting round** — the round it was played from, which is its own
 * round one whatever gameweek the competition calls it.
 *
 * Game creation attaches a new game to the competition's earliest still-pickable
 * round, so a game created in November opens at gameweek 12 and gameweek 12 is
 * the first hurdle its players are put to. Every rule that speaks of "the
 * starting round" — classic's non-win exemption, both rebuy routes, the deadline
 * lock's opening-round branches, the progress grid's marker and the hero's
 * exemption state — means that round and not `round.number === 1`. See
 * `docs/game-modes/classic.md` and issue #203.
 *
 * The round is persisted on `game.starting_round_id` (written at creation,
 * backfilled for every game that predates the column), so nothing here derives
 * it from picks. These functions only resolve it against a competition's round
 * sequence and answer the two questions the callers have: is *this* round the
 * starting one, and which round comes after it — the rebuy window's closing
 * deadline.
 *
 * A game with no starting round recorded has no starting round: no exemption, no
 * rebuy, no marker. That's the safe direction for all three, and after the
 * backfill it can only happen to a game created in the window between the
 * migration landing and the new code deploying.
 */

/** The minimum a round row needs for these resolvers. */
export interface StartingRoundSeqRow {
	id: string
	number: number
}

/** What a game row has to say about where it began. */
export interface StartingRoundGameRow {
	startingRoundId?: string | null
}

/**
 * The game's starting round, picked out of the competition's round sequence.
 * Null when the game has none recorded, or when the sequence passed in doesn't
 * contain it (callers pass the whole competition's rounds).
 */
export function resolveStartingRound<T extends StartingRoundSeqRow>(
	game: StartingRoundGameRow,
	rounds: T[],
): T | null {
	if (!game.startingRoundId) return null
	return rounds.find((r) => r.id === game.startingRoundId) ?? null
}

/**
 * The round after the starting round — where a rebuy window closes.
 *
 * Resolved on the round sequence (lowest number above the starting round) rather
 * than as `number + 1`, the same way `advanceGameToNextRound` picks its target,
 * so a competition whose round numbers aren't contiguous can't lose its second
 * round. Null when the game has no starting round, or when that round is the
 * competition's last.
 */
export function resolveRoundAfterStarting<T extends StartingRoundSeqRow>(
	game: StartingRoundGameRow,
	rounds: T[],
): T | null {
	const startingRound = resolveStartingRound(game, rounds)
	if (!startingRound) return null
	return rounds
		.filter((r) => r.number > startingRound.number)
		.reduce<T | null>((best, r) => (best === null || r.number < best.number ? r : best), null)
}

/**
 * Is `roundId` the game's own starting round?
 *
 * An id comparison is the whole rule — no round number is involved, which is what
 * makes it right for a game that began mid-season.
 */
export function isGameStartingRound(game: StartingRoundGameRow, roundId: string | null): boolean {
	if (!roundId || !game.startingRoundId) return false
	return game.startingRoundId === roundId
}
