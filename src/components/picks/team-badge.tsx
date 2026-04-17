import { getTeamColour } from '@/lib/teams/colours'
import { cn } from '@/lib/utils'

interface TeamBadgeProps {
	shortName: string
	size?: 'sm' | 'md' | 'lg'
	className?: string
}

const SIZES = {
	sm: 'w-5 h-5 text-[0.45rem]',
	md: 'w-7 h-7 text-[0.55rem]',
	lg: 'w-8 h-8 text-[0.6rem]',
}

export function TeamBadge({ shortName, size = 'md', className }: TeamBadgeProps) {
	return (
		<div
			className={cn(
				'rounded-full flex items-center justify-center font-bold text-white shrink-0',
				SIZES[size],
				className,
			)}
			style={{ backgroundColor: getTeamColour(shortName) }}
		>
			{shortName.toUpperCase()}
		</div>
	)
}
