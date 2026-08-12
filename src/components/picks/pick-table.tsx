'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
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
 * Everything it renders comes off `PickTableRow`; the sort lives here because
 * it's a view preference, and the ordering itself is `sortPickTableRows`, which
 * is where the degradation rules are tested.
 *
 * Width: the columns don't collapse on a phone — a board missing points and
 * goals isn't the same board. Instead the table scrolls horizontally with the
 * team column pinned, so every column stays reachable (and sortable) at 375px.
 */

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
					Teams available to pick, sorted by {COLUMNS.find((c) => c.key === sort.column)?.longLabel}
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
							<span className="sr-only">Pick</span>
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
}: {
	row: PickTableRow
	isCurrent: boolean
	readonly: boolean
	pending: boolean
	onPick: () => void
}) {
	const { team, opponent, state } = row
	const gf = team.standing?.goalsFor
	const ga = team.standing?.goalsAgainst
	const unavailable = !row.pickable

	return (
		<tr
			className={cn(
				'border-b border-border last:border-b-0',
				isCurrent && 'bg-[var(--alive-bg)]',
				// Marked, not hidden: "Chelsea, used in GW3" is the answer to the
				// question the player is asking. Dimmed enough to skip, legible
				// enough to read.
				unavailable && 'opacity-60',
			)}
		>
			<td
				className={cn(
					'px-2 py-2 sticky left-0 z-10',
					isCurrent ? 'bg-[var(--alive-bg)]' : 'bg-card',
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
				{unavailable || readonly ? (
					<span className="sr-only">
						{state.kind === 'used'
							? `${team.name} used in ${state.label}`
							: state.kind === 'restricted'
								? `${team.name} unavailable: ${state.reason}`
								: `${team.name} locked`}
					</span>
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

function NumberCell({ value }: { value?: number | null }) {
	return (
		<td className={cn(TYPE.meta, 'px-2 py-2 text-right font-mono whitespace-nowrap')}>
			{value != null ? value : <span className="text-muted-foreground/60">–</span>}
		</td>
	)
}
