/**
 * Whether a game is open for **self-service entry** — somebody following an
 * invite link (or, once #202 lands, finding the game in a listing) and joining
 * themselves.
 *
 * A game is open for entry while all three of these hold:
 *
 * 1. it hasn't completed,
 * 2. it still sits on its own starting round, and
 * 3. that round's deadline is in the future.
 *
 * Past that point entry is an admin decision: the creator can still add anyone
 * through the admin add-player route, which stays completely unrestricted. A
 * friend joining a game at round 20 of 38 is a deliberate human act, and that
 * is the shape it should take — where self-service would take their entry fee
 * for a classic game they can never win and, in turbo, for a game whose only
 * deadline has already passed.
 *
 * "Started" is read from `game.starting_round_id` against `game.current_round_id`
 * and the starting round's own deadline — never from a status flip. `active` is
 * set at creation and never moves, and a state that had to be flipped would need
 * a trigger to fire; a missed trigger would leave a started game joinable, which
 * is the failure this rule exists to close. Both halves of the check matter: a
 * game can advance to a round whose deadline is still in the future (condition 2
 * catches it), and a game can sit on its starting round long past that round's
 * deadline (condition 3).
 *
 * A round with no deadline is still pickable — WC knockouts pre-draw carry TBD
 * fixtures and no deadline, and game creation treats them as candidates for
 * exactly that reason — so a null deadline leaves the game open.
 *
 * A game with no starting round recorded is **not** open: after #203's backfill
 * that can only be a game created in the window between the migration landing
 * and the new code deploying, and a game we can't place is one we can't say has
 * yet to start. Refusing self-service costs a request to the admin, who can add
 * the player regardless; the other direction takes an entry fee for a game that
 * may be half over.
 */

import type { GameStatus } from '@/lib/types'

/** What a game row has to say about whether it's still open for entry. */
export interface JoinabilityGameRow {
	status: GameStatus
	currentRoundId: string | null
	startingRoundId?: string | null
}

/** The minimum the starting round needs to answer the deadline question. */
export interface JoinabilityRoundRow {
	id: string
	deadline: Date | null
}

/**
 * Why a game is closed to self-service entry.
 *
 * - `completed` — the game is over.
 * - `started` — it's underway: past its starting round, or past that round's
 *   deadline.
 * - `not-open` — it isn't ready for players yet (`setup`), or it has no starting
 *   round recorded and so can't be placed at all.
 */
export type JoinBlockedReason = 'completed' | 'started' | 'not-open'

export interface Joinability {
	joinable: boolean
	/** Null exactly when `joinable` is true. */
	reason: JoinBlockedReason | null
}

const OPEN: Joinability = { joinable: true, reason: null }

/**
 * What a blocked join says, in one place — the API's error code and message and
 * the invite page's notice all read from here, so the reason a route rejects and
 * the reason the page gives can't drift apart.
 *
 * The `started` copy states the rule ("entry closes at the opening round's
 * deadline") rather than narrating this game's history: a game that advanced past
 * its starting round is closed by the advance, and the same words hold either way.
 */
export const JOIN_BLOCKED_COPY: Record<
	JoinBlockedReason,
	{ code: string; heading: string; message: string }
> = {
	completed: {
		code: 'game-completed',
		heading: 'This game has finished',
		message: 'It has already been won — there is nothing left to join.',
	},
	started: {
		code: 'game-started',
		heading: 'This game has already started',
		message:
			'Joining from a link closes at the opening round’s deadline. The game’s admin can still add you — ask them to.',
	},
	'not-open': {
		code: 'game-not-open',
		heading: 'This game is not open to join',
		message: 'It is not taking players from a link. The game’s admin can add you — ask them to.',
	},
}

/**
 * Is this game open for self-service entry?
 *
 * `startingRound` is the round row `game.startingRoundId` points at, or null when
 * the game names none (or the row couldn't be resolved) — see the note above on
 * why that reads as closed.
 */
export function evaluateJoinability({
	game,
	startingRound,
	now,
}: {
	game: JoinabilityGameRow
	startingRound: JoinabilityRoundRow | null
	now: Date
}): Joinability {
	if (game.status === 'completed') return { joinable: false, reason: 'completed' }
	if (game.status === 'setup') return { joinable: false, reason: 'not-open' }

	if (!game.startingRoundId || !startingRound || startingRound.id !== game.startingRoundId) {
		return { joinable: false, reason: 'not-open' }
	}

	// Advanced past the starting round — started, whatever the current round's
	// deadline says.
	if (game.currentRoundId !== game.startingRoundId) {
		return { joinable: false, reason: 'started' }
	}

	if (startingRound.deadline && startingRound.deadline <= now) {
		return { joinable: false, reason: 'started' }
	}

	return OPEN
}
