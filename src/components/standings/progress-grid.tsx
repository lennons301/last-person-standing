'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GridFilter } from './grid-filter'

export interface GridRound {
	id: string
	number: number
	name: string
}

export interface GridCell {
	result: 'win' | 'loss' | 'draw' | 'pending' | 'skull' | 'empty' | 'no_pick'
	teamShortName?: string
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
}

export function ProgressGrid({
	rounds,
	players,
	aliveCount,
	eliminatedCount,
	pot,
	defaultFilter = 'all',
}: ProgressGridProps) {
	const [filter, setFilter] = useState<'all' | 'last5' | 'last3'>(defaultFilter)

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

	return (
		<div>
			<div className="mb-2">
				<h3 className="font-display text-lg font-semibold">Progress</h3>
				<div className="flex gap-3 text-sm text-muted-foreground flex-wrap mt-1">
					<span className="flex items-center gap-1">
						<span className="w-2 h-2 rounded-full bg-[var(--alive)]" /> {aliveCount} alive
					</span>
					<span className="flex items-center gap-1">
						<span className="w-2 h-2 rounded-full bg-[var(--eliminated)]" /> {eliminatedCount}{' '}
						eliminated
					</span>
					<span className="font-display font-semibold text-foreground">£{pot} pot</span>
				</div>
			</div>

			<div className="mb-3">
				<GridFilter value={filter} onChange={setFilter} />
			</div>

			<div className="overflow-x-auto">
				<table className="w-full border-collapse text-xs">
					<thead>
						<tr>
							<th className="text-left pb-2 pr-2 font-medium text-muted-foreground sticky left-0 bg-background">
								Player
							</th>
							{visibleRounds.map((r) => (
								<th key={r.id} className="font-medium text-muted-foreground text-center px-1 pb-2">
									{r.number}
								</th>
							))}
							<th className="pb-2" />
						</tr>
					</thead>
					<tbody>
						{sortedPlayers.map((player) => (
							<tr
								key={player.id}
								className={cn(
									'border-t border-border',
									player.status === 'eliminated' && 'opacity-40',
								)}
							>
								<td className="py-1 pr-2 font-medium whitespace-nowrap sticky left-0 bg-background">
									{player.name}
								</td>
								{visibleRounds.map((r) => {
									const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
									return (
										<td key={r.id} className="px-0.5 text-center">
											<GridCellCmp cell={cell} />
										</td>
									)
								})}
								<td className="pl-2">
									{player.status === 'alive' ? (
										<span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded bg-[var(--alive-bg)] text-[var(--alive)]">
											alive
										</span>
									) : player.status === 'eliminated' ? (
										<span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded bg-[var(--eliminated-bg)] text-[var(--eliminated)]">
											GW{player.eliminatedRoundNumber}
										</span>
									) : (
										<span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-900">
											won
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

function GridCellCmp({ cell }: { cell: GridCell }) {
	if (cell.result === 'empty') {
		return <span className="inline-block w-7 h-5" />
	}
	if (cell.result === 'skull') {
		return <span className="inline-block w-7 text-base">💀</span>
	}
	if (cell.result === 'no_pick') {
		return (
			<span className="inline-flex items-center justify-center w-7 h-5 rounded bg-[var(--draw)] text-white text-[0.6rem] font-bold">
				?
			</span>
		)
	}
	const colours = {
		win: 'bg-[var(--alive)] text-white',
		loss: 'bg-[var(--eliminated)] text-white',
		draw: 'bg-[var(--draw)] text-white',
		pending: 'bg-[var(--accent)] text-white',
	}
	return (
		<span
			className={cn(
				'inline-flex items-center justify-center w-7 h-5 rounded text-[0.55rem] font-bold',
				colours[cell.result],
			)}
		>
			{cell.teamShortName ?? '?'}
		</span>
	)
}
