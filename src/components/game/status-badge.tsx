import { cn } from '@/lib/utils'

type PlayerStatus = 'alive' | 'eliminated' | 'winner'

interface StatusBadgeProps {
	status: PlayerStatus
	className?: string
}

const STYLES: Record<PlayerStatus, string> = {
	alive: 'bg-[var(--alive-bg)] text-[var(--alive)]',
	eliminated: 'bg-[var(--eliminated-bg)] text-[var(--eliminated)]',
	winner: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300',
}

const LABELS: Record<PlayerStatus, string> = {
	alive: 'Alive',
	eliminated: 'Eliminated',
	winner: 'Winner',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
	return (
		<span
			className={cn(
				'text-xs font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide',
				STYLES[status],
				className,
			)}
		>
			{LABELS[status]}
		</span>
	)
}
