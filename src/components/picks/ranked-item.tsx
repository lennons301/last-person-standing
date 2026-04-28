'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Prediction } from './prediction-buttons'
import { TeamBadge } from './team-badge'

export interface RankedPick {
	id: string
	rank: number
	fixtureId: string
	homeTeam: { shortName: string; name: string; badgeUrl?: string | null }
	awayTeam: { shortName: string; name: string; badgeUrl?: string | null }
	prediction: Prediction
}

interface RankedItemProps {
	pick: RankedPick
	isFirst: boolean
	isLast: boolean
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
	onChangePrediction: () => void
}

const PRED_LABEL: Record<Prediction, string> = {
	home_win: 'HOME',
	draw: 'DRAW',
	away_win: 'AWAY',
}

const PRED_COLOUR: Record<Prediction, string> = {
	home_win: 'bg-[var(--accent)] text-white',
	draw: 'bg-[var(--draw)] text-white',
	away_win: 'bg-[var(--eliminated)] text-white',
}

export function RankedItem({
	pick,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	onRemove,
	onChangePrediction,
}: RankedItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: pick.id,
	})

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				'flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2.5 mb-1.5',
				isDragging && 'opacity-50 border-dashed',
			)}
		>
			<button
				type="button"
				{...attributes}
				{...listeners}
				className="text-muted-foreground p-1 cursor-grab touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
				style={{ touchAction: 'none' }}
				aria-label="Drag to reorder"
			>
				<GripVertical className="h-5 w-5" />
			</button>
			<div
				className={cn(
					'w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-background shrink-0',
					pick.rank <= 3 ? 'bg-[var(--alive)]' : 'bg-foreground',
				)}
			>
				{pick.rank}
			</div>
			<div className="flex items-center gap-2 flex-1 min-w-0">
				<TeamBadge
					shortName={pick.homeTeam.shortName}
					badgeUrl={pick.homeTeam.badgeUrl}
					size="md"
				/>
				<span className="font-semibold text-sm truncate">{pick.homeTeam.name}</span>
				<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide px-1">
					vs
				</span>
				<span className="font-semibold text-sm truncate">{pick.awayTeam.name}</span>
				<TeamBadge
					shortName={pick.awayTeam.shortName}
					badgeUrl={pick.awayTeam.badgeUrl}
					size="md"
				/>
			</div>
			<button
				type="button"
				onClick={onChangePrediction}
				className={cn(
					'text-xs font-bold px-2.5 py-1 rounded shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
					PRED_COLOUR[pick.prediction],
				)}
			>
				{PRED_LABEL[pick.prediction]}
			</button>
			<div className="flex flex-col gap-0.5 shrink-0">
				<button
					type="button"
					onClick={onMoveUp}
					disabled={isFirst}
					className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Move up"
				>
					<ChevronUp className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onMoveDown}
					disabled={isLast}
					className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					aria-label="Move down"
				>
					<ChevronDown className="h-3.5 w-3.5" />
				</button>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-[var(--eliminated)] p-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				aria-label="Remove"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	)
}
