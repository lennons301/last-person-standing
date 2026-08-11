import { cn } from '@/lib/utils'

interface PlusNBadgeProps {
	value: number
	className?: string
}

export function PlusNBadge({ value, className }: PlusNBadgeProps) {
	const strong = value >= 2
	return (
		<span
			className={cn(
				'inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold leading-tight',
				strong ? 'bg-amber-100 text-amber-900' : 'bg-muted text-foreground/70',
				className,
			)}
		>
			+{value}
		</span>
	)
}
