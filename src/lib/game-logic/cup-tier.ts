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
	return homePot - awayPot
}
