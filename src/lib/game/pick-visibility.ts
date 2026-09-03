/**
 * May this viewer see this pick?
 *
 * The secrecy rule, in one place. A pick is a secret until its round's picks
 * are locked — you may always see your own, and nobody else's before then.
 */

export type PickVisibility = 'visible' | 'hidden'

export interface ResolvePickVisibilityInput {
	/** The pick's own round. */
	round: unknown
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
	const { pick, viewerGamePlayerId } = input
	// Your own pick is never a secret from you.
	if (viewerGamePlayerId != null && pick.gamePlayerId === viewerGamePlayerId) return 'visible'
	return 'hidden'
}
