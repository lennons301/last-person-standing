/**
 * Competition-aware round labels.
 *
 * - 'league' (PL): GW{n} short, "Gameweek {n}" long.
 * - 'group_knockout' (WC): MD{n} for group stages (rounds 1-3), then R16,
 *   QF, SF, F for knockouts. Long form: "Matchday {n}", "Round of 16", etc.
 * - 'knockout' (single-elim cups): R{n} short, "Round {n}" long.
 */
export type CompetitionType = 'league' | 'knockout' | 'group_knockout'

export function roundLabel(competitionType: CompetitionType, roundNumber: number): string {
	if (competitionType === 'group_knockout') {
		if (roundNumber <= 3) return `MD${roundNumber}`
		if (roundNumber === 4) return 'R16'
		if (roundNumber === 5) return 'QF'
		if (roundNumber === 6) return 'SF'
		if (roundNumber === 7) return 'F'
		return `R${roundNumber}`
	}
	if (competitionType === 'knockout') {
		return `R${roundNumber}`
	}
	return `GW${roundNumber}`
}

export function roundLabelLong(competitionType: CompetitionType, roundNumber: number): string {
	if (competitionType === 'group_knockout') {
		if (roundNumber <= 3) return `Matchday ${roundNumber}`
		if (roundNumber === 4) return 'Round of 16'
		if (roundNumber === 5) return 'Quarter-final'
		if (roundNumber === 6) return 'Semi-final'
		if (roundNumber === 7) return 'Final'
		return `Round ${roundNumber}`
	}
	if (competitionType === 'knockout') {
		return `Round ${roundNumber}`
	}
	return `Gameweek ${roundNumber}`
}
