'use client'

import { Clock, Flame, LayoutGrid, ListTree, Target } from 'lucide-react'
import { useState } from 'react'
import { useLiveGame } from '@/components/live/use-live-game'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type LadderFixture, TurboLadder } from './turbo-ladder'
import { TurboTimeline } from './turbo-timeline'

const LIVE_RECENT_MS = 1500

interface TurboLiveMeta {
	viewerGamePlayerId: string | undefined
	viewerRowIsLive: boolean
	eliminatedGpIds: Set<string>
	recentGoalByFixture: Map<string, { side: 'home' | 'away' }>
	pickFixtureByPlayer: Map<string, Map<number, string>>
	pickSideByPlayer: Map<string, Map<number, 'home' | 'away' | null>>
}

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
	showAdminActions?: boolean
	gameId?: string
}

const _PRED_ABBREV = { home_win: 'H', draw: 'D', away_win: 'A' } as const

type ViewMode = 'ladder' | 'grid' | 'timeline'

export function TurboStandings({
	rounds,
	numberOfPicks,
	onShare,
	showAdminActions,
	gameId,
}: TurboStandingsProps) {
	const initial = rounds[rounds.length - 1]?.id
	const [roundId, setRoundId] = useState<string>(initial ?? '')
	const [view, setView] = useState<ViewMode>('ladder')
	const liveCtx = useLiveGame()
	const round = rounds.find((r) => r.id === roundId) ?? rounds[rounds.length - 1]

	// Build live metadata (hook must run unconditionally — compute before the early return).
	const liveMeta = buildTurboLiveMeta(liveCtx)

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

			{view === 'grid' && (
				<GridView
					sortedPlayers={sortedPlayers}
					numberOfPicks={numberOfPicks}
					liveMeta={liveMeta}
					showAdminActions={showAdminActions}
					gameId={gameId}
					roundStatus={round.status}
				/>
			)}
		</div>
	)
}

function buildTurboLiveMeta(liveCtx: ReturnType<typeof useLiveGame>): TurboLiveMeta {
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

	const pickFixtureByPlayer = new Map<string, Map<number, string>>()
	const pickSideByPlayer = new Map<string, Map<number, 'home' | 'away' | null>>()
	for (const pk of liveCtx.payload?.picks ?? []) {
		if (pk.confidenceRank == null) continue
		if (pk.fixtureId) {
			const inner = pickFixtureByPlayer.get(pk.gamePlayerId) ?? new Map<number, string>()
			inner.set(pk.confidenceRank, pk.fixtureId)
			pickFixtureByPlayer.set(pk.gamePlayerId, inner)
		}
		const sideInner =
			pickSideByPlayer.get(pk.gamePlayerId) ?? new Map<number, 'home' | 'away' | null>()
		const side: 'home' | 'away' | null =
			pk.predictedResult === 'home_win' ? 'home' : pk.predictedResult === 'away_win' ? 'away' : null
		sideInner.set(pk.confidenceRank, side)
		pickSideByPlayer.set(pk.gamePlayerId, sideInner)
	}

	return {
		viewerGamePlayerId: viewerGp?.id,
		viewerRowIsLive,
		eliminatedGpIds,
		recentGoalByFixture,
		pickFixtureByPlayer,
		pickSideByPlayer,
	}
}

function GridView({
	sortedPlayers,
	numberOfPicks,
	liveMeta,
	showAdminActions,
	gameId,
	roundStatus,
}: {
	sortedPlayers: TurboPlayerRow[]
	numberOfPicks: number
	liveMeta: TurboLiveMeta
	showAdminActions?: boolean
	gameId?: string
	roundStatus: TurboRoundSummary['status']
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
						{sortedPlayers.map((player, idx) => {
							const isViewer = liveMeta.viewerGamePlayerId === player.id
							const viewerLiveStyle = isViewer && liveMeta.viewerRowIsLive
							const liveEliminated = liveMeta.eliminatedGpIds.has(player.id)
							const pickFixtureByRank = liveMeta.pickFixtureByPlayer.get(player.id)
							const pickSideByRank = liveMeta.pickSideByPlayer.get(player.id)
							return (
								<tr
									key={player.id}
									className={cn(
										'border-t border-border',
										!player.hasSubmitted && 'opacity-60',
										viewerLiveStyle && 'bg-gradient-to-r from-primary/10 to-transparent',
										liveEliminated && 'opacity-45 transition-opacity duration-[400ms]',
									)}
								>
									<td className="py-2 pr-3 font-semibold text-muted-foreground sticky left-0 bg-card z-10">
										{idx + 1}
									</td>
									<td
										className={cn(
											'py-2 pr-4 font-medium whitespace-nowrap sticky left-10 bg-card z-10',
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
										{!player.hasSubmitted && (
											<span className="ml-2 text-[0.65rem] font-semibold text-[var(--draw)] bg-[var(--draw-bg)] px-1.5 py-0.5 rounded">
												no picks
											</span>
										)}
										{showAdminActions &&
											gameId &&
											!player.hasSubmitted &&
											roundStatus === 'open' && (
												<a
													href={`/game/${gameId}/pick?actingAs=${player.id}`}
													title={`Pick for ${player.name}`}
													className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted"
												>
													✎
												</a>
											)}
									</td>
									<td className="text-center px-2 py-2 font-display font-semibold text-lg">
										{player.streak}
									</td>
									<td className="text-center px-2 py-2 text-muted-foreground">{player.goals}</td>
									{Array.from({ length: numberOfPicks }, (_, i) => {
										const rank = i + 1
										const cell = player.picks.find((c) => c.rank === rank)
										const fixtureId = pickFixtureByRank?.get(rank)
										const recentGoal = fixtureId
											? liveMeta.recentGoalByFixture.get(fixtureId)
											: undefined
										const pickedSide = pickSideByRank?.get(rank)
										const bump = recentGoal
											? pickedSide && recentGoal.side === pickedSide
												? 'up'
												: 'down'
											: null
										return (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: rank columns are stable
												key={i}
												className="px-0.5 text-center"
											>
												<TurboCell cell={cell} bump={bump} />
											</td>
										)
									})}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</TooltipProvider>
	)
}

function TurboCell({ cell, bump }: { cell?: TurboPickCell; bump?: 'up' | 'down' | null }) {
	if (!cell) {
		return (
			<span className="relative inline-flex w-[68px] h-10 rounded bg-muted/40 border border-dashed border-border">
				{bump && <BumpBadge kind={bump} />}
			</span>
		)
	}

	if (cell.result === 'hidden') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="relative inline-flex items-center justify-center w-[68px] h-10 rounded border border-dashed border-border bg-muted/40 text-muted-foreground text-xs">
						🔒{bump && <BumpBadge kind={bump} />}
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
						'relative inline-flex flex-col items-center justify-center w-[68px] h-10 rounded text-[0.7rem] font-bold cursor-help leading-tight px-1',
						colour,
					)}
				>
					<span className={cell.prediction === 'draw' ? 'text-[0.65rem]' : ''}>{primary}</span>
					<span className="text-[0.55rem] font-medium opacity-85 truncate w-full text-center">
						{secondary}
					</span>
					{bump && <BumpBadge kind={bump} />}
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
