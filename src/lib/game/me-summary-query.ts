import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	type BuildMeSummaryInput,
	buildMeSummaryView,
	type MeSummaryView,
	type SummaryFilters,
} from '@/lib/game/me-summary-view'
import { competition, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

/** The career, unfiltered — every game the player has entered. */
export const CAREER: SummaryFilters = { season: null }

/**
 * Every row the player's own summary page needs, handed to `buildMeSummaryView`
 * for all of the arithmetic. The only thing this function decides is *which*
 * rows exist; what they mean is the builder's business.
 *
 * `userId` always comes from the session — there is no route parameter through
 * which one player could ask for another's summary.
 */
export async function getMeSummary(
	userId: string,
	filters: SummaryFilters = CAREER,
): Promise<MeSummaryView> {
	// A game still in setup or open hasn't been played yet, so it isn't part of
	// the played/won record. A player whose only game is still filling up gets
	// the "nothing to show yet" page rather than a nought-for-one win rate.
	const games: BuildMeSummaryInput['games'] = await db
		.select({
			gameId: game.id,
			gameMode: game.gameMode,
			season: competition.season,
			playerStatus: gamePlayer.status,
		})
		.from(gamePlayer)
		.innerJoin(game, eq(gamePlayer.gameId, game.id))
		.innerJoin(competition, eq(game.competitionId, competition.id))
		.where(and(eq(gamePlayer.userId, userId), inArray(game.status, ['active', 'completed'])))

	// Picks come back for every game the player has ever been in; the builder
	// keeps the ones whose game is in scope, so the season filter is applied in
	// exactly one place.
	const picks: BuildMeSummaryInput['picks'] = await db
		.select({
			gameId: pick.gameId,
			teamId: team.id,
			teamName: team.name,
			teamShortName: team.shortName,
			teamBadgeUrl: team.badgeUrl,
			result: pick.result,
			isAuto: pick.isAuto,
		})
		.from(pick)
		.innerJoin(gamePlayer, eq(pick.gamePlayerId, gamePlayer.id))
		.innerJoin(team, eq(pick.teamId, team.id))
		.where(eq(gamePlayer.userId, userId))

	return buildMeSummaryView({ games, picks, filters })
}
