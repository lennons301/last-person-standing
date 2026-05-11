export type FifaPot = 1 | 2 | 3 | 4

export interface WcTeamPot {
	footballDataId: string // matches adapter externalId for WC
	name: string
	pot: FifaPot
	tbd?: boolean
}

// Populated from the FIFA World Cup 2026 final draw held on 5 December 2025
// at the John F. Kennedy Center for the Performing Arts, Washington, D.C.,
// updated for European + Intercontinental playoff winners (March 2026).
//
// Team names must match what football-data.org returns from /competitions/WC.
// `applyPotAssignments` matches by lower-cased name and writes `fifa_pot`
// into the team's `external_ids` JSONB; cup-tier maths reads it from there.
//
// This is a hand-maintained reference dataset on a 4-year cycle. No public
// API exposes FIFA pot/seeding data — football-data carries only id/name/
// tla/crest. The pots are fixed for the duration of WC 2026 once the
// playoffs resolved in March 2026.
//
// `footballDataId` is currently unused in match logic but kept on the type
// so a future bootstrap pass can backfill IDs if desired.
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

	// Pot 4 — six direct qualifiers + four European playoff winners + two
	// intercontinental playoff winners (all resolved March 2026).
	{ footballDataId: '', name: 'Jordan', pot: 4 },
	{ footballDataId: '', name: 'Cape Verde Islands', pot: 4 },
	{ footballDataId: '', name: 'Ghana', pot: 4 },
	{ footballDataId: '', name: 'Curaçao', pot: 4 },
	{ footballDataId: '', name: 'Haiti', pot: 4 },
	{ footballDataId: '', name: 'New Zealand', pot: 4 },
	// European playoff winners (March 2026)
	{ footballDataId: '', name: 'Bosnia-Herzegovina', pot: 4 },
	{ footballDataId: '', name: 'Czechia', pot: 4 },
	{ footballDataId: '', name: 'Sweden', pot: 4 },
	{ footballDataId: '', name: 'Turkey', pot: 4 },
	// Intercontinental playoff winners (March 2026)
	{ footballDataId: '', name: 'Congo DR', pot: 4 },
	{ footballDataId: '', name: 'Iraq', pot: 4 },
]

export function getPotFor(footballDataId: string): FifaPot | null {
	if (!footballDataId) return null
	return WC_2026_POTS.find((t) => t.footballDataId === footballDataId)?.pot ?? null
}

export function potForTeamName(name: string): FifaPot | null {
	return WC_2026_POTS.find((t) => t.name.toLowerCase() === name.toLowerCase())?.pot ?? null
}
