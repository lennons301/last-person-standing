/**
 * May this viewer see this pick?
 *
 * One module owns the secrecy rule (#247). A pick is a secret until its own
 * round's picks lock — you may always see your own, and nobody else's before
 * then. The lock itself is `arePicksLocked`, composed here rather than restated.
 *
 * The progress grid, both turbo standings views, the live poll payload and the
 * share images all read this and keep no predicate of their own: the rule was
 * written out six ways, and it leaked in production once already (#84/#86).
 */

import { arePicksLocked, type PicksLockedRound } from '@/lib/game/round-status'

export type PickVisibility = 'visible' | 'hidden'

export interface ResolvePickVisibilityInput {
	/**
	 * The pick's own round — the round whose lock the secret hangs on, never the
	 * game's current round. Advance picks (PR #81) sit on rounds ten-plus
	 * gameweeks out, and each stays a secret until its own deadline goes (#86).
	 */
	round: PicksLockedRound
	/** The pick under consideration — only its owner matters here. */
	pick: { gamePlayerId: string }
	/**
	 * The viewer's own `game_player` id, or null when there is nobody to make an
	 * exception for: a caller with no viewer, or a shared surface (a share image)
	 * where not-yet-locked picks stay hidden from everyone, the picker included.
	 */
	viewerGamePlayerId: string | null | undefined
	now: Date
	/**
	 * Reveal regardless of the round's own lock. Its callers are the two
	 * standings queries, which additionally reveal a round the GAME has finished
	 * with (`deriveGameRoundStatus` → 'completed', which covers a completed
	 * game's whole round set, since completion nulls `currentRoundId`): a player
	 * looking back at a game they played sees the field's picks for every round
	 * of it. That is the only thing anything adds on top — the round's own lock
	 * is the rule.
	 */
	revealAll?: boolean
}

export function resolvePickVisibility(input: ResolvePickVisibilityInput): PickVisibility {
	const { round, pick, viewerGamePlayerId, now, revealAll } = input
	if (revealAll) return 'visible'
	// Your own pick is never a secret from you.
	if (viewerGamePlayerId != null && pick.gamePlayerId === viewerGamePlayerId) return 'visible'
	// Everyone else's opens up the moment the round's picks lock.
	if (arePicksLocked(round, now)) return 'visible'
	return 'hidden'
}
