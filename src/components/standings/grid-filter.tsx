'use client'

import { cn } from '@/lib/utils'

type Filter = 'all' | 'last5' | 'last3'

interface GridFilterProps {
	value: Filter
	onChange: (value: Filter) => void
}

const OPTIONS: Array<{ value: Filter; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'last5', label: 'Last 5' },
	{ value: 'last3', label: 'Last 3' },
]

export function GridFilter({ value, onChange }: GridFilterProps) {
	return (
		<div className="flex gap-1">
			{OPTIONS.map((opt) => (
				<button
					key={opt.value}
					type="button"
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
