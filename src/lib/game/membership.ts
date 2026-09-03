import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isAdminRemoved } from '@/lib/game/elimination'
import { game, gamePlayer } from '@/lib/schema/game'
import type { GamePlayer } from '@/lib/types'

/**
 * Why a caller is being kept out of a game's data.
 *
 * - `not-found` — no game with that id. 404, the same answer a stranger gets.
 * - `not-member` — the game exists, the caller isn't in its field. 403.
 */
export type MembershipDenialReason = 'not-found' | 'not-member'

/**
 * The status and body every denial is rendered with. One table so the four
 * routes reading this seam can't drift into answering the same denial two ways
 * (the arrangement `JOIN_BLOCKED_COPY` already takes for the join surfaces).
 */
export const MEMBERSHIP_DENIAL_COPY: Record<
	MembershipDenialReason,
	{ status: number; message: string }
> = {
	'not-found': { status: 404, message: 'Not found' },
	'not-member': { status: 403, message: 'Forbidden' },
}

export type MembershipCheck =
	| { ok: true; membership: GamePlayer }
	| { ok: false; reason: MembershipDenialReason; status: number; message: string }

function deny(reason: MembershipDenialReason): MembershipCheck {
	return { ok: false, reason, ...MEMBERSHIP_DENIAL_COPY[reason] }
}

/**
 * "Is this caller allowed to read this game's data?" — authorization as its own
 * seam, rather than a boolean fished out of a page's worth of loaded state.
 *
 * The share-image routes and the live-poll route need nothing but this, and the
 * live route is polled every 30 s per open game page; they used to answer it
 * with `getGameDetail`, which loads every fixture, pick, player, payment and
 * round of a game and computes the pot to hand back one field (#246). This is
 * one indexed lookup on `game_player`, left-joined onto the game row so the
 * answer can still tell a game that doesn't exist from one the caller isn't in
 * — without that join the two collapse into a single 403 and a missing game
 * stops 404ing. `(game_id, user_id)` is unique, so the join yields one row.
 *
 * An admin-removed player is not a member: the creator took them out and
 * refunded them, and every surface drops them from the field (`activeField`),
 * which is the reading `getGameDetail.isMember` already took. That is the one
 * thing this doesn't share with `getMembership` (`join-query.ts`), which asks a
 * different question — "does this person already have a row here?", the join
 * page's own guard against a second entry — and so must keep seeing removed
 * players.
 */
export async function requireMembership(gameId: string, userId: string): Promise<MembershipCheck> {
	const [row] = await db
		.select({ membership: gamePlayer })
		.from(game)
		.leftJoin(gamePlayer, and(eq(gamePlayer.gameId, game.id), eq(gamePlayer.userId, userId)))
		.where(eq(game.id, gameId))
		.limit(1)

	if (!row) return deny('not-found')
	if (!row.membership || isAdminRemoved(row.membership)) return deny('not-member')
	return { ok: true, membership: row.membership }
}
