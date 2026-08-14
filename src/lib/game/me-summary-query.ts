import { and, eq, inArray, min } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	type BuildMeSummaryInput,
	buildMeSummaryView,
	type MeSummaryView,
	type SummaryFilters,
} from '@/lib/game/me-summary-view'
import { competition, round, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment, payout } from '@/lib/schema/payment'

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
			eliminatedRoundId: gamePlayer.eliminatedRoundId,
			modeConfig: game.modeConfig,
			competitionFamilyKey: competition.familyKey,
		})
		.from(gamePlayer)
		.innerJoin(game, eq(gamePlayer.gameId, game.id))
		.innerJoin(competition, eq(game.competitionId, competition.id))
		.where(and(eq(gamePlayer.userId, userId), inArray(game.status, ['active', 'completed'])))

	// Each game's own first playable round — its round one — as the lowest round
	// anybody in it ever picked in. A game is created at the competition's
	// earliest still-pickable round, so a game started in November opens at
	// gameweek 12; nothing on the game row remembers that afterwards, because
	// `current_round_id` advances as the game goes on. Every player's picks are
	// read, not just this one's: a player who missed the opening round has no
	// pick there to anchor it, and their rivals do. Classic only: it's the one
	// mode that plays more than one round, so the only one with a round one to
	// tell from the rest.
	const classicGameIds = gameRows.filter((row) => row.gameMode === 'classic').map((r) => r.gameId)
	const firstRoundRows =
		classicGameIds.length === 0
			? []
			: await db
					.select({ gameId: pick.gameId, firstRoundNumber: min(round.number) })
					.from(pick)
					.innerJoin(round, eq(pick.roundId, round.id))
					.where(inArray(pick.gameId, classicGameIds))
					.groupBy(pick.gameId)
	const firstRoundByGame = new Map(
		firstRoundRows.map((row) => [
			row.gameId,
			row.firstRoundNumber === null ? null : Number(row.firstRoundNumber),
		]),
	)

	// The `where` above already narrows the status; the map is what tells the
	// type system so, since `game.status` carries setup/open too.
	const games: BuildMeSummaryInput['games'] = gameRows.map(({ modeConfig, ...row }) => ({
		...row,
		gameStatus: row.gameStatus === 'completed' ? 'completed' : 'active',
		// Same reading as `isRebuyEligible`: anything short of an explicit true is
		// a game with no way back in.
		allowRebuys: modeConfig?.allowRebuys === true,
		// Null for a game nobody has picked in yet — there is no first round to
		// read, and the round-one block leaves such a game out rather than
		// guessing at one.
		firstRoundNumber: firstRoundByGame.get(row.gameId) ?? null,
	}))

	// Picks come back for every game the player has ever been in; the builder
	// keeps the ones whose game is in scope, so the season filter is applied in
	// exactly one place.
	const picks: BuildMeSummaryInput['picks'] = await db
		.select({
			gameId: pick.gameId,
			roundId: pick.roundId,
			roundNumber: round.number,
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
		// The round's number, not just its id: which round a pick was made in is
		// what tells round one from the rounds a rebuy bought.
		.innerJoin(round, eq(pick.roundId, round.id))
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

	// The player's own money, both directions. Rows come back for every game they
	// have ever been in and the builder keeps the ones in scope, exactly as it does
	// with picks. Every status is fetched — which of them counts as staked is the
	// builder's rule, and the one place it's stated.
	const payments: BuildMeSummaryInput['payments'] = await db
		.select({ gameId: payment.gameId, amount: payment.amount, status: payment.status })
		.from(payment)
		.where(eq(payment.userId, userId))

	// Payout status is selected but never read: nothing in the app advances a
	// payout past `pending`, so filtering on it would report every winner as zero.
	const payouts: BuildMeSummaryInput['payouts'] = await db
		.select({ gameId: payout.gameId, amount: payout.amount, status: payout.status })
		.from(payout)
		.where(eq(payout.userId, userId))

	return buildMeSummaryView({ games, picks, streakPicks, payments, payouts, filters })
}
