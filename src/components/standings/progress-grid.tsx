'use client'

import { Eye, EyeOff, Share2, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useLiveGame } from '@/components/live/use-live-game'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { GridFilter } from './grid-filter'

const LIVE_RECENT_MS = 1500

interface ProgressLiveMeta {
	viewerGamePlayerId: string | undefined
	viewerRowIsLive: boolean
	eliminatedGpIds: Set<string>
	recentGoalByFixture: Map<string, { side: 'home' | 'away' }>
	pickFixtureByPlayer: Map<string, string>
	pickSideByPlayer: Map<string, 'home' | 'away' | null>
}

export interface GridRound {
	id: string
	number: number
	name: string
	isStartingRound?: boolean
}

export interface GridCell {
	result:
		| 'win'
		| 'loss'
		| 'draw'
		| 'draw_exempt'
		| 'saved'
		| 'pending'
		| 'locked'
		| 'skull'
		| 'empty'
		| 'no_pick'
	teamShortName?: string
	opponentShortName?: string
	homeAway?: 'H' | 'A'
	score?: string
	isAuto?: boolean
}

export interface GridPlayer {
	id: string
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber?: number
	cellsByRoundId: Record<string, GridCell>
}

interface ProgressGridProps {
	rounds: GridRound[]
	players: GridPlayer[]
	aliveCount: number
	eliminatedCount: number
	pot: string
	defaultFilter?: 'all' | 'last5' | 'last3'
	gameId?: string
	onShare?: () => void
	showAdminActions?: boolean
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
}: ProgressGridProps) {
	const [filter, setFilter] = useState<'all' | 'last5' | 'last3'>(defaultFilter)
	const [showOpponents, setShowOpponents] = useState(false)
	const [hideEliminated, setHideEliminated] = useState(false)
	const liveCtx = useLiveGame()

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

	const sortedPlayers = [...players].sort((a, b) => {
		if (a.status === 'alive' && b.status !== 'alive') return -1
		if (a.status !== 'alive' && b.status === 'alive') return 1
		if (a.status === 'eliminated' && b.status === 'eliminated') {
			return (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0)
		}
		return a.name.localeCompare(b.name)
	})

	const visiblePlayers = hideEliminated
		? sortedPlayers.filter((p) => p.status !== 'eliminated')
		: sortedPlayers

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
						<Button variant="outline" size="sm" onClick={onShare} className="gap-1.5">
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
								<th className="text-left pb-3 pr-4 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[100px]">
									Player
								</th>
								{visibleRounds.map((r) => (
									<th
										key={r.id}
										className="font-medium text-muted-foreground text-center pb-3 px-1"
									>
										GW{r.number}
									</th>
								))}
								<th className="pb-3 pl-4 min-w-[80px] text-right">Status</th>
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
													<a
														href={`/game/${gameId}/pick?actingAs=${player.id}`}
														title={`Pick for ${player.name}`}
														className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted"
													>
														✎
													</a>
												)}
										</td>
										{visibleRounds.map((r) => {
											const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
											const bump = rowBump && r.id === bumpRoundId ? rowBump : null
											return (
												<td key={r.id} className="px-1 text-center align-middle">
													<GridCellView
														cell={cell}
														roundNumber={r.number}
														showOpponents={showOpponents}
														bump={bump}
													/>
												</td>
											)
										})}
										<td className="pl-4 text-right">
											{player.status === 'alive' ? (
												<span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded bg-[var(--alive-bg)] text-[var(--alive)]">
													alive
												</span>
											) : player.status === 'eliminated' ? (
												<span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded bg-[var(--eliminated-bg)] text-[var(--eliminated)]">
													GW{player.eliminatedRoundNumber}
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
		</div>
	)
}

function GridCellView({
	cell,
	roundNumber,
	showOpponents,
	bump,
}: {
	cell: GridCell
	roundNumber: number
	showOpponents: boolean
	bump?: 'up' | 'down' | null
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
	const opponentLabel = cell.opponentShortName
		? `${cell.homeAway === 'A' ? '@' : 'v'}${cell.opponentShortName}`
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
		? `${cell.teamShortName}${opponentPart}${scorePart}${resultPart}${autoPart} (GW${roundNumber})`
		: `GW${roundNumber}`

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						'relative inline-flex flex-col items-center justify-center rounded text-[0.7rem] font-bold cursor-help leading-tight',
						width,
						height,
						colour,
					)}
				>
					<span>{pickedLabel}</span>
					{showOpponents && opponentLabel && (
						<span className="text-[0.55rem] font-normal opacity-80">{opponentLabel}</span>
					)}
					{cell.isAuto && (
						<span className="absolute -right-0.5 -top-0.5 rounded-sm bg-amber-500 px-1 py-0 text-[8px] font-black uppercase tracking-wider text-white leading-none">
							AUTO
						</span>
					)}
					{bump && <BumpBadge kind={bump} />}
				</span>
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
