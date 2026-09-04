'use client'

import { Eye, EyeOff, Share2, UsersRound } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'
import { useLiveGame } from '@/components/live/use-live-game'
import type { FixtureSummaryView } from '@/components/picks/team-form-panel'
import { TeamFormSheet } from '@/components/picks/team-form-sheet'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { describeFixturePhase } from '@/lib/game/fixture-phase'
import {
	type GridSort,
	type GridSortDir,
	type GridSortKey,
	sortGridPlayers,
} from '@/lib/game/grid-sort'
import type { GridCell, GridPlayer, GridRound } from '@/lib/game/read/standings'
import { cn } from '@/lib/utils'
import { AdminPlayerActions } from './admin-player-actions'
import { GridFilter } from './grid-filter'

/** Fixture summary plus the phase it came from, for a caller-supplied renderer. */
export interface GridFixtureSummary extends FixtureSummaryView {
	phase: 'pre_match' | 'result'
}

/** What a caller-supplied sheet renderer is handed when a tappable cell opens. */
export interface GridCellSheetArgs {
	fixtureId: string
	teamId: string
	opponentTeamId?: string
	teamShortName: string
	roundNumber: number
	fixtureSummary: GridFixtureSummary
	open: boolean
	onClose: () => void
}

export type GridCellFormSheetRenderer = (args: GridCellSheetArgs) => React.ReactNode

// Each column's natural first-click direction; clicking an already-active column
// flips it.
const NATURAL_DIR: Record<GridSortKey, GridSortDir> = {
	name: 'asc',
	goals: 'desc',
	status: 'asc',
	round: 'asc',
}

const LIVE_RECENT_MS = 1500

interface ProgressLiveMeta {
	viewerGamePlayerId: string | undefined
	viewerRowIsLive: boolean
	eliminatedGpIds: Set<string>
	recentGoalByFixture: Map<string, { side: 'home' | 'away' }>
	pickFixtureByPlayer: Map<string, string>
	pickSideByPlayer: Map<string, 'home' | 'away' | null>
}

interface ProgressGridProps {
	rounds: GridRound[]
	players: GridPlayer[]
	aliveCount: number
	eliminatedCount: number
	defaultFilter?: 'all' | 'last5' | 'last3'
	gameId?: string
	/** Called with the grid's current sort + filter encoded as a query string,
	 *  so the Share-grid image can reproduce the on-screen order. */
	onShare?: (standingsQuery: string) => void
	showAdminActions?: boolean
	/** Required to open the default fixture-detail sheet (`TeamFormSheet`). Without either it, or `renderFormSheet`, cells render with no tap target (#226). */
	competitionId?: string
	/**
	 * Overrides how the fixture-detail sheet is rendered, for callers that
	 * can't reach the database-backed server action the default path uses.
	 * Supplying it makes cells tappable even without `competitionId`.
	 */
	renderFormSheet?: GridCellFormSheetRenderer
}

export function ProgressGrid({
	rounds,
	players,
	aliveCount,
	eliminatedCount,
	defaultFilter = 'all',
	gameId,
	onShare,
	showAdminActions,
	competitionId,
	renderFormSheet,
}: ProgressGridProps) {
	const [filter, setFilter] = useState<'all' | 'last5' | 'last3'>(defaultFilter)
	const [sort, setSort] = useState<GridSort>({ key: 'status', dir: 'asc' })
	const [showOpponents, setShowOpponents] = useState(false)
	const [hideEliminated, setHideEliminated] = useState(false)
	const liveCtx = useLiveGame()
	// Which cell (by player + round) opened the fixture-detail sheet. The ref
	// keeps the sheet's content through the close animation instead of
	// emptying the moment it starts (mirrors PickTable's `lastSheetRowId`).
	const [sheetTarget, setSheetTarget] = useState<{ playerId: string; roundId: string } | null>(null)
	const lastSheetTarget = useRef<{ playerId: string; roundId: string } | null>(null)
	const sheetEnabled = !!competitionId || !!renderFormSheet

	// Click a column header to sort by it; click the active one again to flip
	// direction. Round columns sort by the team picked that gameweek.
	const isActiveSort = (key: GridSortKey, roundId?: string) =>
		sort.key === key && (key !== 'round' || sort.roundId === roundId)
	const toggleSort = (key: GridSortKey, roundId?: string) =>
		setSort((prev) =>
			prev.key === key && (key !== 'round' || prev.roundId === roundId)
				? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
				: { key, roundId, dir: NATURAL_DIR[key] },
		)
	const sortArrow = (key: GridSortKey, roundId?: string) =>
		isActiveSort(key, roundId) ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

	const buildShareQuery = () => {
		const q = new URLSearchParams({ sort: sort.key, dir: sort.dir })
		if (sort.roundId) q.set('round', sort.roundId)
		if (hideEliminated) q.set('aliveOnly', '1')
		return q.toString()
	}

	const liveMeta: ProgressLiveMeta = (() => {
		const now = Date.now()
		const recentGoalByFixture = new Map<string, { side: 'home' | 'away' }>()
		for (const ev of liveCtx.events.goals) {
			if (now - ev.observedAt <= LIVE_RECENT_MS) {
				recentGoalByFixture.set(ev.fixtureId, { side: ev.side })
			}
		}
		const eliminatedGpIds = new Set<string>()
		for (const ev of liveCtx.events.settlements) {
			if (ev.result !== 'settled-loss') continue
			const p = liveCtx.payload?.players.find((pp) => pp.id === ev.gamePlayerId)
			if (p && p.livesRemaining === 0) eliminatedGpIds.add(ev.gamePlayerId)
		}
		const viewerUserId = liveCtx.payload?.viewerUserId
		const viewerGp = viewerUserId
			? liveCtx.payload?.players.find((p) => p.userId === viewerUserId)
			: undefined
		const viewerPickFixtureId = viewerGp
			? (liveCtx.payload?.picks.find((pk) => pk.gamePlayerId === viewerGp.id && pk.fixtureId)
					?.fixtureId ?? undefined)
			: undefined
		const viewerFixtureStatus = viewerPickFixtureId
			? liveCtx.payload?.fixtures.find((f) => f.id === viewerPickFixtureId)?.status
			: undefined
		const viewerRowIsLive = viewerFixtureStatus === 'live' || viewerFixtureStatus === 'halftime'

		// Classic mode: one pick per player for the current round.
		const pickFixtureByPlayer = new Map<string, string>()
		const pickSideByPlayer = new Map<string, 'home' | 'away' | null>()
		for (const pk of liveCtx.payload?.picks ?? []) {
			if (!pk.fixtureId) continue
			pickFixtureByPlayer.set(pk.gamePlayerId, pk.fixtureId)
			const side: 'home' | 'away' | null =
				pk.predictedResult === 'home_win'
					? 'home'
					: pk.predictedResult === 'away_win'
						? 'away'
						: null
			pickSideByPlayer.set(pk.gamePlayerId, side)
		}

		return {
			viewerGamePlayerId: viewerGp?.id,
			viewerRowIsLive,
			eliminatedGpIds,
			recentGoalByFixture,
			pickFixtureByPlayer,
			pickSideByPlayer,
		}
	})()

	const visibleRounds =
		filter === 'all' ? rounds : filter === 'last5' ? rounds.slice(-5) : rounds.slice(-3)

	const currentRoundId = rounds.at(-1)?.id

	const sortedPlayers = sortGridPlayers(players, sort)

	const visiblePlayers = hideEliminated
		? sortedPlayers.filter((p) => p.status !== 'eliminated')
		: sortedPlayers

	const activeTarget = sheetTarget ?? lastSheetTarget.current
	const activePlayer = activeTarget
		? players.find((p) => p.id === activeTarget.playerId)
		: undefined
	const activeRound = activeTarget ? rounds.find((r) => r.id === activeTarget.roundId) : undefined
	const activeCell = activeTarget ? activePlayer?.cellsByRoundId[activeTarget.roundId] : undefined
	const activeFixtureSummary: GridFixtureSummary | null =
		activeCell?.fixtureStatus && activeCell.opponentShortName && activeCell.homeAway
			? (() => {
					const { phase, statusLabel } = describeFixturePhase(activeCell.fixtureStatus)
					return {
						phase,
						statusLabel,
						opponentShortName: activeCell.opponentShortName as string,
						homeAway: activeCell.homeAway as 'H' | 'A',
						kickoff: activeCell.kickoff ?? null,
						score: phase === 'result' ? (activeCell.score ?? null) : null,
					}
				})()
			: null

	function openSheet(playerId: string, roundId: string) {
		const target = { playerId, roundId }
		lastSheetTarget.current = target
		setSheetTarget(target)
	}

	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div className="p-4 md:p-5 flex justify-between items-start flex-wrap gap-3 border-b border-border">
				<div>
					<h2 className="font-display text-2xl font-semibold">Progress</h2>
					<div className="flex gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
						<span className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-[var(--alive)]" /> {aliveCount} alive
						</span>
						<span className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-[var(--eliminated)]" /> {eliminatedCount}{' '}
							eliminated
						</span>
					</div>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowOpponents((v) => !v)}
						className="gap-1.5"
					>
						<UsersRound className="h-3.5 w-3.5" />
						{showOpponents ? 'Hide opponents' : 'Show opponents'}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setHideEliminated((v) => !v)}
						className="gap-1.5"
					>
						{hideEliminated ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
						{hideEliminated ? 'Show eliminated' : 'Hide eliminated'}
					</Button>
					{onShare && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => onShare(buildShareQuery())}
							className="gap-1.5"
						>
							<Share2 className="h-3.5 w-3.5" />
							Share grid
						</Button>
					)}
					<GridFilter value={filter} onChange={setFilter} />
				</div>
			</div>

			<TooltipProvider delayDuration={100}>
				<div className="overflow-x-auto p-4 md:p-5">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr>
								<th className="text-left pb-3 pr-4 sticky left-0 bg-card z-10 min-w-[100px]">
									<button
										type="button"
										onClick={() => toggleSort('name')}
										title="Sort by player name"
										className={cn(
											'font-medium hover:text-foreground transition-colors',
											isActiveSort('name') ? 'text-foreground' : 'text-muted-foreground',
										)}
									>
										Player{sortArrow('name')}
									</button>
								</th>
								{visibleRounds.map((r) => (
									<th
										key={r.id}
										className={cn(
											'text-center pb-3 px-1',
											r.voidedAt && 'bg-sky-100/60 dark:bg-sky-900/30 border-x border-sky-300/40',
										)}
									>
										<button
											type="button"
											onClick={() => toggleSort('round', r.id)}
											title={`Sort by ${r.label} picks`}
											className={cn(
												'mx-auto flex flex-col items-center leading-tight font-medium hover:text-foreground transition-colors',
												isActiveSort('round', r.id) ? 'text-foreground' : 'text-muted-foreground',
											)}
										>
											{r.voidedAt && (
												<span className="text-[0.55rem] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
													Voided
												</span>
											)}
											<span>
												{r.label}
												{sortArrow('round', r.id)}
											</span>
										</button>
									</th>
								))}
								<th className="text-center pb-3 px-2">
									<button
										type="button"
										onClick={() => toggleSort('goals')}
										title="Sort by goals scored"
										className={cn(
											'mx-auto inline-flex items-center font-medium hover:text-foreground transition-colors',
											isActiveSort('goals') ? 'text-foreground' : 'text-muted-foreground',
										)}
									>
										Gls{sortArrow('goals')}
									</button>
								</th>
								<th className="pb-3 pl-4 min-w-[80px] text-right">
									<button
										type="button"
										onClick={() => toggleSort('status')}
										title="Sort by status"
										className={cn(
											'ml-auto inline-flex items-center font-medium hover:text-foreground transition-colors',
											isActiveSort('status') ? 'text-foreground' : 'text-muted-foreground',
										)}
									>
										Status{sortArrow('status')}
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							{visiblePlayers.map((player) => {
								const isViewer = liveMeta.viewerGamePlayerId === player.id
								const viewerLiveStyle = isViewer && liveMeta.viewerRowIsLive
								const liveEliminated = liveMeta.eliminatedGpIds.has(player.id)
								const currentPickFixtureId = liveMeta.pickFixtureByPlayer.get(player.id)
								const currentPickSide = liveMeta.pickSideByPlayer.get(player.id)
								const recentGoal = currentPickFixtureId
									? liveMeta.recentGoalByFixture.get(currentPickFixtureId)
									: undefined
								const rowBump = recentGoal
									? currentPickSide && recentGoal.side === currentPickSide
										? 'up'
										: 'down'
									: null
								// The live pick almost always maps to the last visible round.
								const bumpRoundId = visibleRounds.at(-1)?.id
								return (
									<tr
										key={player.id}
										className={cn(
											'border-t border-border',
											player.status === 'eliminated' && 'opacity-50',
											viewerLiveStyle && 'bg-gradient-to-r from-primary/10 to-transparent',
											liveEliminated && 'opacity-45 transition-opacity duration-[400ms]',
										)}
									>
										<td
											className={cn(
												'py-2 pr-4 font-medium whitespace-nowrap sticky left-0 bg-card z-10',
												viewerLiveStyle && 'border-l-4 border-l-primary pl-2',
											)}
										>
											{player.name}
											{viewerLiveStyle && (
												<span className="ml-1.5 rounded-sm bg-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase text-primary animate-[pulse_1.4s_ease-in-out_infinite]">
													LIVE
												</span>
											)}
											{liveEliminated && (
												<span className="ml-1.5 rounded-sm border border-[#ef4444] px-1 py-0.5 text-[9px] font-extrabold uppercase text-[#ef4444]">
													OUT
												</span>
											)}
											{showAdminActions &&
												gameId &&
												currentRoundId &&
												player.status === 'alive' &&
												player.cellsByRoundId[currentRoundId]?.result === 'no_pick' && (
													<AdminPlayerActions
														gameId={gameId}
														playerId={player.id}
														userId={player.userId}
														playerName={player.name}
													/>
												)}
										</td>
										{visibleRounds.map((r) => {
											const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
											const bump = rowBump && r.id === bumpRoundId ? rowBump : null
											return (
												<td
													key={r.id}
													className={cn(
														'px-1 text-center align-middle',
														r.voidedAt &&
															'bg-sky-100/30 dark:bg-sky-900/20 border-x border-sky-300/40',
													)}
												>
													<GridCellView
														cell={cell}
														roundLabel={r.label}
														showOpponents={showOpponents}
														bump={bump}
														onOpen={
															sheetEnabled && cell.fixtureId && cell.teamId
																? () => openSheet(player.id, r.id)
																: undefined
														}
													/>
												</td>
											)
										})}
										<td className="px-2 text-center align-middle text-xs font-semibold tabular-nums">
											{player.goals || '—'}
										</td>
										<td className="pl-4 text-right">
											{player.status === 'alive' ? (
												<span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded bg-[var(--alive-bg)] text-[var(--alive)]">
													alive
												</span>
											) : player.status === 'eliminated' ? (
												<span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded bg-[var(--eliminated-bg)] text-[var(--eliminated)]">
													{player.eliminatedRoundLabel ?? `GW${player.eliminatedRoundNumber}`}
												</span>
											) : (
												<span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded bg-yellow-100 text-yellow-900">
													won
												</span>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</TooltipProvider>

			{activeCell?.fixtureId &&
				activeCell.teamId &&
				activeRound &&
				activeFixtureSummary &&
				(renderFormSheet
					? renderFormSheet({
							fixtureId: activeCell.fixtureId,
							teamId: activeCell.teamId,
							opponentTeamId: activeCell.opponentTeamId,
							teamShortName: activeCell.teamShortName ?? '',
							roundNumber: activeRound.number,
							fixtureSummary: activeFixtureSummary,
							open: sheetTarget !== null,
							onClose: () => setSheetTarget(null),
						})
					: competitionId && (
							<TeamFormSheet
								open={sheetTarget !== null}
								onOpenChange={(open) => {
									if (!open) setSheetTarget(null)
								}}
								teamId={activeCell.teamId}
								competitionId={competitionId}
								opponentTeamId={activeCell.opponentTeamId}
								beforeRoundNumber={activeRound.number}
								fixtureSummary={activeFixtureSummary}
								teamPreview={{
									name: activeCell.teamShortName ?? '',
									shortName: activeCell.teamShortName ?? '',
								}}
							/>
						))}
		</div>
	)
}

/**
 * A cell's tile — a real in-flow `<button>` when it has a fixture to open
 * (`onOpen` set), a plain `<span>` otherwise. Never absolutely positioned:
 * same reason as `PickTable`'s row button (#211) — a table cell can't be a
 * containing block, so the tap target has to be in-flow content, not an
 * overlay.
 */
function CellTag({
	onOpen,
	ariaLabel,
	className,
	children,
}: {
	onOpen?: () => void
	ariaLabel?: string
	className: string
	children: React.ReactNode
}) {
	if (onOpen) {
		return (
			<button type="button" onClick={onOpen} aria-label={ariaLabel} className={className}>
				{children}
			</button>
		)
	}
	return <span className={className}>{children}</span>
}

function GridCellView({
	cell,
	roundLabel,
	showOpponents,
	bump,
	onOpen,
}: {
	cell: GridCell
	roundLabel: string
	showOpponents: boolean
	bump?: 'up' | 'down' | null
	/** Set only for a cell carrying a real fixture (#226) — see `GridCell.fixtureId`. */
	onOpen?: () => void
}) {
	const width = showOpponents ? 'w-20' : 'w-12'
	const height = 'h-9'

	if (cell.result === 'empty') {
		return (
			<span className={cn('relative inline-block', width, height)}>
				{bump && <BumpBadge kind={bump} />}
			</span>
		)
	}
	if (cell.result === 'skull') {
		return (
			<span
				className={cn('relative inline-flex items-center justify-center text-lg', width, height)}
			>
				💀{bump && <BumpBadge kind={bump} />}
			</span>
		)
	}
	if (cell.result === 'no_pick') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							'relative inline-flex flex-col items-center justify-center rounded bg-[var(--draw-bg)] text-[var(--draw)] font-bold leading-tight cursor-help',
							width,
							height,
						)}
					>
						<span className="text-sm">?</span>
						{showOpponents && <span className="text-[0.5rem] font-medium">No pick</span>}
						{bump && <BumpBadge kind={bump} />}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<p className="text-xs">No pick yet</p>
				</TooltipContent>
			</Tooltip>
		)
	}
	if (cell.result === 'void') {
		// Fixture cancelled (or round voided). Distinct visual — soft blue
		// tile with VOID label — so the absence of a result is clear vs
		// the neutral 'pending'. The only cell-state where we deliberately
		// diverge from "settled-style visual" because there's no settled
		// equivalent.
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<CellTag
						onOpen={onOpen}
						ariaLabel={onOpen ? `Open fixture details for ${cell.teamShortName}` : undefined}
						className={cn(
							'relative inline-flex flex-col items-center justify-center rounded bg-sky-100 text-sky-700 font-semibold leading-tight dark:bg-sky-900/40 dark:text-sky-300',
							onOpen ? 'cursor-pointer' : 'cursor-help',
							width,
							height,
						)}
					>
						<span className="text-[0.6rem] uppercase tracking-wider">Void</span>
						{cell.teamShortName && (
							<span className="text-[0.55rem] font-medium opacity-80">{cell.teamShortName}</span>
						)}
						{bump && <BumpBadge kind={bump} />}
					</CellTag>
				</TooltipTrigger>
				<TooltipContent>
					<p className="text-xs">Fixture cancelled — pick voided, you stay alive.</p>
				</TooltipContent>
			</Tooltip>
		)
	}
	if (cell.result === 'locked') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							'relative inline-flex flex-col items-center justify-center rounded border border-dashed border-border bg-muted/40 text-muted-foreground leading-tight cursor-help',
							width,
							height,
						)}
					>
						<span className="text-xs">🔒</span>
						{showOpponents && <span className="text-[0.5rem] font-medium">Locked</span>}
						{bump && <BumpBadge kind={bump} />}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<p className="text-xs">Pick locked in — hidden until deadline</p>
				</TooltipContent>
			</Tooltip>
		)
	}

	const colours: Record<string, string> = {
		win: 'bg-[var(--alive)] text-white',
		loss: 'bg-[var(--eliminated)] text-white',
		draw: 'bg-[var(--eliminated)] text-white',
		draw_exempt: 'bg-[var(--draw)] text-white border-2 border-[var(--draw)]',
		saved: 'bg-[var(--planned)] text-white',
		pending: 'bg-[var(--accent)] text-white',
	}

	// Auto-picked pending cells use amber dashed treatment instead of the
	// normal pending fill, so the viewer can spot "we auto-picked for you"
	// at a glance before kickoff.
	const isAutoPending = cell.isAuto && cell.result === 'pending'
	const colour = isAutoPending
		? 'border border-dashed border-amber-500 text-amber-500 bg-amber-500/10'
		: (colours[cell.result] ?? 'bg-muted text-muted-foreground')

	const pickedLabel = cell.teamShortName ?? '?'
	// Build the under-line as `<v|@><opponent> [score]` so users can see at a
	// glance whether their pick won/lost without hovering for the tooltip.
	// Score replaces no info — when score is unset the opponent line stays as-is.
	const opponentLabel = cell.opponentShortName
		? `${cell.homeAway === 'A' ? '@' : 'v'}${cell.opponentShortName}${cell.score ? ` ${cell.score}` : ''}`
		: null

	const scorePart = cell.score ? ` (${cell.score})` : ''
	const opponentPart = cell.opponentShortName
		? ` ${cell.homeAway === 'A' ? 'at' : 'vs'} ${cell.opponentShortName}`
		: ''
	const resultPart =
		cell.result === 'win'
			? ' — Win'
			: cell.result === 'loss'
				? ' — Loss'
				: cell.result === 'draw'
					? ' — Draw (eliminated)'
					: cell.result === 'draw_exempt'
						? ' — Draw (GW1 exemption)'
						: cell.result === 'saved'
							? ' — Saved by life'
							: ' — Pending'
	const autoPart = cell.isAuto ? ' (auto-pick)' : ''
	const tooltipLabel = cell.teamShortName
		? `${cell.teamShortName}${opponentPart}${scorePart}${resultPart}${autoPart} (${roundLabel})`
		: roundLabel

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<CellTag
					onOpen={onOpen}
					ariaLabel={onOpen ? `Open fixture details for ${cell.teamShortName}` : undefined}
					className={cn(
						'relative inline-flex flex-col items-center justify-center rounded text-[0.7rem] font-bold leading-tight',
						onOpen ? 'cursor-pointer' : 'cursor-help',
						width,
						height,
						colour,
					)}
				>
					<span>{pickedLabel}</span>
					{cell.eliminatedHere && (
						<span className="absolute -bottom-1.5 -right-1 text-xs leading-none drop-shadow">
							💀
						</span>
					)}
					{showOpponents && opponentLabel && (
						<span className="text-[0.55rem] font-normal opacity-80">{opponentLabel}</span>
					)}
					{cell.isAuto && (
						<span className="absolute -right-0.5 -top-0.5 rounded-sm bg-amber-500 px-1 py-0 text-[8px] font-black uppercase tracking-wider text-white leading-none">
							AUTO
						</span>
					)}
					{bump && <BumpBadge kind={bump} />}
				</CellTag>
			</TooltipTrigger>
			<TooltipContent>
				<p className="text-xs">{tooltipLabel}</p>
			</TooltipContent>
		</Tooltip>
	)
}

function BumpBadge({ kind }: { kind: 'up' | 'down' }) {
	return (
		<span
			className={cn(
				'absolute -top-2 -left-1.5 rounded-full px-1 py-0.5 text-[8px] font-extrabold leading-none text-white shadow animate-[pulse_1s_ease-in-out_2]',
				kind === 'up' ? 'bg-emerald-600' : 'bg-red-600',
			)}
		>
			{kind === 'up' ? '+1' : '-1'}
		</span>
	)
}
