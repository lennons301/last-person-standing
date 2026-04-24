export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'halftime'

export type PickResultState =
	| 'win'
	| 'loss'
	| 'draw'
	| 'saved_by_life'
	| 'hidden'
	| 'restricted'
	| 'pending'

export interface LiveFixture {
	id: string
	kickoff: Date | string | null
	homeScore: number | null
	awayScore: number | null
	status: FixtureStatus
	homeShort: string
	awayShort: string
}

export interface LivePick {
	gamePlayerId: string
	fixtureId: string | null
	teamId: string | null
	confidenceRank: number | null
	predictedResult: 'home_win' | 'away_win' | 'draw' | null
	result: PickResultState | null
}

export interface LivePlayer {
	id: string
	userId: string
	status: 'active' | 'eliminated'
	livesRemaining: number
}

export interface LivePayload {
	gameId: string
	gameMode: 'classic' | 'turbo' | 'cup'
	roundId: string | null
	fixtures: LiveFixture[]
	picks: LivePick[]
	players: LivePlayer[]
	viewerUserId: string
	updatedAt: string
}

export interface GoalEvent {
	id: string
	fixtureId: string
	side: 'home' | 'away'
	newScore: number
	previousScore: number
	observedAt: number
}

export interface PickSettlementEvent {
	id: string
	gamePlayerId: string
	roundId: string
	result: 'settled-win' | 'settled-loss' | 'saved-by-life'
	observedAt: number
}
