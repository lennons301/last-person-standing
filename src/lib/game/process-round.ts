import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { processClassicRound } from '@/lib/game-logic/classic'
import { evaluateCupPicks } from '@/lib/game-logic/cup'
import { calculateTurboStandings, evaluateTurboPicks } from '@/lib/game-logic/turbo'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

export async function processGameRound(gameId: string, roundId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { players: true },
	})
	if (!gameData) throw new Error(`Game ${gameId} not found`)

	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: { fixtures: true },
	})
	if (!roundData) throw new Error(`Round ${roundId} not found`)

	// Check all fixtures are finished
	const allFinished = roundData.fixtures.every((f) => f.status === 'finished')
	if (!allFinished) return { processed: false, reason: 'Not all fixtures finished' }

	const alivePlayers = gameData.players.filter((p) => p.status === 'alive')

	const allPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
	})

	if (gameData.gameMode === 'classic') {
		const completedFixtures = roundData.fixtures
			.filter((f) => f.homeScore != null && f.awayScore != null)
			.map((f) => ({
				id: f.id,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				homeScore: f.homeScore as number,
				awayScore: f.awayScore as number,
			}))

		const playerPicks = alivePlayers.map((p) => {
			const playerPick = allPicks.find((pk) => pk.gamePlayerId === p.id)
			return {
				gamePlayerId: p.id,
				pickedTeamId: playerPick?.teamId ?? '',
			}
		})

		const result = processClassicRound({ players: playerPicks, fixtures: completedFixtures })

		// Update picks and player statuses
		for (const pr of result.results) {
			const playerPick = allPicks.find((pk) => pk.gamePlayerId === pr.gamePlayerId)
			if (playerPick) {
				await db.update(pick).set({ result: pr.result }).where(eq(pick.id, playerPick.id))
			}
			if (pr.eliminated) {
				await db
					.update(gamePlayer)
					.set({ status: 'eliminated', eliminatedRoundId: roundId })
					.where(eq(gamePlayer.id, pr.gamePlayerId))
			}
		}

		return { processed: true, eliminations: result.results.filter((r) => r.eliminated).length }
	}

	if (gameData.gameMode === 'turbo') {
		const playerResults = []
		for (const player of alivePlayers) {
			const playerPicks = allPicks
				.filter((pk) => pk.gamePlayerId === player.id)
				.map((pk) => {
					const f = roundData.fixtures.find((fx) => fx.id === pk.fixtureId)
					return {
						confidenceRank: pk.confidenceRank ?? 0,
						predictedResult: (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win',
						homeScore: f?.homeScore ?? 0,
						awayScore: f?.awayScore ?? 0,
					}
				})

			const result = evaluateTurboPicks(playerPicks)
			playerResults.push({
				gamePlayerId: player.id,
				streak: result.streak,
				goalsInStreak: result.goalsInStreak,
			})

			// Update each pick result
			for (const pr of result.pickResults) {
				const matchingPick = allPicks.find(
					(pk) => pk.gamePlayerId === player.id && pk.confidenceRank === pr.confidenceRank,
				)
				if (matchingPick) {
					await db
						.update(pick)
						.set({ result: pr.correct ? 'win' : 'loss', goalsScored: pr.goals })
						.where(eq(pick.id, matchingPick.id))
				}
			}
		}

		const standings = calculateTurboStandings(playerResults)
		return { processed: true, eliminations: 0, standings }
	}

	if (gameData.gameMode === 'cup') {
		let eliminations = 0
		for (const player of alivePlayers) {
			const playerPicks = allPicks
				.filter((pk) => pk.gamePlayerId === player.id)
				.map((pk) => {
					const f = roundData.fixtures.find((fx) => fx.id === pk.fixtureId)
					return {
						confidenceRank: pk.confidenceRank ?? 0,
						predictedResult: (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win',
						homeScore: f?.homeScore ?? 0,
						awayScore: f?.awayScore ?? 0,
						tierDifference: 0, // TODO: store tier_difference on fixture in cup competitions
					}
				})

			const startingLives = player.livesRemaining
			const result = evaluateCupPicks(playerPicks, startingLives)

			await db
				.update(gamePlayer)
				.set({
					livesRemaining: result.finalLives,
					...(result.eliminated
						? { status: 'eliminated' as const, eliminatedRoundId: roundId }
						: {}),
				})
				.where(eq(gamePlayer.id, player.id))

			if (result.eliminated) eliminations++

			// Update each pick result
			for (const pr of result.pickResults) {
				const matchingPick = allPicks.find(
					(pk) => pk.gamePlayerId === player.id && pk.confidenceRank === pr.confidenceRank,
				)
				if (matchingPick) {
					await db
						.update(pick)
						.set({
							result: pr.correct
								? 'win'
								: pr.savedByDraw
									? 'draw'
									: pr.lifeLost
										? 'saved_by_life'
										: 'loss',
							goalsScored: pr.goalsCounted,
						})
						.where(eq(pick.id, matchingPick.id))
				}
			}
		}

		return { processed: true, eliminations }
	}

	return { processed: false, reason: 'Unknown game mode' }
}
