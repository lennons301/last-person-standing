/**
 * May this viewer see this pick?
 *
 * The secrecy rule, in one place. A pick is a secret until its round's picks
 * are locked — you may always see your own, and nobody else's before then.
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
}

export function resolvePickVisibility(input: ResolvePickVisibilityInput): PickVisibility {
	const { round, pick, viewerGamePlayerId, now } = input
	// Your own pick is never a secret from you.
	if (viewerGamePlayerId != null && pick.gamePlayerId === viewerGamePlayerId) return 'visible'
	// Everyone else's opens up the moment the round's picks lock.
	if (arePicksLocked(round, now)) return 'visible'
	return 'hidden'
}
