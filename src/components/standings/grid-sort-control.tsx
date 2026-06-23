'use client'

import { cn } from '@/lib/utils'
import type { GridSortKey } from './grid-sort'

interface GridSortControlProps {
	value: GridSortKey
	onChange: (value: GridSortKey) => void
}

const OPTIONS: Array<{ value: GridSortKey; label: string }> = [
	{ value: 'status', label: 'Status' },
	{ value: 'goals', label: 'Goals' },
	{ value: 'name', label: 'Name' },
]

export function GridSortControl({ value, onChange }: GridSortControlProps) {
	return (
		<div className="flex items-center gap-1">
			<span className="text-xs text-muted-foreground mr-0.5">Sort</span>
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
					aria-pressed={value === opt.value}
					onClick={() => onChange(opt.value)}
					className={cn(
						'text-xs px-2 py-1 rounded-md border border-border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
						value === opt.value
							? 'bg-foreground text-background border-foreground'
							: 'bg-card text-muted-foreground hover:bg-muted',
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	)
}
