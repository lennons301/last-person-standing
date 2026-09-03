import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activeField } from '@/lib/game/elimination'
import { roundLabel, roundLabelLong } from '@/lib/game/round-label'
import {
	buildRoundSummary,
	type RoundSummaryFixtureRow,
	type RoundSummaryPlayerRow,
	type RoundSummaryView,
	selectRoundSummaryRound,
} from '@/lib/game/round-summary-view'
import { isGameStartingRound } from '@/lib/game/starting-round'
import { user } from '@/lib/schema/auth'
import { gamePlayer, game as gameTable, pick as pickTable } from '@/lib/schema/game'

/**
 * Every row the post-deadline round summary needs, handed to
 * `buildRoundSummary` for all of the judgement. This function decides only
 * *which* rows exist; what they mean is the builder's business.
 *
 * Classic only — turbo and cup rank N picks a round, which needs the tiles
 * re-derived (and cup competitions carry no prices at all). Null for any other
 * mode, and null before any of this game's own deadlines has passed.
 *
 * No new provider request and no new table: the prices are the `fixture_odds`
 * rows the daily sync already wrote, frozen at the round's deadline.
 */
export async function getRoundSummary(
	gameId: string,
	now: Date = new Date(),
): Promise<RoundSummaryView | null> {
	const game = await db.query.game.findFirst({
		where: eq(gameTable.id, gameId),
		with: { competition: { with: { rounds: true } } },
	})
	if (!game || game.gameMode !== 'classic') return null

	const rounds = game.competition.rounds
	const currentRoundNumber = rounds.find((r) => r.id === game.currentRoundId)?.number ?? null

	// The bound a completed game needs: it no longer points at a round, and the
	// competition plays on for months after a game is won.
	const pickedRounds = await db
		.select({ roundId: pickTable.roundId })
		.from(pickTable)
		.where(eq(pickTable.gameId, gameId))
	const pickedRoundNumbers = pickedRounds
		.map((p) => rounds.find((r) => r.id === p.roundId)?.number)
		.filter((n): n is number => n != null)
	const latestPickedRoundNumber =
		pickedRoundNumbers.length > 0 ? Math.max(...pickedRoundNumbers) : null

	const round = selectRoundSummaryRound({
		rounds,
		game: {
			currentRoundId: game.currentRoundId,
			currentRoundNumber,
			startingRoundId: game.startingRoundId,
		},
		latestPickedRoundNumber,
		now,
	})
	if (!round) return null

	const fixtureRows = await db.query.fixture.findMany({
		where: (fx, { eq: fxEq }) => fxEq(fx.roundId, round.id),
		with: { homeTeam: true, awayTeam: true, odds: true },
	})
	const fixtures: RoundSummaryFixtureRow[] = fixtureRows.map((fx) => ({
		id: fx.id,
		home: { id: fx.homeTeamId, shortName: fx.homeTeam.shortName, name: fx.homeTeam.name },
		away: { id: fx.awayTeamId, shortName: fx.awayTeam.shortName, name: fx.awayTeam.name },
		odds: fx.odds
			? {
					home: { probability: fx.odds.homeProbability, price: fx.odds.homePrice },
					draw: { probability: fx.odds.drawProbability, price: fx.odds.drawPrice },
					away: { probability: fx.odds.awayProbability, price: fx.odds.awayPrice },
				}
			: null,
	}))

	const playerRows = await db
		.select({
			id: gamePlayer.id,
			userId: gamePlayer.userId,
			status: gamePlayer.status,
			eliminatedRoundId: gamePlayer.eliminatedRoundId,
			eliminatedReason: gamePlayer.eliminatedReason,
			name: user.name,
		})
		.from(gamePlayer)
		.innerJoin(user, eq(gamePlayer.userId, user.id))
		.where(eq(gamePlayer.gameId, gameId))

	const picks = await db
		.select({
			gamePlayerId: pickTable.gamePlayerId,
			teamId: pickTable.teamId,
			isAuto: pickTable.isAuto,
		})
		.from(pickTable)
		.where(and(eq(pickTable.gameId, gameId), eq(pickTable.roundId, round.id)))
	const pickByPlayer = new Map(picks.map((p) => [p.gamePlayerId, p]))

	// The denominator is the players who were alive going *into* this round, so
	// the card's counts reconcile with the progress grid above it. A player
	// eliminated in this round or later was in it; one eliminated earlier wasn't.
	// Admin-removed players are out of the grid, so they're out of here too.
	const roundNumberById = new Map(rounds.map((r) => [r.id, r.number]))
	const players: RoundSummaryPlayerRow[] = activeField(playerRows)
		.filter((p) => {
			if (p.status !== 'eliminated') return true
			const eliminatedAt = p.eliminatedRoundId
				? roundNumberById.get(p.eliminatedRoundId)
				: undefined
			return eliminatedAt != null && eliminatedAt >= round.number
		})
		// Name order, so the prose and the card read the same way on every request.
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
		.map((p) => {
			const thePick = pickByPlayer.get(p.id)
			return {
				id: p.id,
				name: p.name,
				pick: thePick ? { teamId: thePick.teamId, isAuto: thePick.isAuto } : null,
			}
		})

	const competitionType = game.competition.type
	return buildRoundSummary({
		round: {
			label: roundLabel(competitionType, round.number),
			longLabel: round.name ?? roundLabelLong(competitionType, round.number),
		},
		isStartingRound: isGameStartingRound(game, round.id),
		players,
		fixtures,
	})
}
