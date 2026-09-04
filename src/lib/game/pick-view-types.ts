/**
 * The view types the pick surfaces produce and the pick components render.
 *
 * Declarations only — no logic, nothing to query. They live in `lib` rather
 * than beside the first component that happened to need them because the
 * dependency arrow runs one way: the read modules in `lib/game/read/` build
 * these shapes and the components in `src/components/picks/` render them
 * (#249). A `lib` module importing its own output type from a React component
 * was the arrow pointing backwards.
 */

/** One of a team's last results, as the form dots render them. */
export type FormResult = 'W' | 'D' | 'L'

/**
 * The rest of a team's row in the official table, beside the `leaguePosition`
 * the fixture row already shows. Only the Table view renders these, but they
 * hang off the team rather than off that view: they're the same sync's writes as
 * the position, and both pick views read one team shape.
 *
 * Every field is independently nullable — a competition with no standings at all
 * (a cup) carries none of them, and a league before its first round has a
 * position with nothing played.
 */
export interface TeamStandingLine {
	played?: number | null
	points?: number | null
	goalsFor?: number | null
	goalsAgainst?: number | null
}

/** One side of a fixture, as every pick surface hands it over. */
export interface FixtureTeamInfo {
	id: string
	name: string
	shortName: string
	badgeUrl?: string | null
	form?: FormResult[]
	leaguePosition?: number | null
	/** Played / points / goals, for the Table view. Absent where there's no table. */
	standing?: TeamStandingLine | null
}

/**
 * One side's indicative market read: the de-vigged win probability and the raw
 * decimal win-price it was derived from.
 */
export interface SideOdds {
	/** De-vigged implied probability, 0–1. */
	probability: number
	/** Decimal win-price as the bookmaker quoted it. */
	price: number
}

/**
 * A fixture's win-probability signal, sourced from bookmaker 1X2 prices (see
 * `src/lib/data/odds-api.ts`). Absent for any fixture or competition we have no
 * odds for — the row then shows no probability at all rather than a zero.
 *
 * The draw isn't *shown* on the row: its job is "how likely is each side to
 * win", which is exactly what a survivor pick turns on. It's carried all the
 * same, because the form sheet one tap below shows the full home/draw/away
 * market — and a market is either fully known or absent, never part-priced.
 */
export interface FixtureOdds {
	home: SideOdds
	draw: SideOdds
	away: SideOdds
	/** When the bookmaker last moved this market. Frozen at the round deadline. */
	asOf: string | Date
}

/**
 * A fixture as a pick surface hands it to either pick view — one shape for
 * classic and turbo, because both read the same fixtures and only differ in
 * what a tapped row does.
 */
export interface PickFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	/** ISO string: it crosses to a client component. */
	kickoff: string | null
	/** Indicative win-probabilities. Absent for fixtures we have no odds for. */
	odds?: FixtureOdds | null
}

/**
 * Cup's own fixture shape. Flat rather than the shared `PickFixture` because
 * cup sources neither form nor league position — a cup team's form lives in its
 * league — and carries a tier handicap instead.
 */
export interface CupPickFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeShort: string
	homeName: string
	homeColor: string | null
	homeBadgeUrl: string | null
	awayShort: string
	awayName: string
	awayColor: string | null
	awayBadgeUrl: string | null
	kickoff: Date | null
	/** From home perspective: positive = home is higher tier, negative = away is higher tier. */
	tierDifference: number
}

/** One of cup's confidence-ranked calls, as it crosses into and out of the form. */
export interface CupPickSlot {
	confidenceRank: number
	fixtureId: string
	pickedSide: 'home' | 'away'
}
