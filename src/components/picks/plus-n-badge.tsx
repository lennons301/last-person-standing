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
				'inline-flex items-center rounded px-1.5 py-[1px] text-[10px] font-bold leading-none',
				strong ? 'bg-amber-100 text-amber-900' : 'bg-muted text-foreground/70',
				className,
			)}
		>
			+{value}
		</span>
	)
}
