import { and, eq, inArray } from 'drizzle-orm'
import type { ClassicPickFixture } from '@/components/picks/classic-pick'
import type { GridCell, GridPlayer, GridRound } from '@/components/standings/progress-grid'
import { db } from '@/lib/db'
import { calculatePot } from '@/lib/game-logic/prizes'
import { round } from '@/lib/schema/competition'
import { game, pick } from '@/lib/schema/game'

export async function getGameDetail(gameId: string, userId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
			players: true,
			picks: true,
		},
	})

	if (!gameData) return null

	const myMembership = gameData.players.find((p) => p.userId === userId)
	const isAdmin = gameData.createdBy === userId
	const isMember = !!myMembership

	const pot = calculatePot(gameData.entryFee, gameData.players.length)

	return {
		id: gameData.id,
		name: gameData.name,
		gameMode: gameData.gameMode,
		status: gameData.status,
		competition: gameData.competition,
		currentRound: gameData.currentRound,
		entryFee: gameData.entryFee,
		inviteCode: gameData.inviteCode,
		pot,
		players: gameData.players,
		picks: gameData.picks,
		myMembership,
		isAdmin,
		isMember,
	}
}

export async function getClassicPickData(gameId: string, roundId: string, gamePlayerId: string) {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: { with: { homeTeam: true, awayTeam: true } },
		},
	})

	if (!roundData) return null

	const myPreviousPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gamePlayerId)),
		with: { round: true },
	})

	const usedTeamsByRound: Record<string, string> = {}
	for (const p of myPreviousPicks) {
		if (p.roundId !== roundId && p.round) {
			usedTeamsByRound[p.teamId] = p.round.name ?? `GW${p.round.number}`
		}
	}

	const currentPick = myPreviousPicks.find((p) => p.roundId === roundId)

	const fixtures: ClassicPickFixture[] = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
		},
		kickoff: f.kickoff ? formatKickoff(f.kickoff) : null,
	}))

	return {
		roundName: roundData.name ?? `GW${roundData.number}`,
		deadline: roundData.deadline,
		fixtures,
		usedTeamsByRound,
		existingPickTeamId: currentPick?.teamId ?? null,
	}
}

function formatKickoff(date: Date): string {
	return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export async function getTurboPickData(gameId: string, roundId: string, gamePlayerId: string) {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: { with: { homeTeam: true, awayTeam: true } },
		},
	})
	if (!roundData) return null

	const existingPicks = await db.query.pick.findMany({
		where: and(
			eq(pick.gameId, gameId),
			eq(pick.gamePlayerId, gamePlayerId),
			eq(pick.roundId, roundId),
		),
	})

	const fixtures = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
		},
		kickoff: f.kickoff ? formatKickoff(f.kickoff) : null,
	}))

	return {
		roundName: roundData.name ?? `GW${roundData.number}`,
		deadline: roundData.deadline,
		fixtures,
		existingPicks: existingPicks.map((p) => ({
			fixtureId: p.fixtureId ?? '',
			confidenceRank: p.confidenceRank ?? 0,
			predictedResult: (p.predictedResult ?? 'home_win') as 'home_win' | 'draw' | 'away_win',
		})),
	}
}

export async function getProgressGridData(gameId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			players: true,
			competition: {
				with: {
					rounds: { orderBy: (r, { asc }) => asc(r.number) },
				},
			},
			picks: { with: { team: true, round: true } },
		},
	})

	if (!gameData) return null

	const completedAndCurrentRounds = gameData.competition.rounds.filter(
		(r) => r.status !== 'upcoming',
	)

	const rounds: GridRound[] = completedAndCurrentRounds.map((r) => ({
		id: r.id,
		number: r.number,
		name: r.name ?? `GW${r.number}`,
	}))

	// Get user names for players
	const { user } = await import('@/lib/schema/auth')
	const userRows =
		gameData.players.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(
						inArray(
							user.id,
							gameData.players.map((p) => p.userId),
						),
					)
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))

	const players: GridPlayer[] = gameData.players.map((p) => {
		const cellsByRoundId: Record<string, GridCell> = {}
		for (const r of rounds) {
			const thePick = gameData.picks.find((pk) => pk.gamePlayerId === p.id && pk.roundId === r.id)

			if (p.status === 'eliminated' && p.eliminatedRoundId === r.id) {
				cellsByRoundId[r.id] = { result: 'skull' }
				continue
			}
			if (p.status === 'eliminated') {
				// After elimination — leave empty
				if (!thePick) {
					cellsByRoundId[r.id] = { result: 'empty' }
					continue
				}
			}
			if (!thePick) {
				cellsByRoundId[r.id] = { result: 'no_pick' }
				continue
			}
			const resultMap: Record<string, GridCell['result']> = {
				win: 'win',
				loss: 'loss',
				draw: 'draw',
				pending: 'pending',
				saved_by_life: 'pending',
			}
			cellsByRoundId[r.id] = {
				result: resultMap[thePick.result] ?? 'pending',
				teamShortName: thePick.team?.shortName,
			}
		}

		return {
			id: p.id,
			name: userNames.get(p.userId) ?? 'Player',
			status: p.status,
			eliminatedRoundNumber: p.eliminatedRoundId
				? gameData.competition.rounds.find((r) => r.id === p.eliminatedRoundId)?.number
				: undefined,
			cellsByRoundId,
		}
	})

	const aliveCount = players.filter((p) => p.status === 'alive').length
	const eliminatedCount = players.filter((p) => p.status === 'eliminated').length
	const pot = calculatePot(gameData.entryFee, gameData.players.length)

	return { rounds, players, aliveCount, eliminatedCount, pot }
}
