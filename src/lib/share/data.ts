import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { CupStandingsData } from '@/lib/game/cup-standings-queries'
import { getCupStandingsData } from '@/lib/game/cup-standings-queries'
import { getProgressGridData, getTurboStandingsData } from '@/lib/game/detail-queries'
import { calculatePot } from '@/lib/game-logic/prizes'
import { user } from '@/lib/schema/auth'
import { game, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

const STANDINGS_ALIVE_CAP = 20
const STANDINGS_ELIMINATED_CAP = 10
const LIVE_CUP_TURBO_CAP = 16
const LIVE_CUP_TURBO_RECENT_ELIM = 4

export interface ShareHeader {
	gameName: string
	gameMode: 'classic' | 'cup' | 'turbo'
	competitionName: string
	pot: string // formatted "480.00"
	potTotal: string // raw numeric string for calculations
	generatedAt: Date
}

export interface ClassicPlayerRow {
	id: string
	userId: string
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber: number | null
}

export interface CupPlayerRow {
	id: string
	userId: string
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	livesRemaining: number
	streak: number
	goals: number
	eliminatedRoundNumber: number | null
}

export interface TurboPlayerRow {
	id: string
	userId: string
	name: string
	streak: number
	goals: number
}

// Standings types
export type StandingsShareData =
	| {
			mode: 'classic'
			header: ShareHeader
			classicGrid: NonNullable<
				Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getProgressGridData>>
			>
	  }
	| {
			mode: 'cup'
			header: ShareHeader
			cupData: CupStandingsData
			overflowCount: number
	  }
	| {
			mode: 'turbo'
			header: ShareHeader
			turboData: NonNullable<
				Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getTurboStandingsData>>
			>
			overflowCount: number
	  }

// Live types
export interface ClassicLiveRow {
	id: string
	userId: string
	name: string
	pickedTeamShort: string | null
	homeShort: string | null
	awayShort: string | null
	homeScore: number | null
	awayScore: number | null
	fixtureStatus: 'scheduled' | 'live' | 'halftime' | 'finished'
	liveState: 'winning' | 'drawing' | 'losing' | 'pending'
}

export type LiveShareData =
	| {
			mode: 'classic'
			header: ShareHeader
			rows: ClassicLiveRow[]
			roundNumber: number
	  }
	| {
			mode: 'cup'
			header: ShareHeader
			cupData: CupStandingsData
			roundNumber: number
			overflowCount: number
			matchupsLegend: string
	  }
	| {
			mode: 'turbo'
			header: ShareHeader
			turboData: NonNullable<
				Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getTurboStandingsData>>
			>
			roundNumber: number
			overflowCount: number
			matchupsLegend: string
	  }

// Winner types
export interface WinnerEntry {
	userId: string
	name: string
	potShare: string // "160.00"
	classicMeta?: { roundsSurvived: number; finalPickLabel: string }
	cupMeta?: { livesRemaining: number; streak: number; goals: number }
	turboMeta?: { streak: number; goals: number }
}

export interface ClassicRunnerUp {
	userId: string
	name: string
	eliminatedRoundNumber: number
}

export interface CupRunnerUp {
	userId: string
	name: string
	livesRemaining: number
	streak: number
	goals: number
	eliminatedRoundNumber: number | null
}

export interface TurboRunnerUp {
	userId: string
	name: string
	streak: number
	goals: number
}

export type WinnerShareData =
	| {
			mode: 'classic'
			header: ShareHeader
			winners: WinnerEntry[]
			runnersUp: ClassicRunnerUp[]
			overflowCount: number
	  }
	| {
			mode: 'cup'
			header: ShareHeader
			winners: WinnerEntry[]
			runnersUp: CupRunnerUp[]
			overflowCount: number
	  }
	| {
			mode: 'turbo'
			header: ShareHeader
			winners: WinnerEntry[]
			runnersUp: TurboRunnerUp[]
			overflowCount: number
	  }

async function buildHeader(gameId: string): Promise<ShareHeader | null> {
	const gameRow = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { competition: true },
	})
	if (!gameRow) return null
	const payments = await db.query.payment.findMany({
		where: eq(payment.gameId, gameId),
	})
	const pot = calculatePot(payments)
	return {
		gameName: gameRow.name,
		gameMode: gameRow.gameMode as 'classic' | 'cup' | 'turbo',
		competitionName: gameRow.competition.name,
		pot: pot.total,
		potTotal: pot.total,
		generatedAt: new Date(),
	}
}

export async function getShareStandingsData(
	gameId: string,
	viewerUserId: string,
): Promise<StandingsShareData | null> {
	const header = await buildHeader(gameId)
	if (!header) return null

	if (header.gameMode === 'classic') {
		const grid = await getProgressGridData(gameId, viewerUserId, { hideAllCurrentPicks: true })
		if (!grid) return null
		return { mode: 'classic', header, classicGrid: grid }
	}
	if (header.gameMode === 'cup') {
		const cupData = await getCupStandingsData(gameId, viewerUserId)
		if (!cupData) return null
		const totalPlayers = cupData.players.length
		const overflowCount = Math.max(
			0,
			totalPlayers - (STANDINGS_ALIVE_CAP + STANDINGS_ELIMINATED_CAP),
		)
		return { mode: 'cup', header, cupData, overflowCount }
	}
	// turbo
	const turboData = await getTurboStandingsData(gameId, viewerUserId)
	if (!turboData) return null
	const totalPlayers = turboData.rounds[0]?.players.length ?? 0
	const overflowCount = Math.max(0, totalPlayers - (STANDINGS_ALIVE_CAP + STANDINGS_ELIMINATED_CAP))
	return { mode: 'turbo', header, turboData, overflowCount }
}
export async function getShareLiveData(
	gameId: string,
	viewerUserId: string,
): Promise<LiveShareData | null> {
	const header = await buildHeader(gameId)
	if (!header) return null

	const gameRow = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: {
				with: {
					rounds: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
				},
			},
			players: true,
		},
	})
	if (!gameRow || !gameRow.currentRoundId) return null
	const currentRound = gameRow.competition.rounds.find((r) => r.id === gameRow.currentRoundId)
	if (!currentRound) return null

	if (header.gameMode === 'classic') {
		const allPicks = await db.query.pick.findMany({
			where: and(eq(pick.gameId, gameId), eq(pick.roundId, currentRound.id)),
			with: { team: true, fixture: { with: { homeTeam: true, awayTeam: true } } },
		})
		const userIds = gameRow.players.map((p) => p.userId)
		const userRows = userIds.length
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, userIds))
			: []
		const userNames = new Map(userRows.map((u) => [u.id, u.name]))

		const rows: ClassicLiveRow[] = gameRow.players
			.filter((p) => p.status === 'alive')
			.map((p) => {
				const pk = allPicks.find((pp) => pp.gamePlayerId === p.id)
				const fx = pk?.fixture
				const homeScore = fx?.homeScore ?? null
				const awayScore = fx?.awayScore ?? null
				const fixtureStatus = (fx?.status ?? 'scheduled') as ClassicLiveRow['fixtureStatus']
				const pickedHome = pk && fx ? pk.teamId === fx.homeTeamId : false
				let liveState: ClassicLiveRow['liveState'] = 'pending'
				if (
					fixtureStatus === 'live' ||
					fixtureStatus === 'halftime' ||
					fixtureStatus === 'finished'
				) {
					if (homeScore != null && awayScore != null) {
						if (pickedHome) {
							liveState =
								homeScore > awayScore ? 'winning' : homeScore === awayScore ? 'drawing' : 'losing'
						} else {
							liveState =
								awayScore > homeScore ? 'winning' : awayScore === homeScore ? 'drawing' : 'losing'
						}
					}
				}
				return {
					id: p.id,
					userId: p.userId,
					name: userNames.get(p.userId) ?? 'Unknown',
					pickedTeamShort: pk?.team?.shortName ?? null,
					homeShort: fx?.homeTeam?.shortName ?? null,
					awayShort: fx?.awayTeam?.shortName ?? null,
					homeScore,
					awayScore,
					fixtureStatus,
					liveState,
				}
			})
			.sort((a, b) => {
				const order = { winning: 0, drawing: 1, losing: 2, pending: 3 } as const
				return order[a.liveState] - order[b.liveState] || a.name.localeCompare(b.name)
			})
		return { mode: 'classic', header, rows, roundNumber: currentRound.number }
	}

	if (header.gameMode === 'cup') {
		const cupData = await getCupStandingsData(gameId, viewerUserId)
		if (!cupData) return null
		const matchupsLegend = currentRound.fixtures
			.map((f) => `${f.homeTeam?.shortName ?? '?'} v ${f.awayTeam?.shortName ?? '?'}`)
			.join(' · ')
		const total = cupData.players.length
		const overflow = Math.max(0, total - (LIVE_CUP_TURBO_CAP + LIVE_CUP_TURBO_RECENT_ELIM))
		return {
			mode: 'cup',
			header,
			cupData,
			roundNumber: currentRound.number,
			overflowCount: overflow,
			matchupsLegend,
		}
	}

	// turbo
	const turboData = await getTurboStandingsData(gameId, viewerUserId)
	if (!turboData) return null
	const matchupsLegend = currentRound.fixtures
		.map((f) => `${f.homeTeam?.shortName ?? '?'} v ${f.awayTeam?.shortName ?? '?'}`)
		.join(' · ')
	const totalTurbo = turboData.rounds[turboData.rounds.length - 1]?.players.length ?? 0
	const overflow = Math.max(0, totalTurbo - (LIVE_CUP_TURBO_CAP + LIVE_CUP_TURBO_RECENT_ELIM))
	return {
		mode: 'turbo',
		header,
		turboData,
		roundNumber: currentRound.number,
		overflowCount: overflow,
		matchupsLegend,
	}
}
export async function getShareWinnerData(
	_gameId: string,
	_viewerUserId: string,
): Promise<WinnerShareData | null> {
	throw new Error('Implemented in Task 11')
}
