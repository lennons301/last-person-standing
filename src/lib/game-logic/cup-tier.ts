type TeamWithExternalIds = {
	externalIds: Record<string, string | number> | null | undefined
}

export function computeTierDifference(
	home: TeamWithExternalIds,
	away: TeamWithExternalIds,
	competitionType: 'league' | 'knockout' | 'group_knockout',
): number {
	if (competitionType !== 'group_knockout') return 0
	const homePot = Number(home.externalIds?.fifa_pot)
	const awayPot = Number(away.externalIds?.fifa_pot)
	if (!Number.isFinite(homePot) || !Number.isFinite(awayPot)) return 0
	// FIFA pots are inverted: pot 1 is strongest, pot 4 is weakest. cup.ts
	// expects `tierDifference > 0` when home is the stronger side (higher
	// tier), so flip the subtraction: a low-pot home vs high-pot away
	// (e.g. Spain pot 1 vs Cape Verde pot 4) yields +3, meaning home is
	// 3 tiers stronger.
	return awayPot - homePot
}
