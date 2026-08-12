import type { FixtureOdds, FixtureTeamInfo } from '@/components/picks/fixture-row'
import type { FormResult } from '@/components/picks/form-dots'

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

export type PickTableRowState =
	| { kind: 'available' }
	/** Classic: spent in an earlier round. `label` is that round. */
	| { kind: 'used'; label: string }
	/** Unavailable for any other reason the mode imposes. */
	| { kind: 'restricted'; reason: string }

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
	state: PickTableRowState
	/** False for used / restricted rows: marked, listed, but not pickable. */
	pickable: boolean
}

export interface BuildPickTableInput {
	fixtures: PickTableFixture[]
	/** teamId → round label, as classic's pick data builds it. */
	usedTeamsByRound?: Record<string, string>
	/** teamId → why this team can't be picked (mode rules other than "used"). */
	restrictedTeams?: Record<string, string>
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
}: BuildPickTableInput): PickTableRow[] {
	const rows: PickTableRow[] = []
	for (const fixture of fixtures) {
		for (const side of ['home', 'away'] as const) {
			const team = side === 'home' ? fixture.home : fixture.away
			const opponent = side === 'home' ? fixture.away : fixture.home
			const sideOdds = side === 'home' ? fixture.odds?.home : fixture.odds?.away
			// "Used" wins over "restricted" when a team is somehow both: it's the
			// more specific fact (it names the round) and the one classic owns.
			const usedLabel = usedTeamsByRound[team.id]
			const restrictedReason = restrictedTeams[team.id]
			const state: PickTableRowState = usedLabel
				? { kind: 'used', label: usedLabel }
				: restrictedReason
					? { kind: 'restricted', reason: restrictedReason }
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

export type PickTableSortColumn =
	| 'team'
	| 'position'
	| 'played'
	| 'points'
	| 'goalDifference'
	| 'form'
	| 'opponent'
	| 'winProbability'

export interface PickTableSort {
	column: PickTableSortColumn
	direction: 'asc' | 'desc'
}

/**
 * Safest-first. The whole point of the board is "who is most likely to win this
 * round", so it opens on the market's answer rather than on the league table's.
 */
export const DEFAULT_PICK_TABLE_SORT: PickTableSort = {
	column: 'winProbability',
	direction: 'desc',
}

/**
 * The direction a column sorts on its first tap: whichever end of it the player
 * is looking for. Best-first for the "more is better" columns, top-of-the-table
 * first for position, A–Z for the names.
 */
const FIRST_DIRECTION: Record<PickTableSortColumn, 'asc' | 'desc'> = {
	team: 'asc',
	position: 'asc',
	played: 'asc',
	points: 'desc',
	goalDifference: 'desc',
	form: 'desc',
	opponent: 'asc',
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

/** Points from the last five results — the only ordering "form" can carry. */
export function formPoints(form: FormResult[] | undefined | null): number | null {
	if (!form?.length) return null
	return form.reduce((total, r) => total + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
}

/**
 * The value a column sorts on, or null where this row has nothing to sort by —
 * an unpriced fixture, a team with no form yet, a competition with no table.
 */
function sortValue(row: PickTableRow, column: PickTableSortColumn): number | string | null {
	switch (column) {
		case 'team':
			return row.team.name
		case 'opponent':
			return row.opponent.name
		case 'position':
			return row.team.leaguePosition ?? null
		case 'played':
			return row.team.standing?.played ?? null
		case 'points':
			return row.team.standing?.points ?? null
		case 'goalDifference': {
			const { goalsFor, goalsAgainst } = row.team.standing ?? {}
			if (goalsFor == null || goalsAgainst == null) return null
			return goalsFor - goalsAgainst
		}
		case 'form':
			return formPoints(row.team.form)
		case 'winProbability':
			return row.winProbability
	}
}

/**
 * Sort, degrading rather than lying.
 *
 * Rows with nothing to sort by always sink to the bottom — in *both*
 * directions. Ascending win-probability must not float every unpriced fixture to
 * the top of a board whose whole promise is "safest first"; a missing value is
 * "we don't know", not zero. Ties (and the sunk rows among themselves) fall back
 * to team name, so the order is total and a re-sort never shuffles equals.
 *
 * Pure and non-mutating: the caller keeps its own row array.
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
