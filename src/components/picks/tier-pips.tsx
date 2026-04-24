import { cn } from '@/lib/utils'

interface TierPipsProps {
	value: 0 | 1 | 2 | 3 | 4 | 5
	max?: 3 | 5
	className?: string
}

export function TierPips({ value, max = 3, className }: TierPipsProps) {
	return (
		<span
			className={cn('inline-flex items-center gap-[2px]', className)}
			aria-label={`${value} of ${max} tier`}
			role="img"
		>
			{Array.from({ length: max }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable index
					key={i}
					className={cn(
						'inline-block h-2 w-2 rounded-full',
						i < value ? 'bg-foreground' : 'bg-transparent ring-1 ring-inset ring-border',
					)}
				/>
			))}
		</span>
	)
}
