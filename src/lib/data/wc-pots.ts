export type FifaPot = 1 | 2 | 3 | 4

export interface WcTeamPot {
	footballDataId: string // matches adapter externalId for WC
	name: string
	pot: FifaPot
	tbd?: boolean
}

// Populated from the FIFA World Cup 2026 final draw held on 5 December 2025
// at the John F. Kennedy Center for the Performing Arts, Washington, D.C.
// Cross-referenced against Al Jazeera and NBC Sports coverage of the draw.
//
// footballDataId values should eventually come from football-data.org's
// /competitions/WC/teams endpoint after the first daily sync runs. Until
// that lookup has been performed they are intentionally left blank so the
// helpers below degrade gracefully (potForTeamName still works by name).
//
// TODO: populate footballDataId for every entry from football-data.org
// /competitions/WC/teams once the first daily sync has run. Until then,
// getPotFor() will not match any team and consumers should fall back to
// potForTeamName().
export const WC_2026_POTS: WcTeamPot[] = [
	// Pot 1 — three co-hosts plus nine highest-ranked qualifiers
	// (FIFA/Coca-Cola Men's World Ranking issued 19 November 2025).
	{ footballDataId: '', name: 'Canada', pot: 1 },
	{ footballDataId: '', name: 'Mexico', pot: 1 },
	{ footballDataId: '', name: 'United States', pot: 1 },
	{ footballDataId: '', name: 'Spain', pot: 1 },
	{ footballDataId: '', name: 'Argentina', pot: 1 },
	{ footballDataId: '', name: 'France', pot: 1 },
	{ footballDataId: '', name: 'England', pot: 1 },
	{ footballDataId: '', name: 'Brazil', pot: 1 },
	{ footballDataId: '', name: 'Portugal', pot: 1 },
	{ footballDataId: '', name: 'Netherlands', pot: 1 },
	{ footballDataId: '', name: 'Belgium', pot: 1 },
	{ footballDataId: '', name: 'Germany', pot: 1 },

	// Pot 2
	{ footballDataId: '', name: 'Croatia', pot: 2 },
	{ footballDataId: '', name: 'Morocco', pot: 2 },
	{ footballDataId: '', name: 'Colombia', pot: 2 },
	{ footballDataId: '', name: 'Uruguay', pot: 2 },
	{ footballDataId: '', name: 'Switzerland', pot: 2 },
	{ footballDataId: '', name: 'Japan', pot: 2 },
	{ footballDataId: '', name: 'Senegal', pot: 2 },
	{ footballDataId: '', name: 'Iran', pot: 2 },
	{ footballDataId: '', name: 'South Korea', pot: 2 },
	{ footballDataId: '', name: 'Ecuador', pot: 2 },
	{ footballDataId: '', name: 'Austria', pot: 2 },
	{ footballDataId: '', name: 'Australia', pot: 2 },

	// Pot 3
	{ footballDataId: '', name: 'Norway', pot: 3 },
	{ footballDataId: '', name: 'Panama', pot: 3 },
	{ footballDataId: '', name: 'Egypt', pot: 3 },
	{ footballDataId: '', name: 'Algeria', pot: 3 },
	{ footballDataId: '', name: 'Scotland', pot: 3 },
	{ footballDataId: '', name: 'Paraguay', pot: 3 },
	{ footballDataId: '', name: 'Tunisia', pot: 3 },
	{ footballDataId: '', name: 'Ivory Coast', pot: 3 },
	{ footballDataId: '', name: 'Uzbekistan', pot: 3 },
	{ footballDataId: '', name: 'Qatar', pot: 3 },
	{ footballDataId: '', name: 'Saudi Arabia', pot: 3 },
	{ footballDataId: '', name: 'South Africa', pot: 3 },

	// Pot 4 — six confirmed qualifiers plus six playoff-winner placeholders.
	// European playoff paths A-D and the two intercontinental playoff winners
	// resolve in March 2026; they are marked tbd until the draw is updated.
	{ footballDataId: '', name: 'Jordan', pot: 4 },
	{ footballDataId: '', name: 'Cape Verde', pot: 4 },
	{ footballDataId: '', name: 'Ghana', pot: 4 },
	{ footballDataId: '', name: 'Curaçao', pot: 4 },
	{ footballDataId: '', name: 'Haiti', pot: 4 },
	{ footballDataId: '', name: 'New Zealand', pot: 4 },
	{ footballDataId: '', name: 'European Playoff Winner A', pot: 4, tbd: true },
	{ footballDataId: '', name: 'European Playoff Winner B', pot: 4, tbd: true },
	{ footballDataId: '', name: 'European Playoff Winner C', pot: 4, tbd: true },
	{ footballDataId: '', name: 'European Playoff Winner D', pot: 4, tbd: true },
	{ footballDataId: '', name: 'Intercontinental Playoff Winner 1', pot: 4, tbd: true },
	{ footballDataId: '', name: 'Intercontinental Playoff Winner 2', pot: 4, tbd: true },
]

export function getPotFor(footballDataId: string): FifaPot | null {
	if (!footballDataId) return null
	return WC_2026_POTS.find((t) => t.footballDataId === footballDataId)?.pot ?? null
}

export function potForTeamName(name: string): FifaPot | null {
	return WC_2026_POTS.find((t) => t.name.toLowerCase() === name.toLowerCase())?.pot ?? null
}
