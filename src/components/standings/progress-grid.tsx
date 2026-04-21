'use client'

import { Eye, EyeOff, Share2, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { GridFilter } from './grid-filter'

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
}

export function ProgressGrid({
	rounds,
	players,
	aliveCount,
	eliminatedCount,
	defaultFilter = 'all',
	onShare,
}: ProgressGridProps) {
	const [filter, setFilter] = useState<'all' | 'last5' | 'last3'>(defaultFilter)
	const [showOpponents, setShowOpponents] = useState(false)
	const [hideEliminated, setHideEliminated] = useState(false)

	const visibleRounds =
		filter === 'all' ? rounds : filter === 'last5' ? rounds.slice(-5) : rounds.slice(-3)

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
							{visiblePlayers.map((player) => (
								<tr
									key={player.id}
									className={cn(
										'border-t border-border',
										player.status === 'eliminated' && 'opacity-50',
									)}
								>
									<td className="py-2 pr-4 font-medium whitespace-nowrap sticky left-0 bg-card z-10">
										{player.name}
									</td>
									{visibleRounds.map((r) => {
										const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
										return (
											<td key={r.id} className="px-1 text-center align-middle">
												<GridCellView
													cell={cell}
													roundNumber={r.number}
													showOpponents={showOpponents}
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
							))}
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
}: {
	cell: GridCell
	roundNumber: number
	showOpponents: boolean
}) {
	const width = showOpponents ? 'w-20' : 'w-12'
	const height = 'h-9'

	if (cell.result === 'empty') {
		return <span className={cn('inline-block', width, height)} />
	}
	if (cell.result === 'skull') {
		return (
			<span className={cn('inline-flex items-center justify-center text-lg', width, height)}>
				💀
			</span>
		)
	}
	if (cell.result === 'no_pick') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							'inline-flex flex-col items-center justify-center rounded bg-[var(--draw-bg)] text-[var(--draw)] font-bold leading-tight cursor-help',
							width,
							height,
						)}
					>
						<span className="text-sm">?</span>
						{showOpponents && <span className="text-[0.5rem] font-medium">No pick</span>}
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
							'inline-flex flex-col items-center justify-center rounded border border-dashed border-border bg-muted/40 text-muted-foreground leading-tight cursor-help',
							width,
							height,
						)}
					>
						<span className="text-xs">🔒</span>
						{showOpponents && <span className="text-[0.5rem] font-medium">Locked</span>}
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

	const colour = colours[cell.result] ?? 'bg-muted text-muted-foreground'

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
	const tooltipLabel = cell.teamShortName
		? `${cell.teamShortName}${opponentPart}${scorePart}${resultPart} (GW${roundNumber})`
		: `GW${roundNumber}`

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						'inline-flex flex-col items-center justify-center rounded text-[0.7rem] font-bold cursor-help leading-tight',
						width,
						height,
						colour,
					)}
				>
					<span>{pickedLabel}</span>
					{showOpponents && opponentLabel && (
						<span className="text-[0.55rem] font-normal opacity-80">{opponentLabel}</span>
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent>
				<p className="text-xs">{tooltipLabel}</p>
			</TooltipContent>
		</Tooltip>
	)
}
