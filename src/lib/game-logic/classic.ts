import { determinePickResult, type PickResult } from './common'

export interface ClassicPlayerPick {
	gamePlayerId: string
	pickedTeamId: string
}

export interface ClassicFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number
	awayScore: number
}

export interface ClassicRoundInput {
	players: ClassicPlayerPick[]
	fixtures: ClassicFixture[]
	isStartingRound?: boolean
}

export interface ClassicPlayerResult {
	gamePlayerId: string
	result: PickResult
	eliminated: boolean
	goalsScored: number
}

export interface ClassicRoundOutput {
	results: ClassicPlayerResult[]
}

export function processClassicRound(input: ClassicRoundInput): ClassicRoundOutput {
	const fixturesByTeam = new Map<string, ClassicFixture>()
	for (const f of input.fixtures) {
		fixturesByTeam.set(f.homeTeamId, f)
		fixturesByTeam.set(f.awayTeamId, f)
	}

	const results: ClassicPlayerResult[] = input.players.map((player) => {
		const fixture = fixturesByTeam.get(player.pickedTeamId)
		if (!fixture) {
			return {
				gamePlayerId: player.gamePlayerId,
				result: 'loss' as const,
				eliminated: true,
				goalsScored: 0,
			}
		}
		const result = determinePickResult({
			pickedTeamId: player.pickedTeamId,
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
		})
		const pickedHome = player.pickedTeamId === fixture.homeTeamId
		const goalsScored = result === 'win' ? (pickedHome ? fixture.homeScore : fixture.awayScore) : 0
		return {
			gamePlayerId: player.gamePlayerId,
			result,
			eliminated: result !== 'win' && !input.isStartingRound,
			goalsScored,
		}
	})

	return { results }
}
