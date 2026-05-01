import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { processClassicRound } from '@/lib/game-logic/classic'
import { evaluateCupPicks } from '@/lib/game-logic/cup'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { calculateTurboStandings, evaluateTurboPicks } from '@/lib/game-logic/turbo'
import {
	computeWcClassicAutoElims,
	type WcFixture,
	wcRoundStage,
} from '@/lib/game-logic/wc-classic'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

/**
 * Advance the game's currentRoundId pointer to the next round in the
 * competition (or null if there are no further rounds). Called after
 * a round has been processed so that picks can begin on the next round
 * for this game. Round-state is per-game: each game advances independently
 * based on when its rounds complete, not on a global competition timeline.
 */
async function advanceGameToNextRound(
	gameId: string,
	competitionId: string,
	completedRoundNumber: number,
): Promise<void> {
	const nextRound = await db.query.round.findFirst({
		where: and(eq(round.competitionId, competitionId), gt(round.number, completedRoundNumber)),
		orderBy: [asc(round.number)],
	})
	await db
		.update(game)
		.set({ currentRoundId: nextRound?.id ?? null })
		.where(eq(game.id, gameId))
}

export async function processGameRound(gameId: string, roundId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { players: true, competition: true },
	})
	if (!gameData) throw new Error(`Game ${gameId} not found`)

	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: {
				with: { homeTeam: true, awayTeam: true },
			},
		},
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

		const allowRebuys =
			(gameData.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
		const isStartingRound = roundData.number === 1 && !allowRebuys

		const result = processClassicRound({
			players: playerPicks,
			fixtures: completedFixtures,
			isStartingRound,
		})

		// Update picks and player statuses
		for (const pr of result.results) {
			const playerPick = allPicks.find((pk) => pk.gamePlayerId === pr.gamePlayerId)
			if (playerPick) {
				await db
					.update(pick)
					.set({ result: pr.result, goalsScored: pr.goalsScored })
					.where(eq(pick.id, playerPick.id))
			}
			if (pr.eliminated) {
				await db
					.update(gamePlayer)
					.set({ status: 'eliminated', eliminatedRoundId: roundId })
					.where(eq(gamePlayer.id, pr.gamePlayerId))
			}
		}

		let eliminations = result.results.filter((r) => r.eliminated).length

		if (gameData.competition.type === 'group_knockout') {
			const allRounds = await db.query.round.findMany({
				where: eq(round.competitionId, gameData.competitionId),
				with: { fixtures: true },
			})
			const finishedKnockoutFixtures: WcFixture[] = allRounds.flatMap((r) =>
				r.fixtures.map((f) => ({
					id: f.id,
					roundId: r.id,
					homeTeamId: f.homeTeamId,
					awayTeamId: f.awayTeamId,
					homeScore: f.homeScore,
					awayScore: f.awayScore,
					status: f.status,
					stage: wcRoundStage(r.number),
				})),
			)
			const remainingRounds = allRounds
				.filter((r) => r.status !== 'completed' && r.id !== roundId)
				.map((r) => ({
					id: r.id,
					fixtures: r.fixtures.map((f) => ({
						id: f.id,
						roundId: r.id,
						homeTeamId: f.homeTeamId,
						awayTeamId: f.awayTeamId,
						homeScore: f.homeScore,
						awayScore: f.awayScore,
						status: f.status,
						stage: wcRoundStage(r.number),
					})),
				}))

			// Reload alive players after the classic updates above
			const aliveAfter = await db.query.gamePlayer.findMany({
				where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
			})
			const picksForAlive = await db.query.pick.findMany({
				where: eq(pick.gameId, gameId),
			})
			const alivePlayersForAutoElim = aliveAfter.map((p) => ({
				gamePlayerId: p.id,
				usedTeamIds: picksForAlive.filter((pk) => pk.gamePlayerId === p.id).map((pk) => pk.teamId),
			}))

			const autoElims = computeWcClassicAutoElims({
				alivePlayers: alivePlayersForAutoElim,
				remainingRounds,
				finishedKnockoutFixtures,
			})

			for (const ae of autoElims) {
				await db
					.update(gamePlayer)
					.set({ status: 'eliminated', eliminatedRoundId: roundId })
					.where(eq(gamePlayer.id, ae.gamePlayerId))
			}
			eliminations += autoElims.length
		}

		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		await advanceGameToNextRound(gameId, gameData.competitionId, roundData.number)
		return { processed: true, eliminations }
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
		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		await advanceGameToNextRound(gameId, gameData.competitionId, roundData.number)
		return { processed: true, eliminations: 0, standings }
	}

	if (gameData.gameMode === 'cup') {
		let eliminations = 0
		for (const player of alivePlayers) {
			const playerCupPicks = allPicks
				.filter((pk) => pk.gamePlayerId === player.id)
				.map((pk) => {
					const f = roundData.fixtures.find((fx) => fx.id === pk.fixtureId)
					const pickedTeam: 'home' | 'away' = pk.teamId === f?.homeTeamId ? 'home' : 'away'
					const tierDifference = f
						? computeTierDifference(f.homeTeam, f.awayTeam, gameData.competition.type)
						: 0
					return {
						confidenceRank: pk.confidenceRank ?? 0,
						pickedTeam,
						homeScore: f?.homeScore ?? 0,
						awayScore: f?.awayScore ?? 0,
						tierDifference,
					}
				})

			const startingLives = player.livesRemaining
			const result = evaluateCupPicks(playerCupPicks, startingLives)

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
					// Map cup result to DB pick_result enum
					const dbResult =
						pr.result === 'win'
							? ('win' as const)
							: pr.result === 'draw_success'
								? ('draw' as const)
								: pr.result === 'saved_by_life'
									? ('saved_by_life' as const)
									: ('loss' as const) // 'loss' and 'restricted' both map to 'loss'
					await db
						.update(pick)
						.set({
							result: dbResult,
							goalsScored: pr.goalsCounted,
						})
						.where(eq(pick.id, matchingPick.id))
				}
			}
		}

		await db.update(round).set({ status: 'completed' }).where(eq(round.id, roundId))
		await advanceGameToNextRound(gameId, gameData.competitionId, roundData.number)
		return { processed: true, eliminations }
	}

	return { processed: false, reason: 'Unknown game mode' }
}
