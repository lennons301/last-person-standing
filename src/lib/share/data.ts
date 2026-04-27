import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { CupStandingsData } from '@/lib/game/cup-standings-queries'
import { getCupStandingsData } from '@/lib/game/cup-standings-queries'
import { getProgressGridData, getTurboStandingsData } from '@/lib/game/detail-queries'
import { calculatePot } from '@/lib/game-logic/prizes'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

const STANDINGS_ALIVE_CAP = 20
const STANDINGS_ELIMINATED_CAP = 10

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
	_gameId: string,
	_viewerUserId: string,
): Promise<LiveShareData | null> {
	throw new Error('Implemented in Task 7')
}
export async function getShareWinnerData(
	_gameId: string,
	_viewerUserId: string,
): Promise<WinnerShareData | null> {
	throw new Error('Implemented in Task 11')
}
