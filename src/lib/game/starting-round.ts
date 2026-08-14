/**
 * A game's **starting round** — the round it was played from, which is its own
 * round one whatever the competition calls that gameweek.
 *
 * Game creation attaches a new game to the competition's earliest still-pickable
 * round, so a game created in November opens at gameweek 12 and gameweek 12 is
 * the first hurdle its players are put to. Every rule that speaks of "the
 * starting round" — classic's non-win exemption, both rebuy routes, the deadline
 * lock's opening-round branches, the progress grid's marker and the hero's
 * exemption state — means that round and not `round.number === 1`. See
 * `docs/game-modes/classic.md` and issue #203.
 *
 * The round is persisted on `game.starting_round_id`, so nothing here derives it
 * from picks. The functions below only resolve it against a round sequence and
 * answer the two questions the callers have: is *this* round the starting one,
 * and which round comes after it (the rebuy window's closing deadline).
 */

/** The minimum a round row needs for these resolvers. */
export interface StartingRoundSeqRow {
	id: string
	number: number
}

/** What a game row has to say about where it is and where it began. */
export interface StartingRoundGameRow {
	startingRoundId: string | null
	currentRoundId: string | null
}

/**
 * The game's starting round, from the competition's round sequence.
 *
 * `starting_round_id` is written at creation and backfilled for every older
 * game, so the fallback is only for a row written in the window between the code
 * deploying and the migration landing: a game that hasn't advanced yet is still
 * on its starting round, so its current round is the honest answer. Null when
 * neither pointer resolves — callers read that as "no starting-round rule
 * applies", which is the safe direction for every one of them.
 */
export function resolveStartingRound<T extends StartingRoundSeqRow>(
	game: StartingRoundGameRow,
	rounds: T[],
): T | null {
	const byStartingId = game.startingRoundId
		? rounds.find((r) => r.id === game.startingRoundId)
		: undefined
	if (byStartingId) return byStartingId
	if (game.startingRoundId) return null
	return rounds.find((r) => r.id === game.currentRoundId) ?? null
}

/**
 * The round after the starting round — where a rebuy window closes.
 *
 * Resolved on the round sequence (lowest number above the starting round) rather
 * than as `number + 1`, the same way `advanceGameToNextRound` picks its target,
 * so a competition whose round numbers aren't contiguous can't lose its second
 * round. Null when the starting round is the competition's last.
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
 * The id comparison is the whole rule — no round number is involved, which is
 * what makes it right for a game that began mid-season.
 */
export function isGameStartingRound(game: StartingRoundGameRow, roundId: string | null): boolean {
	if (!roundId) return false
	if (game.startingRoundId) return game.startingRoundId === roundId
	return game.currentRoundId === roundId
}
