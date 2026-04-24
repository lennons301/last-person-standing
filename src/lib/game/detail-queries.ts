import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import type { ClassicPickFixture } from '@/components/picks/classic-pick'
import type { FormResult } from '@/components/picks/form-dots'
import type { GridCell, GridPlayer, GridRound } from '@/components/standings/progress-grid'
import { db } from '@/lib/db'
import {
	buildChainSlots,
	buildPlannerRounds,
	type ChainPastPickRow,
	type ChainPlannedPickRow,
	type ChainRoundRow,
	type FutureRoundRow,
} from '@/lib/game/classic-planner-view'
import { calculatePot } from '@/lib/game-logic/prizes'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, pick, plannedPick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

export async function getGameDetail(gameId: string, userId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
			players: true,
			picks: {
				with: {
					team: true,
					fixture: { with: { homeTeam: true, awayTeam: true } },
				},
			},
		},
	})

	if (!gameData) return null

	const myMembership = gameData.players.find((p) => p.userId === userId)
	const isAdmin = gameData.createdBy === userId
	const isMember = !!myMembership

	// Viewer's current-round pick (used by AutoPickBanner to detect auto-picks).
	let myCurrentRoundPick: {
		id: string
		isAuto: boolean
		teamShortName: string
		kickoffLabel: string
	} | null = null
	if (myMembership && gameData.currentRoundId) {
		const currentPick = gameData.picks.find(
			(p) => p.gamePlayerId === myMembership.id && p.roundId === gameData.currentRoundId,
		)
		if (currentPick) {
			const kickoff = currentPick.fixture?.kickoff ?? null
			myCurrentRoundPick = {
				id: currentPick.id,
				isAuto: currentPick.isAuto,
				teamShortName: currentPick.team?.shortName ?? '?',
				kickoffLabel: kickoff ? formatKickoff(kickoff) : 'TBC',
			}
		}
	}

	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, gameId),
	})
	const pot = calculatePot(payments)

	// Resolve user names for every player + the admin so payment UI can show names.
	const { user } = await import('@/lib/schema/auth')
	const relevantUserIds = Array.from(
		new Set([gameData.createdBy, ...gameData.players.map((p) => p.userId)]),
	)
	const userRows =
		relevantUserIds.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, relevantUserIds))
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))
	const creatorName = userNames.get(gameData.createdBy) ?? 'the admin'

	// Group payments by userId so we can mark duplicates (rebuys) for UI.
	const paymentsByUser = new Map<string, typeof payments>()
	for (const p of payments) {
		const list = paymentsByUser.get(p.userId) ?? []
		list.push(p)
		paymentsByUser.set(p.userId, list)
	}

	// Viewer's primary (earliest) payment row — the one the claim endpoint targets.
	const myPaymentRows = [...(paymentsByUser.get(userId) ?? [])].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	const myPayment = myPaymentRows[0]
		? {
				status: myPaymentRows[0].status as 'pending' | 'claimed' | 'paid' | 'refunded',
				amount: myPaymentRows[0].amount,
			}
		: null

	// Full list of payments (one row per payment record) with user name + isRebuy
	// flag. Viewer's own payments are excluded from otherPayments.
	const allPayments = Array.from(paymentsByUser.entries()).flatMap(([uid, rows]) => {
		const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		return sorted.map((row, idx) => ({
			userId: uid,
			userName: userNames.get(uid) ?? 'Player',
			amount: row.amount,
			status: row.status as 'pending' | 'claimed' | 'paid' | 'refunded',
			isRebuy: idx > 0,
			claimedAt: row.claimedAt,
			paidAt: row.paidAt,
		}))
	})
	const otherPayments = allPayments
		.filter((p) => p.userId !== userId)
		.map((p) => ({ userName: p.userName, status: p.status, isRebuy: p.isRebuy }))
	const adminPayments = isAdmin ? allPayments : undefined

	return {
		id: gameData.id,
		name: gameData.name,
		gameMode: gameData.gameMode,
		modeConfig: gameData.modeConfig,
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
		creatorName,
		myPayment,
		otherPayments,
		adminPayments,
		myCurrentRoundPick,
	}
}

/**
 * Compute a team's form from their last N finished fixtures across the competition.
 */
async function computeTeamForms(
	teamIds: string[],
	competitionId: string,
	beforeRoundNumber: number,
	lastN = 6,
): Promise<Map<string, FormResult[]>> {
	if (teamIds.length === 0) return new Map()

	// Get all finished fixtures for this competition in rounds before the target round
	const finished = await db
		.select({
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
			roundNumber: round.number,
		})
		.from(fixture)
		.innerJoin(round, eq(round.id, fixture.roundId))
		.where(
			and(
				eq(round.competitionId, competitionId),
				eq(fixture.status, 'finished'),
				lt(round.number, beforeRoundNumber),
				or(inArray(fixture.homeTeamId, teamIds), inArray(fixture.awayTeamId, teamIds)),
			),
		)
		.orderBy(desc(round.number))

	const map = new Map<string, FormResult[]>()
	for (const row of finished) {
		if (row.homeScore == null || row.awayScore == null) continue
		const home = row.homeScore
		const away = row.awayScore
		for (const teamId of [row.homeTeamId, row.awayTeamId]) {
			if (!teamIds.includes(teamId)) continue
			const list = map.get(teamId) ?? []
			if (list.length >= lastN) continue
			const isHome = teamId === row.homeTeamId
			let result: FormResult
			if (home === away) result = 'D'
			else if (isHome) result = home > away ? 'W' : 'L'
			else result = away > home ? 'W' : 'L'
			list.push(result)
			map.set(teamId, list)
		}
	}
	return map
}

export async function getClassicPickData(gameId: string, roundId: string, gamePlayerId: string) {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: { with: { homeTeam: true, awayTeam: true } },
			competition: true,
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

	// Build team IDs and fetch form data
	const teamIds = Array.from(
		new Set(roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
	)
	const formMap = await computeTeamForms(teamIds, roundData.competitionId, roundData.number)

	const fixtures: ClassicPickFixture[] = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
			badgeUrl: f.homeTeam.badgeUrl,
			form: formMap.get(f.homeTeamId),
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
			badgeUrl: f.awayTeam.badgeUrl,
			form: formMap.get(f.awayTeamId),
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
	// e.g. "Sat 17 Jan · 15:00"
	const day = date.toLocaleDateString('en-GB', { weekday: 'short' })
	const dayOfMonth = date.getDate()
	const month = date.toLocaleDateString('en-GB', { month: 'short' })
	const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
	return `${day} ${dayOfMonth} ${month} · ${time}`
}

export async function getTurboPickData(gameId: string, roundId: string, gamePlayerId: string) {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: { with: { homeTeam: true, awayTeam: true } },
			competition: true,
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

	const teamIds = Array.from(
		new Set(roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
	)
	const formMap = await computeTeamForms(teamIds, roundData.competitionId, roundData.number)

	const fixtures = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
			badgeUrl: f.homeTeam.badgeUrl,
			form: formMap.get(f.homeTeamId),
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
			badgeUrl: f.awayTeam.badgeUrl,
			form: formMap.get(f.awayTeamId),
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

export async function getTurboStandingsData(
	gameId: string,
	viewerUserId?: string,
	options?: { hideOpenRoundPicks?: boolean },
) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			players: true,
			currentRound: true,
			competition: {
				with: {
					rounds: { orderBy: (r, { asc }) => asc(r.number) },
				},
			},
			picks: {
				with: {
					fixture: { with: { homeTeam: true, awayTeam: true } },
					round: true,
				},
			},
		},
	})
	if (!gameData) return null

	const viewerGamePlayerId = viewerUserId
		? gameData.players.find((p) => p.userId === viewerUserId)?.id
		: undefined

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

	// Turbo is a single-gameweek game — only surface the round this game is tied to.
	const visibleRounds = gameData.currentRound ? [gameData.currentRound] : []

	// Precompute each player's streak progression so we can mark streak-breaker cells
	// at the fixture level in the ladder view.
	const playerStreakBreakRank = new Map<string, number | null>() // playerId -> rank where streak broke, or null
	for (const p of gameData.players) {
		const picks = gameData.picks
			.filter((pk) => pk.gamePlayerId === p.id && pk.roundId === gameData.currentRoundId)
			.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))
		let broken: number | null = null
		for (const pk of picks) {
			if (pk.result !== 'win' && pk.result !== 'pending') {
				broken = pk.confidenceRank ?? null
				break
			}
		}
		playerStreakBreakRank.set(p.id, broken)
	}

	return {
		rounds: visibleRounds.map((r) => {
			const isRoundOpen = r.status !== 'completed'

			const players = gameData.players.map((p) => {
				const playerPicks = gameData.picks
					.filter((pk) => pk.gamePlayerId === p.id && pk.roundId === r.id)
					.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))

				const isOwnPick = viewerGamePlayerId === p.id
				const hideCells = isRoundOpen && (options?.hideOpenRoundPicks || !isOwnPick)

				// Compute streak + goals from this player's picks (only for completed rounds)
				let streak = 0
				let goals = 0
				if (!isRoundOpen) {
					let broken = false
					for (const pk of playerPicks) {
						if (broken) continue
						if (pk.result === 'win') {
							streak++
							goals += pk.goalsScored ?? 0
						} else {
							broken = true
						}
					}
				}

				const cells = playerPicks.map((pk) => {
					const homeShort = pk.fixture?.homeTeam?.shortName ?? '?'
					const awayShort = pk.fixture?.awayTeam?.shortName ?? '?'
					const scorePart =
						pk.fixture?.homeScore != null && pk.fixture.awayScore != null
							? `${pk.fixture.homeScore}-${pk.fixture.awayScore}`
							: undefined
					const prediction = (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win'

					let result: 'win' | 'loss' | 'pending' | 'hidden'
					if (hideCells) result = 'hidden'
					else if (pk.result === 'win') result = 'win'
					else if (pk.result === 'loss') result = 'loss'
					else result = 'pending'

					return {
						rank: pk.confidenceRank ?? 0,
						homeShort,
						awayShort,
						prediction,
						result,
						opponentScore: scorePart,
						goalsCounted: pk.goalsScored ?? 0,
					}
				})

				return {
					id: p.id,
					name: userNames.get(p.userId) ?? 'Player',
					picks: cells,
					streak,
					goals,
					hasSubmitted: playerPicks.length > 0,
				}
			})

			// Fixture-level ladder view: one row per fixture, each with predictions broken down
			const fixtureMap = new Map<
				string,
				{
					id: string
					home: { shortName: string; name: string; badgeUrl?: string | null }
					away: { shortName: string; name: string; badgeUrl?: string | null }
					kickoff: Date | null
					homeScore: number | null
					awayScore: number | null
					actualOutcome: 'home_win' | 'draw' | 'away_win' | null
					avgRank: number
					predictions: Array<{
						playerId: string
						playerName: string
						prediction: 'home_win' | 'draw' | 'away_win'
						rank: number
						correct: boolean | null
						streakBroken: boolean
						hidden: boolean
					}>
				}
			>()

			for (const p of gameData.players) {
				const playerName = userNames.get(p.userId) ?? 'Player'
				const isOwnPick = viewerGamePlayerId === p.id
				const streakBreakRank = playerStreakBreakRank.get(p.id)
				const hideThisPlayerInOpenRound = isRoundOpen && (options?.hideOpenRoundPicks || !isOwnPick)

				const playerPicks = gameData.picks.filter(
					(pk) => pk.gamePlayerId === p.id && pk.roundId === r.id,
				)

				for (const pk of playerPicks) {
					if (!pk.fixture || !pk.fixtureId) continue
					let entry = fixtureMap.get(pk.fixtureId)
					if (!entry) {
						const hs = pk.fixture.homeScore
						const as = pk.fixture.awayScore
						let actualOutcome: 'home_win' | 'draw' | 'away_win' | null = null
						if (hs != null && as != null) {
							actualOutcome = hs > as ? 'home_win' : as > hs ? 'away_win' : 'draw'
						}
						entry = {
							id: pk.fixtureId,
							home: {
								shortName: pk.fixture.homeTeam?.shortName ?? '?',
								name: pk.fixture.homeTeam?.name ?? '?',
								badgeUrl: pk.fixture.homeTeam?.badgeUrl,
							},
							away: {
								shortName: pk.fixture.awayTeam?.shortName ?? '?',
								name: pk.fixture.awayTeam?.name ?? '?',
								badgeUrl: pk.fixture.awayTeam?.badgeUrl,
							},
							kickoff: pk.fixture.kickoff,
							homeScore: hs,
							awayScore: as,
							actualOutcome,
							avgRank: 0,
							predictions: [],
						}
						fixtureMap.set(pk.fixtureId, entry)
					}
					const prediction = (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win'
					const correct = entry.actualOutcome == null ? null : entry.actualOutcome === prediction
					const rank = pk.confidenceRank ?? 0
					const streakBroken = streakBreakRank === rank
					entry.predictions.push({
						playerId: p.id,
						playerName,
						prediction,
						rank,
						correct,
						streakBroken,
						hidden: hideThisPlayerInOpenRound,
					})
				}
			}

			// Compute average rank across predictions, then sort fixtures by it so the
			// ladder reads in "most collectively important" order.
			const fixtures = Array.from(fixtureMap.values()).map((f) => ({
				...f,
				avgRank:
					f.predictions.length > 0
						? f.predictions.reduce((s, p) => s + p.rank, 0) / f.predictions.length
						: 99,
			}))
			fixtures.sort((a, b) => a.avgRank - b.avgRank)

			return {
				id: r.id,
				number: r.number,
				name: r.name ?? `GW${r.number}`,
				status: (isRoundOpen ? (r.status === 'open' ? 'open' : 'active') : 'completed') as
					| 'open'
					| 'active'
					| 'completed',
				players,
				fixtures,
			}
		}),
	}
}

export async function getProgressGridData(
	gameId: string,
	viewerUserId?: string,
	options?: { hideAllCurrentPicks?: boolean },
) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			players: true,
			competition: {
				with: {
					rounds: { orderBy: (r, { asc }) => asc(r.number) },
				},
			},
			picks: {
				with: {
					team: true,
					round: true,
					fixture: { with: { homeTeam: true, awayTeam: true } },
				},
			},
		},
	})

	if (!gameData) return null

	// Identify the viewer's gamePlayer so we can still show them their own current pick,
	// while hiding other players' picks for in-progress (not completed) rounds.
	const viewerGamePlayerId = viewerUserId
		? gameData.players.find((p) => p.userId === viewerUserId)?.id
		: undefined

	const completedAndCurrentRounds = gameData.competition.rounds.filter(
		(r) => r.status !== 'upcoming',
	)

	const rounds: GridRound[] = completedAndCurrentRounds.map((r) => ({
		id: r.id,
		number: r.number,
		name: r.name ?? `GW${r.number}`,
		isStartingRound: r.number === 1,
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
			const round = gameData.competition.rounds.find((cr) => cr.id === r.id)
			const isRoundOpen = round?.status !== 'completed'
			const isOwnPick = viewerGamePlayerId && thePick?.gamePlayerId === viewerGamePlayerId
			// If the round is open and either the viewer isn't the picker or the caller
			// has requested a shared-view (hide everything current) — hide the team info.
			const hideTeam = isRoundOpen && (options?.hideAllCurrentPicks || !isOwnPick)

			if (!thePick) {
				// Always show "?" for players who haven't picked yet — acts as a nudge.
				cellsByRoundId[r.id] = { result: 'no_pick' }
				continue
			}

			// In an open round, if we should hide others' picks: show "locked" to indicate
			// "pick is in but hidden". The viewer's own pick is still visible unless
			// hideAllCurrentPicks is set (share-image mode).
			if (hideTeam) {
				cellsByRoundId[r.id] = { result: 'locked' }
				continue
			}

			// In classic, draws eliminate after the starting round — render them as losses.
			// The starting round is round number 1 (first gameweek exemption).
			let resultForCell: GridCell['result']
			if (thePick.result === 'win') resultForCell = 'win'
			else if (thePick.result === 'loss') resultForCell = 'loss'
			else if (thePick.result === 'draw') resultForCell = r.number === 1 ? 'draw_exempt' : 'loss'
			else if (thePick.result === 'saved_by_life') resultForCell = 'saved'
			else resultForCell = 'pending'

			let opponentShortName: string | undefined
			let homeAway: 'H' | 'A' | undefined
			let score: string | undefined
			if (thePick.fixture) {
				const pickedHome = thePick.teamId === thePick.fixture.homeTeamId
				homeAway = pickedHome ? 'H' : 'A'
				opponentShortName = pickedHome
					? thePick.fixture.awayTeam?.shortName
					: thePick.fixture.homeTeam?.shortName
				if (thePick.fixture.homeScore != null && thePick.fixture.awayScore != null) {
					score = pickedHome
						? `${thePick.fixture.homeScore}-${thePick.fixture.awayScore}`
						: `${thePick.fixture.awayScore}-${thePick.fixture.homeScore}`
				}
			}

			cellsByRoundId[r.id] = {
				result: resultForCell,
				teamShortName: thePick.team?.shortName,
				opponentShortName,
				homeAway,
				score,
				isAuto: thePick.isAuto,
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
	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, gameId),
	})
	const pot = calculatePot(payments).total

	return { rounds, players, aliveCount, eliminatedCount, pot }
}

export async function getLivePayload(gameId: string, viewerUserId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			currentRound: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
			players: true,
		},
	})
	if (!gameData) return null

	const picksInRound = gameData.currentRoundId
		? await db.query.pick.findMany({
				where: and(eq(pick.gameId, gameId), eq(pick.roundId, gameData.currentRoundId)),
			})
		: []

	const fixtures = (gameData.currentRound?.fixtures ?? []).map((f) => ({
		id: f.id,
		kickoff: f.kickoff,
		homeScore: f.homeScore,
		awayScore: f.awayScore,
		status: f.status,
		homeShort: f.homeTeam.shortName,
		awayShort: f.awayTeam.shortName,
	}))

	return {
		gameId: gameData.id,
		gameMode: gameData.gameMode,
		roundId: gameData.currentRoundId,
		fixtures,
		picks: picksInRound.map((p) => ({
			gamePlayerId: p.gamePlayerId,
			fixtureId: p.fixtureId,
			teamId: p.teamId,
			confidenceRank: p.confidenceRank,
			predictedResult: p.predictedResult,
			result: p.result,
		})),
		players: gameData.players.map((p) => ({
			id: p.id,
			userId: p.userId,
			status: p.status,
			livesRemaining: p.livesRemaining,
		})),
		viewerUserId,
		updatedAt: new Date().toISOString(),
	}
}

/**
 * Load everything needed to render the classic-pick chain ribbon and the
 * planner section: all rounds in the competition, the player's own past and
 * planned picks (with team metadata), and every upcoming round's fixtures.
 */
export async function getClassicPlannerData(
	gameId: string,
	gamePlayerId: string,
	currentRoundId: string | null,
) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: {
				with: {
					rounds: {
						orderBy: (r, { asc }) => asc(r.number),
						with: { fixtures: { with: { homeTeam: true, awayTeam: true } } },
					},
				},
			},
		},
	})
	if (!gameData) return null

	// Pull the player's picks (all rounds) and plans in parallel.
	const [playerPicks, playerPlans] = await Promise.all([
		db.query.pick.findMany({
			where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gamePlayerId)),
			with: { round: true, team: true },
		}),
		db.query.plannedPick.findMany({
			where: eq(plannedPick.gamePlayerId, gamePlayerId),
			with: { round: true, team: true },
		}),
	])

	const rounds: ChainRoundRow[] = gameData.competition.rounds.map((r) => ({
		id: r.id,
		number: r.number,
		name: r.name,
		status: r.status,
	}))

	// Past picks are every pick for a round that isn't the current round (i.e.
	// something already in the past — draws/losses/wins/saves). We include the
	// current-round pick separately so the ribbon can render it as 'current'.
	const pastPicks: ChainPastPickRow[] = playerPicks
		.filter((p) => p.roundId !== currentRoundId)
		.map((p) => ({
			roundId: p.roundId,
			teamId: p.teamId,
			result: p.result,
			teamShortName: p.team.shortName,
			teamColour: p.team.primaryColor,
		}))

	const currentPickRow = currentRoundId
		? playerPicks.find((p) => p.roundId === currentRoundId)
		: undefined
	const currentPick = currentPickRow
		? {
				roundId: currentPickRow.roundId,
				teamShortName: currentPickRow.team.shortName,
				teamColour: currentPickRow.team.primaryColor,
			}
		: null

	const plannedPicksChain: ChainPlannedPickRow[] = playerPlans.map((p) => ({
		roundId: p.roundId,
		teamId: p.teamId,
		autoSubmit: p.autoSubmit,
		teamShortName: p.team.shortName,
		teamColour: p.team.primaryColor,
	}))

	const upcomingRoundsFixturesTbc = new Set<string>()
	for (const r of gameData.competition.rounds) {
		if (r.status === 'upcoming' && r.fixtures.length === 0) {
			upcomingRoundsFixturesTbc.add(r.id)
		}
	}

	// Count distinct teams in the competition. We derive this from the team
	// table joined on this competition's fixtures — any team appearing in a
	// fixture counts as "in the competition".
	const teamRows = await db
		.selectDistinct({ id: team.id })
		.from(team)
		.innerJoin(fixture, or(eq(fixture.homeTeamId, team.id), eq(fixture.awayTeamId, team.id)))
		.innerJoin(round, eq(round.id, fixture.roundId))
		.where(eq(round.competitionId, gameData.competition.id))
	const totalTeams = teamRows.length

	const chain = buildChainSlots({
		rounds,
		pastPicks,
		currentPick,
		plannedPicks: plannedPicksChain,
		currentRoundId,
		upcomingRoundsFixturesTbc,
		totalTeams,
	})

	// Build future-round inputs: every upcoming round, whether its fixtures
	// are published or not. The PlannerRound component handles the TBC case.
	const futureRoundRows: FutureRoundRow[] = gameData.competition.rounds
		.filter((r) => r.status === 'upcoming')
		.map((r) => ({
			id: r.id,
			number: r.number,
			name: r.name,
			deadline: r.deadline,
			fixtures: r.fixtures.map((f) => ({
				id: f.id,
				kickoff: f.kickoff,
				homeTeam: {
					id: f.homeTeam.id,
					name: f.homeTeam.name,
					shortName: f.homeTeam.shortName,
					badgeUrl: f.homeTeam.badgeUrl,
					primaryColor: f.homeTeam.primaryColor,
				},
				awayTeam: {
					id: f.awayTeam.id,
					name: f.awayTeam.name,
					shortName: f.awayTeam.shortName,
					badgeUrl: f.awayTeam.badgeUrl,
					primaryColor: f.awayTeam.primaryColor,
				},
			})),
		}))

	// Past picks & plans keyed by round number (for the "USED GW3" labels).
	const pastPicksForPlanner = playerPicks
		.filter((p) => p.roundId !== currentRoundId && p.round)
		.map((p) => ({ roundNumber: p.round.number, teamId: p.teamId }))
	// Treat the current-round pick as "used" in future planner views too.
	if (currentPickRow?.round) {
		pastPicksForPlanner.push({
			roundNumber: currentPickRow.round.number,
			teamId: currentPickRow.teamId,
		})
	}
	const plannedPicksForPlanner = playerPlans.map((p) => ({
		roundId: p.roundId,
		roundNumber: p.round.number,
		teamId: p.teamId,
		autoSubmit: p.autoSubmit,
	}))

	const futureRounds = buildPlannerRounds({
		futureRounds: futureRoundRows,
		pastPicks: pastPicksForPlanner,
		plannedPicks: plannedPicksForPlanner,
	})

	return { chain, futureRounds }
}
