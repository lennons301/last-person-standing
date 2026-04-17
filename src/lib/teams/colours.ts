// Team colour mapping by short code.
// Used for badge backgrounds and contextual accents.
export const TEAM_COLOURS: Record<string, string> = {
	ARS: '#EF0107',
	AVL: '#670E36',
	BOU: '#DA291C',
	BRE: '#e30613',
	BHA: '#0057B8',
	CHE: '#034694',
	CRY: '#1B458F',
	EVE: '#003399',
	FUL: '#000000',
	IPS: '#3a64a3',
	LEI: '#003090',
	LIV: '#C8102E',
	MCI: '#6CABDD',
	MUN: '#DA291C',
	NEW: '#241F20',
	NFO: '#DD0000',
	SOU: '#D71920',
	TOT: '#132257',
	WHU: '#7A263A',
	WOL: '#FDB913',
}

export function getTeamColour(shortName: string): string {
	return TEAM_COLOURS[shortName.toUpperCase()] ?? '#6b6b6b'
}
