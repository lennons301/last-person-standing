import { cn } from '@/lib/utils'

interface LivesSummaryProps {
	livesRemaining: number
	maxLives: number
	projectedGain: number
	className?: string
}

export function LivesSummary({
	livesRemaining,
	maxLives,
	projectedGain,
	className,
}: LivesSummaryProps) {
	const total = livesRemaining + projectedGain
	return (
		<div
			className={cn(
				'flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3',
				className,
			)}
		>
			<div>
				<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
					Lives
				</div>
				<div className="flex items-center gap-1 mt-1">
					{Array.from({ length: maxLives }, (_, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: stable index
							key={i}
							className={cn(
								'inline-block h-3.5 w-3.5 rounded-full',
								i < livesRemaining
									? 'bg-[#dc2626]'
									: 'bg-transparent ring-1 ring-inset ring-border',
							)}
						/>
					))}
					<span className="ml-2 text-xs text-muted-foreground">
						{livesRemaining} of {maxLives}
					</span>
				</div>
			</div>
			{projectedGain > 0 && (
				<div className="text-right">
					<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						If all correct
					</div>
					<div className="text-sm font-bold text-[var(--alive)]">
						+{projectedGain} → {total} lives
					</div>
				</div>
			)}
		</div>
	)
}
