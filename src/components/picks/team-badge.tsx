import Image from 'next/image'
import { getTeamColour } from '@/lib/teams/colours'
import { cn } from '@/lib/utils'

interface TeamBadgeProps {
	shortName: string
	badgeUrl?: string | null
	size?: 'sm' | 'md' | 'lg' | 'xl'
	className?: string
}

const SIZES = {
	sm: { wrapper: 'w-5 h-5 text-[0.45rem]', px: 20 },
	md: { wrapper: 'w-7 h-7 text-[0.55rem]', px: 28 },
	lg: { wrapper: 'w-10 h-10 text-xs', px: 40 },
	xl: { wrapper: 'w-14 h-14 text-sm', px: 56 },
}

export function TeamBadge({ shortName, badgeUrl, size = 'md', className }: TeamBadgeProps) {
	const { wrapper, px } = SIZES[size]

	if (badgeUrl) {
		return (
			<div
				className={cn('relative flex items-center justify-center shrink-0', wrapper, className)}
				style={{ width: px, height: px }}
			>
				<Image
					src={badgeUrl}
					alt={`${shortName} badge`}
					width={px}
					height={px}
					className="object-contain"
					style={{ width: px, height: px, maxWidth: px, maxHeight: px }}
					unoptimized
				/>
			</div>
		)
	}

	return (
		<div
			className={cn(
				'rounded-full flex items-center justify-center font-bold text-white shrink-0',
				wrapper,
				className,
			)}
			style={{ backgroundColor: getTeamColour(shortName), width: px, height: px }}
		>
			{shortName.toUpperCase()}
		</div>
	)
}
