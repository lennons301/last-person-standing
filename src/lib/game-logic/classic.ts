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
}

export interface ClassicPlayerResult {
	gamePlayerId: string
	result: PickResult
	eliminated: boolean
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
			return { gamePlayerId: player.gamePlayerId, result: 'loss' as const, eliminated: true }
		}
		const result = determinePickResult({
			pickedTeamId: player.pickedTeamId,
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
		})
		return { gamePlayerId: player.gamePlayerId, result, eliminated: result !== 'win' }
	})

	return { results }
}
