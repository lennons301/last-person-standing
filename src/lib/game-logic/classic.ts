import { determinePickResult, type PickResult } from './common'

export interface ClassicPlayerPick {
	gamePlayerId: string
	pickedTeamId: string
	/**
	 * The specific fixture the player picked. Required when a team has more
	 * than one fixture in a round (e.g. PL rearrangements). When multiple
	 * fixtures exist for the picked team and pickedFixtureId is null, falls
	 * back to the first matching fixture in the input array — which is now
	 * deterministic (kickoff-ordered) but legacy data may not have a stored
	 * fixtureId, hence the defensive fallback.
	 */
	pickedFixtureId?: string | null
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
	// Index by fixture id (unique) for explicit-fixture lookups.
	const fixturesById = new Map<string, ClassicFixture>()
	for (const f of input.fixtures) {
		fixturesById.set(f.id, f)
	}

	function resolveFixture(player: ClassicPlayerPick): ClassicFixture | undefined {
		// Explicit fixtureId wins. This is the path for any pick made post-fix.
		if (player.pickedFixtureId) {
			const explicit = fixturesById.get(player.pickedFixtureId)
			if (explicit) return explicit
		}
		// Fallback for legacy picks (no fixtureId stored). Walk the input array
		// in order, return the first fixture featuring the team. Caller controls
		// the order — production callers sort by kickoff so this is deterministic.
		return input.fixtures.find(
			(f) => f.homeTeamId === player.pickedTeamId || f.awayTeamId === player.pickedTeamId,
		)
	}

	const results: ClassicPlayerResult[] = input.players.map((player) => {
		const fixture = resolveFixture(player)
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
