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
	/** Authoritative winner for ET/penalty results (level full-time score). */
	winner: 'home' | 'away' | null
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
		// Prefer the authoritative winner (covers ET/penalty results that are
		// level on score). Otherwise fall back to a decisive score. A level score
		// with no recorded winner is undecided → nobody eliminated.
		let loserId: string | null = null
		if (f.winner != null) {
			loserId = f.winner === 'home' ? f.awayTeamId : f.homeTeamId
		} else if (f.homeScore != null && f.awayScore != null && f.homeScore !== f.awayScore) {
			loserId = f.homeScore > f.awayScore ? f.awayTeamId : f.homeTeamId
		}
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
	// Defer auto-elimination while the remaining bracket is incomplete. A
	// remaining round with no fixtures is TBD — e.g. the World Cup knockout
	// rounds before the draw is known. Such a round may yet offer a valid team,
	// so no player can be said to have "run out of teams" while any remaining
	// round is unpublished. With no known remaining rounds at all (the true end
	// of the tournament), completion — not auto-elim — crowns the winner.
	//
	// Without this guard, the group→knockout boundary auto-eliminates EVERY
	// alive player ("ran-out-of-teams" against an empty fixture set) → a
	// mass-extinction mis-completion. Players who genuinely have no valid pick
	// are still caught by the normal no-pick elimination once the round opens.
	const bracketFullyPublished =
		input.remainingRounds.length > 0 && input.remainingRounds.every((r) => r.fixtures.length > 0)
	if (!bracketFullyPublished) return []

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
