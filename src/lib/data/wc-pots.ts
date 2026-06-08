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

/**
 * Maps a football-data.org canonical team name → the `name` we use in
 * WC_2026_POTS. Mirrors the `FPL_TO_FD_TLA` pattern in
 * `bootstrap-competitions.ts`: a small hand-maintained bridge for the cases
 * where our reference list and the data source disagree on a country's name.
 *
 * Key is the football-data name (lower-cased at lookup time), value is the
 * matching `WC_2026_POTS[].name`. `applyPotAssignments` consults this before
 * falling back to a direct name match, so a WC team whose football-data name
 * differs from our list still resolves to a pot.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ TODO(#65 — UNVERIFIED ASSUMPTIONS, Sean to confirm against live feed): │
 * │                                                                        │
 * │ Every entry below is an EDUCATED GUESS at football-data.org's          │
 * │ canonical WC team name. This branch was written WITHOUT live           │
 * │ football-data creds, so NONE of these strings have been checked        │
 * │ against an actual /competitions/WC/matches response. The #65 spike     │
 * │ dumps the real team names — reconcile this map against that dump and   │
 * │ delete / correct any entry that doesn't match. If football-data        │
 * │ actually returns the same name we already use, drop that entry         │
 * │ (the direct name match handles it).                                    │
 * │                                                                        │
 * │ Assumed aliases (football-data name → our WC_2026_POTS name):          │
 * │   'Korea Republic'            → 'South Korea'                          │
 * │   'Czech Republic'            → 'Czechia'                              │
 * │   'Türkiye' / 'Turkiye'       → 'Turkey'                               │
 * │   'Cape Verde'                → 'Cape Verde Islands'                   │
 * │   'DR Congo' / 'Congo DR'     → 'Congo DR'                             │
 * │   'Bosnia and Herzegovina' /                                           │
 * │     'Bosnia-Herzegovina'      → 'Bosnia-Herzegovina'                   │
 * │   'Curacao'                   → 'Curaçao' (ASCII fallback for the ç)   │
 * │   'Côte d'Ivoire' / 'Cote d'Ivoire' /                                │
 * │     'Ivory Coast'             → 'Ivory Coast'                          │
 * │   'USA' / 'United States of America' → 'United States'                │
 * │                                                                        │
 * │ Entries that map a name onto itself are defensive no-ops — harmless    │
 * │ if football-data already matches our list, but they keep the full set  │
 * │ of guessed spellings documented in one place for the #65 reconcile.    │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const FD_NAME_TO_WC_POT_NAME: Record<string, string> = {
	'korea republic': 'South Korea',
	'czech republic': 'Czechia',
	türkiye: 'Turkey',
	turkiye: 'Turkey',
	'cape verde': 'Cape Verde Islands',
	'dr congo': 'Congo DR',
	'congo dr': 'Congo DR',
	'bosnia and herzegovina': 'Bosnia-Herzegovina',
	'bosnia-herzegovina': 'Bosnia-Herzegovina',
	curacao: 'Curaçao',
	'ivory coast': 'Ivory Coast',
	"côte d'ivoire": 'Ivory Coast',
	"cote d'ivoire": 'Ivory Coast',
	usa: 'United States',
	'united states of america': 'United States',
}

export function getPotFor(footballDataId: string): FifaPot | null {
	if (!footballDataId) return null
	return WC_2026_POTS.find((t) => t.footballDataId === footballDataId)?.pot ?? null
}

/**
 * Resolve a football-data team name to a FIFA pot. Tries, in order:
 *   1. the alias map (football-data name → our reference name), then
 *   2. a direct case-insensitive match against WC_2026_POTS[].name.
 * Returns null when neither resolves — callers treat that as "untagged".
 */
export function potForTeamName(name: string): FifaPot | null {
	const aliased = FD_NAME_TO_WC_POT_NAME[name.toLowerCase()]
	const target = (aliased ?? name).toLowerCase()
	return WC_2026_POTS.find((t) => t.name.toLowerCase() === target)?.pot ?? null
}
