'use client'

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'
import {
	DEFAULT_PICK_TABLE_SORT,
	nextPickTableSort,
	type PickTableRow,
	type PickTableSort,
	type PickTableSortColumn,
	sortPickTableRows,
} from '@/lib/game/pick-table-view'
import { cn } from '@/lib/utils'
import type { FixtureTeamInfo, RowFormSheetRenderer } from './fixture-row'
import { FormDots } from './form-dots'
import { TeamBadge } from './team-badge'
import type { FormMarket } from './team-form-panel'
import { TeamFormSheet } from './team-form-sheet'
import { CHIP, TYPE } from './type-scale'

/**
 * The Table view: one row per team the player could pick, as a standings board.
 *
 * Where the Fixtures view answers "what's on this weekend", this answers "which
 * of my remaining teams is most likely to win" — so it opens the way the league
 * table does and lets the two columns that re-ask the question (team, win
 * chance) re-sort it.
 *
 * Two modes, one board. `onSelect` is classic's: a row selects its team and the
 * confirm bar below commits it — a tap never writes. `ranking` is turbo's: the
 * last column adds the team to the confidence set and carries the controls for
 * its place in it. Same columns, same sorting, same degradation.
 *
 * Everything it renders comes off `PickTableRow`; the sort lives here because
 * it's a view preference, and the ordering itself is `sortPickTableRows`, which
 * is where the degradation rules are tested.
 *
 * Width: five columns, no horizontal scroll and no pinned column — the board
 * fits a 360px phone. That's what played, points and goals came out for: goals
 * stay reachable in the form sheet's home/away split, one tap from the form
 * cell. The win column keeps its decimal price at every width (the price is what
 * explains the percentage) by stacking it under the percentage on a phone rather
 * than dropping it. How the width is *divided* is declared, not discovered — see
 * `COLUMNS`.
 */

/**
 * The board as a *ranking* surface, which is what turbo needs of it: a tap adds
 * the team to the confidence set instead of selecting the round's one pick, and
 * the rows already in that set carry its controls.
 *
 * Passing this adds the rank column. Everything else — every column, every sort,
 * every degradation rule — is the same board classic reads.
 */
export interface PickTableRanking {
	/** How many are ranked, and how many the round wants. Labels the add button. */
	count: number
	target: number
	/** Add this row's team to the confidence set, at the end of it. */
	onAdd: (row: PickTableRow) => void
	/** Move this row's ranked call up or down one place. */
	onMove: (row: PickTableRow, direction: 'up' | 'down') => void
	/** Drop this row's ranked call out of the set. */
	onRemove: (row: PickTableRow) => void
}

/**
 * `RowFormSheetRenderer` plus the fixture the row belongs to — the one thing a
 * board row knows that a fixture row's renderer is handed for free. Turbo keys
 * its renderer on the fixture, so without it the mode would have to re-derive
 * the fixture from the two team ids.
 *
 * A plain `RowFormSheetRenderer` (which is what classic and the gallery already
 * have) is assignable to this: it simply ignores the extra field.
 */
export type PickTableFormSheetRenderer = (
	args: Parameters<RowFormSheetRenderer>[0] & { fixtureId: string },
) => React.ReactNode

interface PickTableProps {
	rows: PickTableRow[]
	/** The team currently picked for this round, if any. Marked, not re-selectable. */
	currentTeamId?: string | null
	/**
	 * The row the player has selected, by `PickTableRow.id`. Marked here; the
	 * confirm bar below the board is what commits it.
	 */
	selectedRowId?: string | null
	/**
	 * Select this row's team. Tapping anywhere on the row that isn't the form
	 * calls this — the same select-then-confirm contract the Fixtures view uses,
	 * so a single tap can never commit a pick from either view.
	 */
	onSelect?: (row: PickTableRow) => void
	/**
	 * Turbo's ranking handlers. Mutually exclusive with `onSelect` in practice: a
	 * mode either selects one team from the board or builds a ranking on it.
	 */
	ranking?: PickTableRanking
	/** Post-deadline / read-only: the board still reads, nothing commits. */
	readonly?: boolean
	initialSort?: PickTableSort
	// Required for the form-detail sheet the form cell taps through to. Without
	// either, the form cell is not tappable and carries no chevron.
	competitionId?: string
	roundNumber?: number
	/**
	 * Overrides how the form sheet is rendered, for callers that can't reach the
	 * database-backed server action the default path uses (`/preview/picks`).
	 * Supplying it makes the form cell tappable even without a `competitionId`.
	 */
	renderFormSheet?: PickTableFormSheetRenderer
}

interface ColumnSpec {
	/** The column's sort, or null where the column carries no useful order. */
	key: PickTableSortColumn | null
	/** Short header, for the narrow columns. */
	label: string
	/** Spelled out for screen readers, where "#" is not a word. */
	longLabel: string
	align: 'left' | 'right'
	/** Declared share of the five-column board. See `COLUMNS`. */
	width: string
	/** Declared share once turbo's rank column is on the board too. */
	rankingWidth: string
}

/**
 * The columns, and the share of the board each one is *given* rather than takes.
 *
 * Left to size themselves the columns are sized by their widest content, and the
 * team column — the widest of them, because of the used-team chip that sits
 * under a name — then absorbs whatever width is left over. A spent team
 * therefore opened a gap between its chip and the right-aligned league position
 * while form and the win chance were squeezed into their minimums. Declaring the
 * shares makes the board's proportions a decision: the team column gets a name
 * and a chip and no more (a longer name truncates rather than widening it), and
 * what that frees goes to the two columns the player is actually reading.
 *
 * Each column carries two of them, because the `sm` breakpoint changes what a
 * team cell holds — the three-letter short name below it, the club's full name
 * above — and a third pair for the board turbo puts a rank column on.
 *
 * The shares are declared on `<col>` under *automatic* layout, deliberately: a
 * column whose content genuinely can't shrink to its share (turbo's rank
 * controls are three icon buttons, a pixel measurement) still takes the width it
 * needs, so the board degrades the way it does today instead of spilling its
 * cells. What the declaration buys is the other direction — no column is handed
 * width it hasn't asked for.
 */
const COLUMNS: ColumnSpec[] = [
	{
		key: 'team',
		label: 'Team',
		longLabel: 'Team',
		align: 'left',
		width: 'w-[34%] sm:w-[40%]',
		rankingWidth: 'w-[27%] sm:w-[33%]',
	},
	{
		key: 'position',
		label: '#',
		longLabel: 'League position',
		align: 'right',
		width: 'w-[9%] sm:w-[7%]',
		rankingWidth: 'w-[8%] sm:w-[6%]',
	},
	{
		key: null,
		label: 'Form',
		longLabel: 'Recent form',
		align: 'left',
		width: 'w-[24%] sm:w-[20%]',
		rankingWidth: 'w-[20%] sm:w-[17%]',
	},
	{
		key: null,
		label: 'Next',
		longLabel: 'Next opponent',
		align: 'left',
		width: 'w-[17%] sm:w-[16%]',
		rankingWidth: 'w-[14%]',
	},
	{
		key: 'winProbability',
		label: 'Win',
		longLabel: 'Win probability',
		align: 'right',
		width: 'w-[16%] sm:w-[17%]',
		rankingWidth: 'w-[14%]',
	},
]

/** Turbo's rank column, which has no header content to spec. See `COLUMNS`. */
const RANK_COLUMN_WIDTH = 'w-[17%] sm:w-[16%]'

/**
 * How many of a team's results the form cell shows. Six fitted a board that
 * scrolled sideways; three fit a phone, and the sheet one tap away carries the
 * rest. The array is most-recent-first, so this is the front of it.
 */
const FORM_RESULTS_SHOWN = 3

/** Narrow cells buy their width back from the padding; the team cell doesn't. */
const CELL = 'px-1.5 py-2 sm:px-2'

export function PickTable({
	rows,
	currentTeamId,
	selectedRowId,
	onSelect,
	ranking,
	readonly = false,
	initialSort = DEFAULT_PICK_TABLE_SORT,
	competitionId,
	roundNumber,
	renderFormSheet,
}: PickTableProps) {
	const [sort, setSort] = useState<PickTableSort>(initialSort)
	const [sheetRowId, setSheetRowId] = useState<string | null>(null)
	// Retain the last opened row so the sheet keeps its team through the dismiss
	// animation instead of emptying the moment the close starts.
	const lastSheetRowId = useRef<string | null>(null)
	const sorted = sortPickTableRows(rows, sort)
	const sheetEnabled = !!competitionId || !!renderFormSheet
	const selectable = !!onSelect && !readonly

	const sheetRow = sorted.find((r) => r.id === (sheetRowId ?? lastSheetRowId.current)) ?? null

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground text-center">
				No teams to pick from in this round yet.
			</div>
		)
	}

	// Both gestures, stated rather than discovered. Composed from what this board
	// actually offers, so a read-only round doesn't promise a selection.
	const gestures = [
		selectable && 'Tap a row to select a team',
		ranking && !readonly && 'Tap Rank to back a team',
		sheetEnabled && 'Tap the form for team detail',
	].filter(Boolean) as string[]

	return (
		<>
			<div className="rounded-lg border border-border bg-card">
				<table className="w-full table-auto text-left border-collapse">
					<colgroup>
						{COLUMNS.map((col) => (
							<col key={col.label} className={ranking ? col.rankingWidth : col.width} />
						))}
						{ranking && <col className={RANK_COLUMN_WIDTH} />}
					</colgroup>
					<caption className="sr-only">
						{ranking
							? `Teams available to rank, ${ranking.count} of ${ranking.target} ranked`
							: readonly
								? 'Teams in this round, read-only'
								: 'Teams available to pick'}
						, sorted by {COLUMNS.find((c) => c.key === sort.column)?.longLabel}
					</caption>
					<thead>
						<tr className="border-b border-border bg-muted/40">
							{COLUMNS.map((col) => {
								const { key } = col
								return (
									<HeaderCell
										key={col.label}
										column={col}
										sort={sort}
										onSort={key ? () => setSort((s) => nextPickTableSort(s, key)) : undefined}
									/>
								)
							})}
							{ranking && (
								<th scope="col" className={CELL}>
									<span className="sr-only">Rank</span>
								</th>
							)}
						</tr>
						{gestures.length > 0 && (
							<tr className="border-b border-border bg-muted/40">
								<td
									colSpan={COLUMNS.length + (ranking ? 1 : 0)}
									className={cn(TYPE.meta, 'px-2 pb-1.5 text-muted-foreground')}
								>
									{gestures.join(' · ')}
								</td>
							</tr>
						)}
					</thead>
					<tbody>
						{sorted.map((row) => (
							<Row
								key={row.id}
								row={row}
								isCurrent={row.team.id === currentTeamId}
								isSelected={row.id === selectedRowId}
								readonly={readonly}
								onSelect={selectable ? () => onSelect?.(row) : undefined}
								sheetEnabled={sheetEnabled}
								onOpenSheet={() => {
									lastSheetRowId.current = row.id
									setSheetRowId(row.id)
								}}
								ranking={ranking}
							/>
						))}
					</tbody>
				</table>
			</div>

			{sheetRow &&
				(renderFormSheet
					? renderFormSheet({
							fixtureId: sheetRow.fixtureId,
							...sheetSides(sheetRow),
							side: sheetRow.side,
							open: sheetRowId !== null,
							onClose: () => setSheetRowId(null),
							market: sheetMarket(sheetRow),
						})
					: competitionId && (
							<TeamFormSheet
								market={sheetMarket(sheetRow)}
								open={sheetRowId !== null}
								onOpenChange={(open) => {
									if (!open) setSheetRowId(null)
								}}
								teamId={sheetRow.team.id}
								competitionId={competitionId}
								opponentTeamId={sheetRow.opponent.id}
								beforeRoundNumber={roundNumber}
								teamPreview={sheetRow.team}
							/>
						))}
		</>
	)
}

/** The row's two teams as the sheet's renderer wants them: by side, not by role. */
function sheetSides(row: PickTableRow): { home: FixtureTeamInfo; away: FixtureTeamInfo } {
	return row.side === 'home'
		? { home: row.team, away: row.opponent }
		: { home: row.opponent, away: row.team }
}

/**
 * The whole 1X2 for the sheet, built from the odds that came down with the row.
 * Null for an unpriced fixture, where the sheet shows no market at all.
 */
function sheetMarket(row: PickTableRow): FormMarket | null {
	const odds = row.fixtureOdds
	if (!odds) return null
	const { home, away } = sheetSides(row)
	return {
		home: { shortName: home.shortName, ...odds.home },
		draw: odds.draw,
		away: { shortName: away.shortName, ...odds.away },
		asOf: odds.asOf,
		teamSide: row.side,
	}
}

function HeaderCell({
	column,
	sort,
	onSort,
}: {
	column: ColumnSpec
	sort: PickTableSort
	onSort?: () => void
}) {
	const active = column.key != null && sort.column === column.key
	const headerCls = cn(
		CELL,
		'font-medium whitespace-nowrap',
		column.align === 'right' ? 'text-right' : 'text-left',
	)

	// Form and Next carry no order worth offering, so their headers are labels.
	if (!onSort) {
		return (
			<th scope="col" className={headerCls}>
				<span className={cn(TYPE.meta, 'uppercase tracking-wide text-muted-foreground')}>
					{column.label}
				</span>
			</th>
		)
	}

	return (
		<th
			scope="col"
			// `aria-sort` is what makes "this column is sortable" audible rather than
			// just clickable.
			aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={headerCls}
		>
			<button
				type="button"
				onClick={onSort}
				aria-label={`Sort by ${column.longLabel}`}
				className={cn(
					TYPE.meta,
					'inline-flex items-center gap-1 uppercase tracking-wide rounded px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
					active ? 'text-foreground font-semibold' : 'text-muted-foreground',
					column.align === 'right' && 'flex-row-reverse',
				)}
			>
				<span>{column.label}</span>
				{active &&
					(sort.direction === 'asc' ? (
						<ArrowUp className="h-3 w-3" aria-hidden />
					) : (
						<ArrowDown className="h-3 w-3" aria-hidden />
					))}
			</button>
		</th>
	)
}

function Row({
	row,
	isCurrent,
	isSelected,
	readonly,
	onSelect,
	sheetEnabled,
	onOpenSheet,
	ranking,
}: {
	row: PickTableRow
	isCurrent: boolean
	isSelected: boolean
	readonly: boolean
	onSelect?: () => void
	sheetEnabled: boolean
	onOpenSheet: () => void
	ranking?: PickTableRanking
}) {
	const { team, opponent, state } = row
	const isRanked = state.kind === 'ranked'
	// A ranked row isn't "unavailable" — it's the opposite, it's in the set. What
	// it can't be is added again, which is what `pickable` is false for.
	const unavailable = !row.pickable && !isRanked
	const highlighted = isCurrent || isRanked || isSelected
	// The round's current pick is marked, not re-offered: there's nothing for a
	// selection to change. Used and restricted teams stay listed and unselectable.
	const selectable = !!onSelect && row.pickable && !isCurrent

	/**
	 * Tapping the row selects its team — but only where the tap didn't land on a
	 * control of its own. The form cell opens the sheet and the select button
	 * below fires its own handler; neither is a row tap, and letting either
	 * bubble here would select a team the player was only reading about.
	 */
	function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>) {
		if ((event.target as HTMLElement).closest('button, a')) return
		onSelect?.()
	}

	const identity = (
		<>
			<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="sm" />
			<div className="flex flex-col gap-0.5 min-w-0">
				{/* Truncates rather than widening: a long club name gives up its
				    tail instead of taking space off the form and win columns —
				    which is also what holds the team column to its declared
				    share, since a name that can't shrink would otherwise be the
				    one thing on the board able to overrule it. */}
				<span className={cn(TYPE.name, 'text-sm sm:text-base truncate')}>
					<span className="sm:hidden">{team.shortName}</span>
					<span className="hidden sm:inline">{team.name}</span>
				</span>
				{state.kind === 'used' && (
					// Short on screen — the chip sits under a team name in a
					// five-column board, and "Used Gameweek 3" spelled out the part
					// the player already knows. A reader gets the long round name,
					// which is the form that survives being heard.
					<span className={cn(CHIP, 'bg-muted text-muted-foreground')}>
						<span aria-hidden>Used {state.label}</span>
						<span className="sr-only">Used {state.longLabel}</span>
					</span>
				)}
				{state.kind === 'restricted' && (
					<span className={cn(CHIP, 'bg-muted text-muted-foreground')}>{state.reason}</span>
				)}
				{state.kind === 'ranked' && (
					<span className={cn(CHIP, 'bg-[var(--alive-bg)] text-[var(--alive)]')}>
						Ranked #{state.rank}
					</span>
				)}
				{state.kind === 'fixture-ranked' && (
					<span className={cn(CHIP, 'bg-muted text-muted-foreground')}>
						#{state.rank}: {state.call}
					</span>
				)}
				{isCurrent && state.kind === 'available' && (
					<span className={cn(CHIP, 'bg-[var(--alive-bg)] text-[var(--alive)]')}>Current</span>
				)}
			</div>
		</>
	)

	return (
		// The whole-row gesture is a handler on the row, not a stretched overlay
		// inside it. CSS 2.1 leaves `position: relative` on a table row undefined
		// and WebKit ignores it, so the `absolute inset-0` button this used to be
		// resolved against the page instead of its row on iOS: every row's tap
		// target piled up over the top of the page, swallowing the Fixtures/Table
		// toggle's taps and painting a selected row's green ring across the lot
		// (#211). Nothing on this board is absolutely positioned any more — keep it
		// that way; a table row cannot be a containing block.
		//
		// The handler is a pointer affordance only: the row's keyboard and
		// screen-reader path is the real select button in the team cell below.
		<tr
			onClick={selectable ? handleRowClick : undefined}
			className={cn(
				'border-b border-border last:border-b-0',
				selectable && 'cursor-pointer hover:bg-muted/40',
				highlighted && 'bg-[var(--alive-bg)]',
				// Marked, not hidden: "Chelsea, used in GW3" is the answer to the
				// question the player is asking. Dimmed enough to skip, legible
				// enough to read.
				unavailable && 'opacity-60',
			)}
		>
			<td className="px-2 py-2">
				{selectable ? (
					// The row's keyboard and screen-reader path: a real button carrying
					// the whole decision, a sibling of the form cell's rather than its
					// parent, since one interactive control can't contain another. It
					// takes the team cell because that's where the identity is — the
					// pointer gesture over the rest of the row is the row's own handler.
					<button
						type="button"
						onClick={onSelect}
						aria-pressed={isSelected}
						// "Select Chelsea" out of a table row says nothing about which
						// fixture the pick commits to; the label carries the whole decision.
						aria-label={`Select ${team.name} vs ${opponent.name} (${row.side === 'home' ? 'home' : 'away'})`}
						className={cn(
							'-mx-1 flex w-full items-center gap-2 min-w-0 rounded-sm px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
							// The same mark the Fixtures view puts on a selected team, in
							// the same place: around the team, not around the row.
							isSelected && 'ring-2 ring-inset ring-[var(--alive)]',
						)}
					>
						{identity}
					</button>
				) : (
					<div className="flex items-center gap-2 min-w-0">{identity}</div>
				)}
			</td>
			<td className={cn(TYPE.meta, CELL, 'text-right font-mono whitespace-nowrap')}>
				{team.leaguePosition != null ? (
					team.leaguePosition
				) : (
					<span className="text-muted-foreground/60">–</span>
				)}
			</td>
			<FormCell row={row} sheetEnabled={sheetEnabled} onOpenSheet={onOpenSheet} />
			<td className={cn(TYPE.meta, CELL, 'whitespace-nowrap')}>
				<span className="font-medium">{opponent.shortName}</span>{' '}
				<span className="text-muted-foreground">({row.side === 'home' ? 'H' : 'A'})</span>
			</td>
			<td className={cn(TYPE.meta, CELL, 'text-right whitespace-nowrap')}>
				{row.winProbability != null ? (
					// The price never drops — it's what makes the percentage traceable to a
					// real quote — so on a phone it stacks under it instead.
					<span className="flex flex-col items-end sm:flex-row sm:items-baseline sm:justify-end sm:gap-1">
						<span className="font-semibold">{Math.round(row.winProbability * 100)}%</span>
						{row.price != null && (
							<span className="font-mono text-muted-foreground">{row.price.toFixed(2)}</span>
						)}
					</span>
				) : (
					// No odds for this fixture: say so, never show a 0%.
					<span className="text-muted-foreground/60">No odds</span>
				)}
			</td>
			{ranking && (
				<td className={cn(CELL, 'text-right')}>
					<RankCell row={row} ranking={ranking} readonly={readonly} />
				</td>
			)}
		</tr>
	)
}

/**
 * The three most recent results, and the tap-through to the form sheet — the
 * same marker and gesture the Fixtures view's form bar uses, so the chevron
 * means the same thing in both views.
 *
 * The tap-through is offered whenever the sheet is available, form or no form.
 * It used to be gated on having results ("nothing to tap"), which pre-dated the
 * form-guide page: the sheet carries the team's league position, its season
 * record, the next fixture's odds and the link onward to the guide, none of
 * which need a played match — and with the gate on, a pre-season board had no
 * way through to any of it. The Fixtures view already behaves this way, opening
 * on a league position alone.
 *
 * What a form-less cell keeps is its wording: a blank cell in a labelled column
 * reads as a gap, so it still says the season hasn't started, and now says
 * where to look as well.
 */
function FormCell({
	row,
	sheetEnabled,
	onOpenSheet,
}: {
	row: PickTableRow
	sheetEnabled: boolean
	onOpenSheet: () => void
}) {
	const form = row.team.form?.slice(0, FORM_RESULTS_SHOWN)
	const content = form?.length ? (
		<FormDots results={form} size="sm" />
	) : (
		// The board says what it doesn't know, cell by cell — the same reason the
		// position column shows a dash and the win column says "No odds". The
		// fixture row (an unlabelled strip, where the position carries the reading)
		// needs no such filler and no longer has one.
		<span className={cn(TYPE.chip, 'font-normal text-muted-foreground/70 whitespace-nowrap')}>
			No form yet
		</span>
	)

	if (!sheetEnabled) {
		return <td className={CELL}>{content}</td>
	}

	return (
		<td className={CELL}>
			<button
				type="button"
				onClick={onOpenSheet}
				aria-label={`Open form details for ${row.team.name}`}
				className="-mx-1 inline-flex items-center gap-0.5 rounded px-1 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				{content}
				<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
			</button>
		</td>
	)
}

/**
 * The last column in ranking mode: add this team to the confidence set, or —
 * for a row already in it — move it and drop it. The controls live on the row
 * itself rather than in a separate list, so ordering happens where the
 * comparison is being made.
 */
function RankCell({
	row,
	ranking,
	readonly,
}: {
	row: PickTableRow
	ranking: PickTableRanking
	readonly: boolean
}) {
	const { state, team, opponent } = row

	if (state.kind === 'ranked') {
		if (readonly) {
			return <span className="sr-only">{`${team.name} ranked number ${state.rank}`}</span>
		}
		// At the ends of the ranking the control is dead, so its label names the
		// move rather than a destination rank that doesn't exist.
		const atTop = state.rank <= 1
		const atBottom = state.rank >= ranking.count
		return (
			<div className="inline-flex items-center gap-0.5">
				<RankControl
					label={
						atTop ? `Move ${team.name} up` : `Move ${team.name} up to number ${state.rank - 1}`
					}
					disabled={atTop}
					onClick={() => ranking.onMove(row, 'up')}
				>
					<ChevronUp className="h-4 w-4" aria-hidden />
				</RankControl>
				<RankControl
					label={
						atBottom
							? `Move ${team.name} down`
							: `Move ${team.name} down to number ${state.rank + 1}`
					}
					disabled={atBottom}
					onClick={() => ranking.onMove(row, 'down')}
				>
					<ChevronDown className="h-4 w-4" aria-hidden />
				</RankControl>
				<RankControl
					label={`Remove ${team.name} from your predictions`}
					onClick={() => ranking.onRemove(row)}
				>
					<X className="h-4 w-4" aria-hidden />
				</RankControl>
			</div>
		)
	}

	if (state.kind === 'fixture-ranked') {
		// One prediction per fixture: the other side of a ranked fixture has
		// nothing to offer until that call is removed or changed.
		return (
			<span className="sr-only">
				{`${team.name}'s fixture is already ranked number ${state.rank}, for ${state.call}`}
			</span>
		)
	}

	if (!row.pickable || readonly) return <UnavailableNote row={row} />

	// No cap at `target`: the fixtures view lets the ranking run past the round's
	// count too, and the confirm bar is what holds the line (it only arms on
	// exactly `target`). The two views agreeing matters more than the guard.
	const nextRank = ranking.count + 1
	return (
		<button
			type="button"
			onClick={() => ranking.onAdd(row)}
			// "Rank #4" out of a table cell says nothing about which call it makes.
			aria-label={`Rank ${team.name} to beat ${opponent.name} at number ${nextRank}`}
			className={cn(
				TYPE.chip,
				'rounded-md border border-border bg-card px-2 py-1.5 whitespace-nowrap uppercase tracking-wide hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
			)}
		>
			Rank #{nextRank}
		</button>
	)
}

function RankControl({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			{children}
		</button>
	)
}

/** Why this row offers no control, for a reader who can't see it dimmed. */
function UnavailableNote({ row }: { row: PickTableRow }) {
	const { state, team } = row
	return (
		<span className="sr-only">
			{state.kind === 'used'
				? `${team.name} used in ${state.longLabel}`
				: state.kind === 'restricted'
					? `${team.name} unavailable: ${state.reason}`
					: `${team.name} locked`}
		</span>
	)
}
