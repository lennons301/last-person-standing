'use client'

import { Clock, LayoutGrid, ListTree, Lock, UserCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Disclosure } from '@/components/ui/disclosure'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import { cn } from '@/lib/utils'
import { CupGrid } from './cup-grid'
import { CupLadder } from './cup-ladder'
import { CupTimeline } from './cup-timeline'

type ViewMode = 'ladder' | 'grid' | 'timeline'

interface CupStandingsProps {
	data: CupLadderData
	onShare?: () => void
	showAdminActions?: boolean
	gameId?: string
}

export function CupStandings({ data, onShare, showAdminActions, gameId }: CupStandingsProps) {
	const [view, setView] = useState<ViewMode>('ladder')
	const isPreDeadline = data.roundStatus === 'open'
	const submittedCount = data.players.filter((p) => p.hasSubmitted).length
	const totalCount = data.players.length

	return (
		<Disclosure
			bordered
			defaultOpen
			title="Standings"
			subtitle={
				data.roundStatus === 'completed'
					? 'Round complete'
					: isPreDeadline
						? `${submittedCount} of ${totalCount} ${submittedCount === 1 ? 'player has' : 'players have'} picked`
						: 'Round in play'
			}
			rightSlot={
				onShare ? (
					<button
						type="button"
						onClick={onShare}
						className="text-xs font-semibold px-3 py-1 rounded border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Share
					</button>
				) : undefined
			}
		>
			{isPreDeadline ? (
				<PreDeadlinePicksStatus data={data} />
			) : (
				<>
					<div className="px-4 md:px-5 pt-3 flex flex-wrap items-center gap-2">
						<div className="flex gap-1 border border-border rounded-md p-0.5">
							{(['ladder', 'timeline', 'grid'] as const).map((m) => (
								<button
									key={m}
									type="button"
									onClick={() => setView(m)}
									className={cn(
										'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
										view === m
											? 'bg-foreground text-background'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									{m === 'ladder' && <ListTree className="h-3 w-3" />}
									{m === 'timeline' && <Clock className="h-3 w-3" />}
									{m === 'grid' && <LayoutGrid className="h-3 w-3" />}
									{m[0].toUpperCase() + m.slice(1)}
								</button>
							))}
						</div>
					</div>
					<div className="p-4 md:p-5">
						{view === 'ladder' && (
							<CupLadder data={data} showAdminActions={showAdminActions} gameId={gameId} />
						)}
						{view === 'grid' && (
							<CupGrid data={data} showAdminActions={showAdminActions} gameId={gameId} />
						)}
						{view === 'timeline' && (
							<div className="overflow-x-auto">
								<CupTimeline data={data} />
							</div>
						)}
					</div>
				</>
			)}
		</Disclosure>
	)
}

/**
 * Pre-deadline view: a compact "who's picked" status with a padlock per
 * player who's submitted. Mirrors the classic-mode pre-deadline grid —
 * the full ladder is irrelevant before the deadline because everyone's
 * picks are hidden anyway. Viewer can peek at the full ladder via the
 * inner "Show full standings" disclosure.
 */
function PreDeadlinePicksStatus({ data }: { data: CupLadderData }) {
	const submitted = data.players.filter((p) => p.hasSubmitted)
	const pending = data.players.filter((p) => !p.hasSubmitted)
	const ordered = [...submitted, ...pending]

	return (
		<div className="p-4 md:p-5 space-y-3">
			<div className="grid gap-2 sm:grid-cols-2">
				{ordered.map((p) => (
					<div
						key={p.id}
						className={cn(
							'flex items-center gap-2 rounded-md border px-3 py-2',
							p.hasSubmitted
								? 'border-[var(--alive-bg)] bg-[var(--alive-bg)]/40'
								: 'border-dashed border-border bg-muted/20',
						)}
					>
						<UserCircle2
							className={cn(
								'h-5 w-5 shrink-0',
								p.hasSubmitted ? 'text-[var(--alive)]' : 'text-muted-foreground',
							)}
							aria-hidden
						/>
						<span className="text-sm font-medium truncate flex-1">{p.name}</span>
						{p.hasSubmitted ? (
							<span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--alive)]">
								<Lock className="h-3 w-3" aria-hidden /> Locked
							</span>
						) : (
							<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
								No picks
							</span>
						)}
					</div>
				))}
			</div>
		</div>
	)
}
