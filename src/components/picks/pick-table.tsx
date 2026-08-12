'use client'

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import {
	DEFAULT_PICK_TABLE_SORT,
	nextPickTableSort,
	type PickTableRow,
	type PickTableSort,
	type PickTableSortColumn,
	sortPickTableRows,
} from '@/lib/game/pick-table-view'
import { cn } from '@/lib/utils'
import { FormDots } from './form-dots'
import { TeamBadge } from './team-badge'
import { CHIP, TYPE } from './type-scale'

/**
 * The Table view: one row per team the player could pick, sorted safest-first.
 *
 * Where the Fixtures view answers "what's on this weekend", this answers "which
 * of my remaining teams is most likely to win" — so it opens on the market's
 * ordering and lets every column re-ask the question a different way.
 *
 * Two modes, one board. `onPick` is classic's: a row commits the round's single
 * pick. `ranking` is turbo's: a row joins the confidence set and carries the
 * controls for its place in it. Same columns, same sorting, same degradation —
 * the mode only changes what the last column does.
 *
 * Everything it renders comes off `PickTableRow`; the sort lives here because
 * it's a view preference, and the ordering itself is `sortPickTableRows`, which
 * is where the degradation rules are tested.
 *
 * Width: the columns don't collapse on a phone — a board missing points and
 * goals isn't the same board. Instead the table scrolls horizontally with the
 * team column pinned, so every column stays reachable (and sortable) at 375px.
 */

/**
 * The board as a *ranking* surface, which is what turbo needs of it: a tap adds
 * the team to the confidence set instead of committing the round's one pick, and
 * the rows already in that set carry its controls.
 *
 * Passing this switches the last column from "Pick" to the rank controls.
 * Everything else — every column, every sort, every degradation rule — is the
 * same board classic reads.
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

interface PickTableProps {
	rows: PickTableRow[]
	/** The team currently picked for this round, if any. Marked, not re-pickable. */
	currentTeamId?: string | null
	/**
	 * Commit this row's team. One tap: the board's whole point is picking from
	 * the ordering you're reading, and a select-then-confirm step here would put
	 * the confirm bar over the row you were comparing against.
	 */
	onPick?: (row: PickTableRow) => void | Promise<void>
	/**
	 * Turbo's ranking handlers. Mutually exclusive with `onPick` in practice: a
	 * mode either commits one team from the board or builds a ranking on it.
	 */
	ranking?: PickTableRanking
	/** Post-deadline / read-only: the board still reads, nothing commits. */
	readonly?: boolean
	initialSort?: PickTableSort
}

interface ColumnSpec {
	key: PickTableSortColumn
	/** Short header, for the narrow columns. */
	label: string
	/** Spelled out for screen readers, where "GF/GA" is not a word. */
	longLabel: string
	align: 'left' | 'right'
}

const COLUMNS: ColumnSpec[] = [
	{ key: 'team', label: 'Team', longLabel: 'Team', align: 'left' },
	{ key: 'position', label: '#', longLabel: 'League position', align: 'right' },
	{ key: 'played', label: 'P', longLabel: 'Played', align: 'right' },
	{ key: 'points', label: 'Pts', longLabel: 'Points', align: 'right' },
	{ key: 'goalDifference', label: 'GF/GA', longLabel: 'Goals for and against', align: 'right' },
	{ key: 'form', label: 'Form', longLabel: 'Recent form', align: 'left' },
	{ key: 'opponent', label: 'Next', longLabel: 'Next opponent', align: 'left' },
	{ key: 'winProbability', label: 'Win', longLabel: 'Win probability', align: 'right' },
]

export function PickTable({
	rows,
	currentTeamId,
	onPick,
	ranking,
	readonly = false,
	initialSort = DEFAULT_PICK_TABLE_SORT,
}: PickTableProps) {
	const [sort, setSort] = useState<PickTableSort>(initialSort)
	const [pendingRowId, setPendingRowId] = useState<string | null>(null)
	const sorted = sortPickTableRows(rows, sort)

	async function pick(row: PickTableRow) {
		if (!onPick || readonly || !row.pickable) return
		setPendingRowId(row.id)
		try {
			await onPick(row)
		} finally {
			setPendingRowId(null)
		}
	}

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground text-center">
				No teams to pick from in this round yet.
			</div>
		)
	}

	return (
		<div className="rounded-lg border border-border bg-card overflow-x-auto">
			<table className="w-full text-left border-collapse">
				<caption className="sr-only">
					{ranking
						? `Teams available to rank, ${ranking.count} of ${ranking.target} ranked, sorted by`
						: 'Teams available to pick, sorted by'}{' '}
					{COLUMNS.find((c) => c.key === sort.column)?.longLabel}
				</caption>
				<thead>
					<tr className="border-b border-border bg-muted/40">
						{COLUMNS.map((col) => (
							<SortableHeader
								key={col.key}
								column={col}
								sort={sort}
								onSort={() => setSort((s) => nextPickTableSort(s, col.key))}
							/>
						))}
						<th scope="col" className="px-2 py-2">
							<span className="sr-only">{ranking ? 'Rank' : 'Pick'}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => (
						<Row
							key={row.id}
							row={row}
							isCurrent={row.team.id === currentTeamId}
							readonly={readonly}
							pending={pendingRowId === row.id}
							onPick={() => pick(row)}
							ranking={ranking}
						/>
					))}
				</tbody>
			</table>
		</div>
	)
}

function SortableHeader({
	column,
	sort,
	onSort,
}: {
	column: ColumnSpec
	sort: PickTableSort
	onSort: () => void
}) {
	const active = sort.column === column.key
	return (
		<th
			scope="col"
			// `aria-sort` is what makes "every column is sortable" audible rather
			// than just clickable.
			aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={cn(
				'px-2 py-2 font-medium whitespace-nowrap',
				column.key === 'team' && 'sticky left-0 z-10 bg-muted/40',
				column.align === 'right' ? 'text-right' : 'text-left',
			)}
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
	readonly,
	pending,
	onPick,
	ranking,
}: {
	row: PickTableRow
	isCurrent: boolean
	readonly: boolean
	pending: boolean
	onPick: () => void
	ranking?: PickTableRanking
}) {
	const { team, opponent, state } = row
	const gf = team.standing?.goalsFor
	const ga = team.standing?.goalsAgainst
	const isRanked = state.kind === 'ranked'
	// A ranked row isn't "unavailable" — it's the opposite, it's in the set. What
	// it can't be is added again, which is what `pickable` is false for.
	const unavailable = !row.pickable && !isRanked
	const highlighted = isCurrent || isRanked

	return (
		<tr
			className={cn(
				'border-b border-border last:border-b-0',
				highlighted && 'bg-[var(--alive-bg)]',
				// Marked, not hidden: "Chelsea, used in GW3" is the answer to the
				// question the player is asking. Dimmed enough to skip, legible
				// enough to read.
				unavailable && 'opacity-60',
			)}
		>
			<td
				className={cn(
					'px-2 py-2 sticky left-0 z-10',
					highlighted ? 'bg-[var(--alive-bg)]' : 'bg-card',
				)}
			>
				<div className="flex items-center gap-2 min-w-0">
					<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="sm" />
					<div className="flex flex-col gap-0.5 min-w-0">
						<span className={cn(TYPE.name, 'text-sm sm:text-base whitespace-nowrap')}>
							<span className="sm:hidden">{team.shortName}</span>
							<span className="hidden sm:inline">{team.name}</span>
						</span>
						{state.kind === 'used' && (
							<span className={cn(CHIP, 'bg-muted text-muted-foreground')}>Used {state.label}</span>
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
				</div>
			</td>
			<NumberCell value={team.leaguePosition} />
			<NumberCell value={team.standing?.played} />
			<NumberCell value={team.standing?.points} />
			<td className={cn(TYPE.meta, 'px-2 py-2 text-right font-mono whitespace-nowrap')}>
				{gf != null && ga != null ? (
					`${gf}/${ga}`
				) : (
					<span className="text-muted-foreground/60">–</span>
				)}
			</td>
			<td className="px-2 py-2">
				{team.form?.length ? (
					<FormDots results={team.form} size="sm" />
				) : (
					// Same wording the fixture row uses at season start: an explicit
					// "nothing yet" rather than a blank that reads as half-loaded.
					<span className={cn(TYPE.chip, 'font-normal text-muted-foreground/70 whitespace-nowrap')}>
						No form yet
					</span>
				)}
			</td>
			<td className={cn(TYPE.meta, 'px-2 py-2 whitespace-nowrap')}>
				<span className="font-medium">{opponent.shortName}</span>{' '}
				<span className="text-muted-foreground">({row.side === 'home' ? 'H' : 'A'})</span>
			</td>
			<td className={cn(TYPE.meta, 'px-2 py-2 text-right whitespace-nowrap')}>
				{row.winProbability != null ? (
					<>
						<span className="font-semibold">{Math.round(row.winProbability * 100)}%</span>{' '}
						{row.price != null && (
							<span className="font-mono text-muted-foreground">{row.price.toFixed(2)}</span>
						)}
					</>
				) : (
					// No odds for this fixture: say so, never show a 0%.
					<span className="text-muted-foreground/60">No odds</span>
				)}
			</td>
			<td className="px-2 py-2 text-right">
				{ranking ? (
					<RankCell row={row} ranking={ranking} readonly={readonly} />
				) : unavailable || readonly ? (
					<UnavailableNote row={row} />
				) : (
					<button
						type="button"
						onClick={onPick}
						// "Pick" alone is ambiguous read out of a table cell; the label
						// carries the whole decision the tap commits.
						aria-label={`Pick ${team.name} vs ${opponent.name} (${row.side === 'home' ? 'home' : 'away'})`}
						disabled={pending || isCurrent}
						className={cn(
							TYPE.chip,
							'rounded-md border px-2.5 py-1.5 whitespace-nowrap uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
							isCurrent
								? 'border-[var(--alive)] text-[var(--alive)]'
								: 'border-border bg-card hover:bg-muted',
							pending && 'opacity-60',
						)}
					>
						{isCurrent ? 'Picked' : pending ? 'Picking…' : 'Pick'}
					</button>
				)}
			</td>
		</tr>
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
		return (
			<div className="inline-flex items-center gap-0.5">
				<RankControl
					label={`Move ${team.name} up to number ${state.rank - 1}`}
					disabled={state.rank <= 1}
					onClick={() => ranking.onMove(row, 'up')}
				>
					<ChevronUp className="h-4 w-4" aria-hidden />
				</RankControl>
				<RankControl
					label={`Move ${team.name} down to number ${state.rank + 1}`}
					disabled={state.rank >= ranking.count}
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
				'rounded-md border border-border bg-card px-2.5 py-1.5 whitespace-nowrap uppercase tracking-wide hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
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
				? `${team.name} used in ${state.label}`
				: state.kind === 'restricted'
					? `${team.name} unavailable: ${state.reason}`
					: `${team.name} locked`}
		</span>
	)
}

function NumberCell({ value }: { value?: number | null }) {
	return (
		<td className={cn(TYPE.meta, 'px-2 py-2 text-right font-mono whitespace-nowrap')}>
			{value != null ? value : <span className="text-muted-foreground/60">–</span>}
		</td>
	)
}
