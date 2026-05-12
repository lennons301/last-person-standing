export function wcRoundStage(roundNumber: number): 'group' | 'knockout' {
	return roundNumber <= 3 ? 'group' : 'knockout'
}

export interface WcFixture {
	id: string
	roundId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
	stage: 'group' | 'knockout'
}

export interface AlivePlayer {
	gamePlayerId: string
	usedTeamIds: string[]
}

export interface RemainingRound {
	id: string
	fixtures: WcFixture[]
}

export interface PickValidationInput {
	teamId: string
	roundFixtures: WcFixture[]
	finishedKnockoutFixtures: WcFixture[]
}

export type PickValidationResult =
	| { valid: true }
	| { valid: false; reason: 'team-not-in-round' | 'team-tournament-eliminated' }

export function isTeamTournamentEliminated(
	teamId: string,
	finishedKnockoutFixtures: WcFixture[],
): boolean {
	for (const f of finishedKnockoutFixtures) {
		if (f.stage !== 'knockout') continue
		if (f.status !== 'finished') continue
		if (f.homeScore == null || f.awayScore == null) continue
		if (f.homeScore === f.awayScore) continue // draws treated as not-eliminated
		const loserId = f.homeScore > f.awayScore ? f.awayTeamId : f.homeTeamId
		if (loserId === teamId) return true
	}
	return false
}

export function validateWcClassicPick(input: PickValidationInput): PickValidationResult {
	const teamIsInRound = input.roundFixtures.some(
		(f) => f.homeTeamId === input.teamId || f.awayTeamId === input.teamId,
	)
	if (!teamIsInRound) return { valid: false, reason: 'team-not-in-round' }
	if (isTeamTournamentEliminated(input.teamId, input.finishedKnockoutFixtures)) {
		return { valid: false, reason: 'team-tournament-eliminated' }
	}
	return { valid: true }
}

export interface AutoElimInput {
	alivePlayers: AlivePlayer[]
	remainingRounds: RemainingRound[]
	finishedKnockoutFixtures: WcFixture[]
}

export interface AutoElimResult {
	gamePlayerId: string
	reason: 'ran-out-of-teams'
}

export function computeWcClassicAutoElims(input: AutoElimInput): AutoElimResult[] {
	const eliminations: AutoElimResult[] = []
	for (const player of input.alivePlayers) {
		const used = new Set(player.usedTeamIds)
		const hasAnyValidOption = input.remainingRounds.some((round) =>
			round.fixtures.some((f) => {
				const candidates = [f.homeTeamId, f.awayTeamId]
				return candidates.some(
					(teamId) =>
						!used.has(teamId) &&
						!isTeamTournamentEliminated(teamId, input.finishedKnockoutFixtures),
				)
			}),
		)
		if (!hasAnyValidOption) {
			eliminations.push({
				gamePlayerId: player.gamePlayerId,
				reason: 'ran-out-of-teams',
			})
		}
	}
	return eliminations
}
