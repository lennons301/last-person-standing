'use client'

import { Clock, LayoutGrid, ListTree } from 'lucide-react'
import { useState } from 'react'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import type { LivePayload } from '@/lib/live/types'
import { cn } from '@/lib/utils'
import { CupGrid } from './cup-grid'
import { CupLadder } from './cup-ladder'
import { CupTimeline } from './cup-timeline'

type ViewMode = 'ladder' | 'grid' | 'timeline'

interface CupStandingsProps {
	data: CupLadderData
	onShare?: () => void
	live?: LivePayload
}

export function CupStandings({ data, onShare, live }: CupStandingsProps) {
	const [view, setView] = useState<ViewMode>('ladder')
	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div className="p-4 md:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-border">
				<div>
					<h2 className="font-display text-2xl font-semibold">Standings</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{data.roundStatus === 'completed'
							? 'Round complete.'
							: data.roundStatus === 'open'
								? 'Round open — picks hidden until the deadline passes.'
								: 'Round in play.'}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex gap-1 border border-border rounded-md p-0.5">
						{(['ladder', 'timeline', 'grid'] as const).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setView(m)}
								className={cn(
									'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1',
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
					{onShare && (
						<button
							type="button"
							onClick={onShare}
							className="text-xs font-semibold px-3 py-1 rounded border border-border"
						>
							Share
						</button>
					)}
				</div>
			</div>
			<div className="p-4 md:p-5">
				{view === 'ladder' && <CupLadder data={data} live={live} />}
				{view === 'grid' && <CupGrid data={data} live={live} />}
				{view === 'timeline' && <CupTimeline data={data} live={live} />}
			</div>
		</div>
	)
}
