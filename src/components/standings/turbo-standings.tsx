'use client'

import { Clock, Flame, LayoutGrid, ListTree, Target } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type LadderFixture, TurboLadder } from './turbo-ladder'
import { TurboTimeline } from './turbo-timeline'

export interface TurboPickCell {
	rank: number
	homeShort: string
	awayShort: string
	prediction: 'home_win' | 'draw' | 'away_win'
	result: 'win' | 'loss' | 'pending' | 'hidden'
	opponentScore?: string
	goalsCounted: number
}

export interface TurboPlayerRow {
	id: string
	name: string
	picks: TurboPickCell[] // exactly numberOfPicks entries (or fewer if player hasn't submitted)
	streak: number
	goals: number
	hasSubmitted: boolean
}

export interface TurboRoundSummary {
	id: string
	number: number
	name: string
	status: 'open' | 'active' | 'completed'
	players: TurboPlayerRow[]
	fixtures: LadderFixture[]
}

interface TurboStandingsProps {
	rounds: TurboRoundSummary[]
	numberOfPicks: number
	onShare?: () => void
}

const _PRED_ABBREV = { home_win: 'H', draw: 'D', away_win: 'A' } as const

type ViewMode = 'ladder' | 'grid' | 'timeline'

export function TurboStandings({ rounds, numberOfPicks, onShare }: TurboStandingsProps) {
	const initial = rounds[rounds.length - 1]?.id
	const [roundId, setRoundId] = useState<string>(initial ?? '')
	const [view, setView] = useState<ViewMode>('ladder')
	const round = rounds.find((r) => r.id === roundId) ?? rounds[rounds.length - 1]

	if (!round) {
		return (
			<div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
				No turbo rounds yet.
			</div>
		)
	}

	const sortedPlayers = [...round.players].sort((a, b) => {
		if (b.streak !== a.streak) return b.streak - a.streak
		return b.goals - a.goals
	})

	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div className="p-4 md:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-border">
				<div>
					<h2 className="font-display text-2xl font-semibold">Standings</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{round.status === 'completed'
							? 'Round complete — final standings below.'
							: round.status === 'open'
								? 'Round open — picks hidden until the deadline passes.'
								: 'Round in play.'}
					</p>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<div className="flex gap-1 border border-border rounded-md p-0.5">
						<button
							type="button"
							onClick={() => setView('ladder')}
							className={cn(
								'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1',
								view === 'ladder'
									? 'bg-foreground text-background'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							<ListTree className="h-3 w-3" /> Ladder
						</button>
						<button
							type="button"
							onClick={() => setView('timeline')}
							className={cn(
								'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1',
								view === 'timeline'
									? 'bg-foreground text-background'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							<Clock className="h-3 w-3" /> Timeline
						</button>
						<button
							type="button"
							onClick={() => setView('grid')}
							className={cn(
								'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1',
								view === 'grid'
									? 'bg-foreground text-background'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							<LayoutGrid className="h-3 w-3" /> Grid
						</button>
					</div>
					{rounds.length > 1 && (
						<div className="flex gap-1 border border-border rounded-md p-0.5">
							{rounds.map((r) => (
								<button
									key={r.id}
									type="button"
									onClick={() => setRoundId(r.id)}
									className={cn(
										'text-xs font-semibold px-2.5 py-1 rounded',
										r.id === round.id
											? 'bg-foreground text-background'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									GW{r.number}
								</button>
							))}
						</div>
					)}
					{onShare && (
						<Button variant="outline" size="sm" onClick={onShare}>
							Share standings
						</Button>
					)}
				</div>
			</div>

			{view === 'ladder' && (
				<div className="p-4 md:p-5">
					<TurboLadder
						fixtures={round.fixtures}
						players={round.players}
						roundStatus={round.status}
					/>
				</div>
			)}

			{view === 'timeline' && (
				<div className="p-4 md:p-5 overflow-x-auto">
					<TurboTimeline fixtures={round.fixtures} players={round.players} />
				</div>
			)}

			{view === 'grid' && <GridView sortedPlayers={sortedPlayers} numberOfPicks={numberOfPicks} />}
		</div>
	)
}

function GridView({
	sortedPlayers,
	numberOfPicks,
}: {
	sortedPlayers: TurboPlayerRow[]
	numberOfPicks: number
}) {
	return (
		<TooltipProvider delayDuration={100}>
			<div className="overflow-x-auto p-4 md:p-5">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th className="text-left pb-3 pr-3 font-medium text-muted-foreground sticky left-0 bg-card z-10 w-10">
								#
							</th>
							<th className="text-left pb-3 pr-4 font-medium text-muted-foreground sticky left-10 bg-card z-10 min-w-[110px]">
								Player
							</th>
							<th className="text-center pb-3 px-2 font-medium text-muted-foreground">
								<span className="inline-flex items-center gap-1">
									<Flame className="h-3.5 w-3.5" /> Streak
								</span>
							</th>
							<th className="text-center pb-3 px-2 font-medium text-muted-foreground">
								<span className="inline-flex items-center gap-1">
									<Target className="h-3.5 w-3.5" /> Goals
								</span>
							</th>
							{Array.from({ length: numberOfPicks }, (_, i) => (
								<th
									// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
									key={i}
									className="font-medium text-muted-foreground text-center pb-3 px-1 min-w-[72px]"
								>
									#{i + 1}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{sortedPlayers.map((player, idx) => (
							<tr
								key={player.id}
								className={cn('border-t border-border', !player.hasSubmitted && 'opacity-60')}
							>
								<td className="py-2 pr-3 font-semibold text-muted-foreground sticky left-0 bg-card z-10">
									{idx + 1}
								</td>
								<td className="py-2 pr-4 font-medium whitespace-nowrap sticky left-10 bg-card z-10">
									{player.name}
									{!player.hasSubmitted && (
										<span className="ml-2 text-[0.65rem] font-semibold text-[var(--draw)] bg-[var(--draw-bg)] px-1.5 py-0.5 rounded">
											no picks
										</span>
									)}
								</td>
								<td className="text-center px-2 py-2 font-display font-semibold text-lg">
									{player.streak}
								</td>
								<td className="text-center px-2 py-2 text-muted-foreground">{player.goals}</td>
								{Array.from({ length: numberOfPicks }, (_, i) => {
									const cell = player.picks.find((c) => c.rank === i + 1)
									return (
										<td
											// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
											key={i}
											className="px-0.5 text-center"
										>
											<TurboCell cell={cell} />
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</TooltipProvider>
	)
}

function TurboCell({ cell }: { cell?: TurboPickCell }) {
	if (!cell) {
		return (
			<span className="inline-flex w-[68px] h-10 rounded bg-muted/40 border border-dashed border-border" />
		)
	}

	if (cell.result === 'hidden') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex items-center justify-center w-[68px] h-10 rounded border border-dashed border-border bg-muted/40 text-muted-foreground text-xs">
						🔒
					</span>
				</TooltipTrigger>
				<TooltipContent>
					<p className="text-xs">Hidden until deadline passes</p>
				</TooltipContent>
			</Tooltip>
		)
	}

	const colour =
		cell.result === 'win'
			? 'bg-[var(--alive)] text-white'
			: cell.result === 'loss'
				? 'bg-[var(--eliminated)] text-white'
				: 'bg-muted text-foreground'

	const resultLabel =
		cell.result === 'win' ? 'Correct' : cell.result === 'loss' ? 'Incorrect' : 'Pending'

	// Primary label: the team the player is backing (or "DRAW")
	const primary =
		cell.prediction === 'home_win'
			? cell.homeShort
			: cell.prediction === 'away_win'
				? cell.awayShort
				: 'DRAW'

	// Secondary line: the opponent / other team (or the fixture for draws)
	const secondary =
		cell.prediction === 'home_win'
			? `v ${cell.awayShort}`
			: cell.prediction === 'away_win'
				? `@ ${cell.homeShort}`
				: `${cell.homeShort}–${cell.awayShort}`

	const fixtureLabel = `${cell.homeShort} v ${cell.awayShort}`
	const predictionLabel =
		cell.prediction === 'home_win'
			? `${cell.homeShort} to win`
			: cell.prediction === 'away_win'
				? `${cell.awayShort} to win`
				: 'Draw'

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						'inline-flex flex-col items-center justify-center w-[68px] h-10 rounded text-[0.7rem] font-bold cursor-help leading-tight px-1',
						colour,
					)}
				>
					<span className={cell.prediction === 'draw' ? 'text-[0.65rem]' : ''}>{primary}</span>
					<span className="text-[0.55rem] font-medium opacity-85 truncate w-full text-center">
						{secondary}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>
				<p className="text-xs">
					#{cell.rank} · {fixtureLabel} · {predictionLabel} · {resultLabel}
					{cell.opponentScore ? ` (${cell.opponentScore})` : ''}
					{cell.result === 'win' && cell.goalsCounted > 0 ? ` · ${cell.goalsCounted} goals` : ''}
				</p>
			</TooltipContent>
		</Tooltip>
	)
}
