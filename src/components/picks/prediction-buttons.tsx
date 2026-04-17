'use client'

import { cn } from '@/lib/utils'

export type Prediction = 'home_win' | 'draw' | 'away_win'

interface PredictionButtonsProps {
	value?: Prediction | null
	onChange: (value: Prediction) => void
	size?: 'sm' | 'md'
}

const LABELS: Record<Prediction, string> = {
	home_win: 'Home',
	draw: 'Draw',
	away_win: 'Away',
}

const COLOURS: Record<Prediction, string> = {
	home_win: 'bg-[var(--accent)] text-white border-[var(--accent)]',
	draw: 'bg-[var(--draw)] text-white border-[var(--draw)]',
	away_win: 'bg-[var(--eliminated)] text-white border-[var(--eliminated)]',
}

export function PredictionButtons({ value, onChange, size = 'md' }: PredictionButtonsProps) {
	const sizeClass = size === 'sm' ? 'text-xs py-1.5' : 'text-sm py-2'
	return (
		<div className="flex gap-1.5">
			{(['home_win', 'draw', 'away_win'] as const).map((pred) => (
				<button
					key={pred}
					type="button"
					onClick={() => onChange(pred)}
					className={cn(
						'flex-1 rounded-md border font-semibold transition-colors',
						sizeClass,
						value === pred
							? COLOURS[pred]
							: 'bg-card text-muted-foreground border-border hover:bg-muted',
					)}
				>
					{LABELS[pred]}
				</button>
			))}
		</div>
	)
}
