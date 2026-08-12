import type { FixtureOdds, FixtureTeamInfo } from '@/components/picks/fixture-row'

/**
 * The pick selector's Table view, derived.
 *
 * The Fixtures view is a list of *matches*; this is a list of *teams* — the
 * standings-style board a survivor player actually reasons in ("who's the safest
 * team still available to me?"). Both views read the same fixtures, so nothing
 * here queries: it's a pure re-shape of what `getClassicPickData` already loads,
 * which is what lets the gallery drive it from hand-built fixtures and lets the
 * sort/degradation rules be unit-tested on their own.
 */

/** A fixture as either pick view receives it. */
export interface PickTableFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoff?: string | Date | null
	odds?: FixtureOdds | null
}

/**
 * The round a team was spent in, in both of the forms a surface needs: the short
 * label a chip shows and the long one a screen reader announces. "GW3" is what a
 * player scanning a five-column board wants beside a team name; "Gameweek 3" is
 * what a reader hearing the row needs, since "GW" is not a word.
 */
export interface UsedRoundLabel {
	/** Short form, e.g. "GW3" / "MD1" / "R16". */
	label: string
	/** Long form, e.g. "Gameweek 3" / "Matchday 1" / "Round of 16". */
	longLabel: string
}

export type PickTableRowState =
	| { kind: 'available' }
	/** Classic: spent in an earlier round, named short and long. */
	| ({ kind: 'used' } & UsedRoundLabel)
	/** Unavailable for any other reason the mode imposes. */
	| { kind: 'restricted'; reason: string }
	/** Turbo: this team *is* the player's ranked call, at this confidence rank. */
	| { kind: 'ranked'; rank: number }
	/**
	 * Turbo: the fixture is already ranked, but on a different outcome — the
	 * opponent to win, or the draw, which `call` names. One prediction per
	 * fixture, so this row can't be added on top of it; it's marked rather than
	 * dropped so "Liverpool — you've already called this one for Chelsea" is
	 * readable from the board the player is comparing on.
	 */
	| { kind: 'fixture-ranked'; rank: number; call: string }

export interface PickTableRow {
	/** Stable across re-sorts: one row per (fixture, side). */
	id: string
	fixtureId: string
	team: FixtureTeamInfo
	opponent: FixtureTeamInfo
	/** Which side this team plays the fixture on — the H/A the row shows. */
	side: 'home' | 'away'
	kickoff: string | null
	/** De-vigged win chance, 0–1. Null for a fixture we hold no odds for. */
	winProbability: number | null
	/** Decimal win-price the probability came from. Null with the probability. */
	price: number | null
	/**
	 * The fixture's whole 1X2, carried for the form sheet a row taps through to —
	 * which shows the full home/draw/away market, not just this row's side. It
	 * comes down with the row for the same reason the fixture row's does: it's on
	 * screen the instant the sheet opens, form still loading or not.
	 */
	fixtureOdds: FixtureOdds | null
	state: PickTableRowState
	/** False for used / restricted rows: marked, listed, but not pickable. */
	pickable: boolean
}

/**
 * One entry in turbo's confidence set, as the table reads it: which fixture is
 * ranked, where, and which outcome the ranking calls. `teamId` is the team
 * backed to win, or null for a draw — the one prediction the board can't offer,
 * since a row is a team.
 */
export interface RankedFixtureCall {
	rank: number
	teamId: string | null
}

export interface BuildPickTableInput {
	fixtures: PickTableFixture[]
	/** teamId → the round it was spent in, as classic's pick data builds it. */
	usedTeamsByRound?: Record<string, UsedRoundLabel>
	/** teamId → why this team can't be picked (mode rules other than "used"). */
	restrictedTeams?: Record<string, string>
	/**
	 * Turbo: fixtureId → the confidence call already made on it. Both of the
	 * fixture's rows are marked from it — the backed team as `ranked`, the other
	 * side as `fixture-ranked`.
	 */
	rankedFixtures?: Record<string, RankedFixtureCall>
}

/**
 * One row per team the player could be looking at — both sides of every
 * fixture, including the ones they can't pick. A used or restricted team is
 * listed and marked rather than dropped: "Man City, used in GW3" is the answer
 * to the question the player is asking, and a team silently missing from the
 * board reads as a data gap.
 */
export function buildPickTableRows({
	fixtures,
	usedTeamsByRound = {},
	restrictedTeams = {},
	rankedFixtures = {},
}: BuildPickTableInput): PickTableRow[] {
	const rows: PickTableRow[] = []
	for (const fixture of fixtures) {
		for (const side of ['home', 'away'] as const) {
			const team = side === 'home' ? fixture.home : fixture.away
			const opponent = side === 'home' ? fixture.away : fixture.home
			const sideOdds = side === 'home' ? fixture.odds?.home : fixture.odds?.away
			// "Used" wins over "restricted" when a team is somehow both: it's the
			// more specific fact (it names the round) and the one classic owns.
			// Both outrank the ranking: a team the mode has blocked can't be in a
			// confidence set, and if it somehow is, the block is what needs saying.
			const usedRound = usedTeamsByRound[team.id]
			const restrictedReason = restrictedTeams[team.id]
			const ranked = rankedFixtures[fixture.id]
			const state: PickTableRowState = usedRound
				? { kind: 'used', ...usedRound }
				: restrictedReason
					? { kind: 'restricted', reason: restrictedReason }
					: ranked
						? ranked.teamId === team.id
							? { kind: 'ranked', rank: ranked.rank }
							: {
									kind: 'fixture-ranked',
									rank: ranked.rank,
									call: ranked.teamId === opponent.id ? opponent.shortName : 'Draw',
								}
						: { kind: 'available' }
			rows.push({
				id: `${fixture.id}:${side}`,
				fixtureId: fixture.id,
				team,
				opponent,
				side,
				kickoff: toIso(fixture.kickoff),
				winProbability: sideOdds?.probability ?? null,
				price: sideOdds?.price ?? null,
				fixtureOdds: fixture.odds ?? null,
				state,
				pickable: state.kind === 'available',
			})
		}
	}
	return rows
}

function toIso(value: string | Date | null | undefined): string | null {
	if (!value) return null
	return typeof value === 'string' ? value : value.toISOString()
}

/**
 * The board's sortable columns — a subset of what it *shows*.
 *
 * Only three, because the board is five columns wide on a phone and two of them
 * carry no order: form is three results (its "more is better" reading was points
 * from the last five, which the column no longer shows), and the next opponent
 * sorts alphabetically, which answers nothing a player asks.
 */
export type PickTableSortColumn = 'team' | 'position' | 'winProbability'

export interface PickTableSort {
	column: PickTableSortColumn
	direction: 'asc' | 'desc'
}

/**
 * Top of the table first. The board is a standings board, so it opens the way
 * the league does — the ordering the player already carries in their head, and
 * the one column that's there for every team whether the round is priced or not.
 * The market read is one tap away on the Win header.
 */
export const DEFAULT_PICK_TABLE_SORT: PickTableSort = {
	column: 'position',
	direction: 'asc',
}

/**
 * The direction a column sorts on its first tap: whichever end of it the player
 * is looking for. Safest-first for the win chance, top-of-the-table first for
 * position, A–Z for the name.
 */
const FIRST_DIRECTION: Record<PickTableSortColumn, 'asc' | 'desc'> = {
	team: 'asc',
	position: 'asc',
	winProbability: 'desc',
}

/** Tapping the sorted column flips it; tapping any other one starts it fresh. */
export function nextPickTableSort(
	current: PickTableSort,
	column: PickTableSortColumn,
): PickTableSort {
	if (current.column === column) {
		return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
	}
	return { column, direction: FIRST_DIRECTION[column] }
}

/**
 * The value a column sorts on, or null where this row has nothing to sort by —
 * an unpriced fixture, or a competition with no league table behind it.
 */
function sortValue(row: PickTableRow, column: PickTableSortColumn): number | string | null {
	switch (column) {
		case 'team':
			return row.team.name
		case 'position':
			return row.team.leaguePosition ?? null
		case 'winProbability':
			return row.winProbability
	}
}

/**
 * Sort, degrading rather than lying.
 *
 * Rows with nothing to sort by always sink to the bottom — in *both*
 * directions. Ascending win-probability must not float every unpriced fixture
 * above a 7% shot; a missing value is "we don't know", not zero. Ties (and the
 * sunk rows among themselves) fall back
 * to team name, so the order is total and a re-sort never shuffles equals.
 *
 * Pure and non-mutating: the caller keeps its own row array.
 *
 * Turbo's ranked rows are not lifted out of the sort: the board is sorted by the
 * column the player chose, and their confidence order is the list above it.
 * A ranked row stays where its numbers put it, marked with the rank it holds.
 */
export function sortPickTableRows(rows: PickTableRow[], sort: PickTableSort): PickTableRow[] {
	const factor = sort.direction === 'asc' ? 1 : -1
	return [...rows].sort((a, b) => {
		const av = sortValue(a, sort.column)
		const bv = sortValue(b, sort.column)
		if (av == null && bv == null) return byName(a, b)
		if (av == null) return 1
		if (bv == null) return -1
		const cmp =
			typeof av === 'string' && typeof bv === 'string'
				? av.localeCompare(bv)
				: Number(av) - Number(bv)
		return cmp === 0 ? byName(a, b) : cmp * factor
	})
}

function byName(a: PickTableRow, b: PickTableRow): number {
	return a.team.name.localeCompare(b.team.name) || a.side.localeCompare(b.side)
}

/**
 * Does this round have a league table behind it? The Table view's columns are
 * mostly standings columns, so with no standings anywhere it isn't a degraded
 * board — it's an empty one, and the toggle is hidden instead.
 *
 * One team with a position is enough: mid-season a promoted-then-expelled club
 * or a late-added row shouldn't hide the table for everyone else.
 */
export function pickTableHasStandings(rows: PickTableRow[]): boolean {
	return rows.some((r) => r.team.leaguePosition != null || r.team.standing?.played != null)
}

export type PickView = 'fixtures' | 'table'

/**
 * Which view a game opens on. A league is a table — the standings board is how
 * its players already think, and it's the view that answers "who's safe". A
 * knockout has no table to sort by (and its own rows would be mostly blank), so
 * it opens on the fixtures. Either way the player can toggle.
 */
export function defaultPickView(
	competitionType: 'league' | 'knockout' | 'group_knockout' | null | undefined,
	tableAvailable: boolean,
): PickView {
	if (!tableAvailable) return 'fixtures'
	return competitionType === 'league' ? 'table' : 'fixtures'
}
