import type { EliminationReason } from '@/lib/schema/game'

/**
 * Anything carrying a player's elimination reason — the full `game_player` row,
 * or one of the narrower `db.select` shapes the query layer builds. The
 * predicates below need nothing else, so they work on all of them.
 */
interface HasEliminationReason {
	eliminatedReason: EliminationReason | null
}

/**
 * An admin removal is a deliberate act, not a game outcome: the creator took
 * the player out and their entry was refunded. Every surface that counts,
 * ranks or names the field drops them rather than showing them as eliminated,
 * and the cup self-heal must leave them removed rather than reviving them.
 *
 * THE single reading of that state — don't hand-write the comparison.
 */
export function isAdminRemoved(player: HasEliminationReason): boolean {
	return player.eliminatedReason === 'admin_removed'
}

/**
 * The players a game actually has: everyone bar the admin-removed. Alive and
 * eliminated alike — being out of the game is part of its story, being removed
 * from it is not.
 *
 * One predicate over six call sites (the game view, the standings grid, both
 * cup standings passes and the round summary), so a surface can't drift into
 * counting a removed player into a pot target, a podium or a denominator.
 */
export function activeField<T extends HasEliminationReason>(players: T[]): T[] {
	return players.filter((p) => !isAdminRemoved(p))
}

/**
 * The `game_player` patch that takes a player out. Every elimination write goes
 * through it, which is what makes "eliminated with no reason recorded" a
 * compile error rather than a row that quietly slips through `activeField` and
 * every other reason-driven read — the World Cup auto-elim shipped exactly that
 * (#113) while the reason was a free `text` column.
 *
 * `eliminatedRoundId` is null only for eliminations that belong to no round —
 * an admin removal, which can happen at any point.
 */
export function eliminationUpdate(
	reason: EliminationReason,
	eliminatedRoundId: string | null,
): {
	status: 'eliminated'
	eliminatedReason: EliminationReason
	eliminatedRoundId: string | null
} {
	return { status: 'eliminated', eliminatedReason: reason, eliminatedRoundId }
}
