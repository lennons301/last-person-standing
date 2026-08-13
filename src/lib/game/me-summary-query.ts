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
	const gameRows = await db
		.select({
			gameId: game.id,
			gameName: game.name,
			gameMode: game.gameMode,
			gamePlayerId: gamePlayer.id,
			gameStatus: game.status,
			competitionId: competition.id,
			competitionName: competition.name,
			season: competition.season,
			playerStatus: gamePlayer.status,
			competitionFamilyKey: competition.familyKey,
		})
		.from(gamePlayer)
		.innerJoin(game, eq(gamePlayer.gameId, game.id))
		.innerJoin(competition, eq(game.competitionId, competition.id))
		.where(and(eq(gamePlayer.userId, userId), inArray(game.status, ['active', 'completed'])))

	// The `where` above already narrows the status; the map is what tells the
	// type system so, since `game.status` carries setup/open too.
	const games: BuildMeSummaryInput['games'] = gameRows.map((row) => ({
		...row,
		gameStatus: row.gameStatus === 'completed' ? 'completed' : 'active',
	}))

	// Picks come back for every game the player has ever been in; the builder
	// keeps the ones whose game is in scope, so the season filter is applied in
	// exactly one place.
	const picks: BuildMeSummaryInput['picks'] = await db
		.select({
			gameId: pick.gameId,
			roundId: pick.roundId,
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

	// Single-round modes only, and every player's picks in those games — not just
	// this player's. The engine rebases a streak to the lowest rank *anyone* got
	// right, so the rivals' rows are what make the summary's streak the same
	// number the game was decided by.
	const singleRoundGameIds = games.filter((g) => g.gameMode !== 'classic').map((g) => g.gameId)
	const streakPickRows =
		singleRoundGameIds.length === 0
			? []
			: await db
					.select({
						gameId: pick.gameId,
						gamePlayerId: pick.gamePlayerId,
						confidenceRank: pick.confidenceRank,
						result: pick.result,
						playerStatus: gamePlayer.status,
					})
					.from(pick)
					.innerJoin(gamePlayer, eq(pick.gamePlayerId, gamePlayer.id))
					.where(inArray(pick.gameId, singleRoundGameIds))

	// Void and pending picks are dropped here exactly as the engine's own
	// collectors drop them: the streak walks past a cancelled fixture and stops
	// at anything unsettled. A pick with no confidence rank isn't part of a
	// single-round game's ordering at all.
	const streakPicks: BuildMeSummaryInput['streakPicks'] = streakPickRows
		.filter((row) => row.confidenceRank !== null)
		.filter((row) => row.result !== 'void' && row.result !== 'pending')
		.map((row) => ({ ...row, confidenceRank: row.confidenceRank as number }))

	return buildMeSummaryView({ games, picks, streakPicks, filters })
}
