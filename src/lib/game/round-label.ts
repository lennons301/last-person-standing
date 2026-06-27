/**
 * Competition-aware round labels.
 *
 * - 'league' (PL): GW{n} short, "Gameweek {n}" long.
 * - 'group_knockout' (WC 2026): MD{n} for the group stage (rounds 1-3), then
 *   the 48-team knockout bracket — Round of 32, Round of 16, QF, SF, Final
 *   (rounds 4-8). Must match the rounds seeded from football-data's `stage`
 *   field (KO_STAGE_ORDER in football-data.ts: LAST_32→4 … FINAL→8) and those
 *   rounds' DB `name`s. The WC 2026 format has 48 teams, so the first knockout
 *   round is the Round of 32 — NOT the Round of 16 (the pre-2026 32-team shape).
 * - 'knockout' (single-elim cups): R{n} short, "Round {n}" long.
 */
export type CompetitionType = 'league' | 'knockout' | 'group_knockout'

export function roundLabel(competitionType: CompetitionType, roundNumber: number): string {
	if (competitionType === 'group_knockout') {
		if (roundNumber <= 3) return `MD${roundNumber}`
		if (roundNumber === 4) return 'R32'
		if (roundNumber === 5) return 'R16'
		if (roundNumber === 6) return 'QF'
		if (roundNumber === 7) return 'SF'
		if (roundNumber === 8) return 'F'
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
		if (roundNumber === 4) return 'Round of 32'
		if (roundNumber === 5) return 'Round of 16'
		if (roundNumber === 6) return 'Quarter-finals'
		if (roundNumber === 7) return 'Semi-finals'
		if (roundNumber === 8) return 'Final'
		return `Round ${roundNumber}`
	}
	if (competitionType === 'knockout') {
		return `Round ${roundNumber}`
	}
	return `Gameweek ${roundNumber}`
}
