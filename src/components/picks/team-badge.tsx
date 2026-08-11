import Image from 'next/image'
import { getTeamColour } from '@/lib/teams/colours'
import { cn } from '@/lib/utils'

interface TeamBadgeProps {
	shortName: string
	badgeUrl?: string | null
	size?: 'sm' | 'md' | 'lg' | 'xl'
	/**
	 * When true, render one size smaller below the `sm` breakpoint. Used on
	 * tight contexts (planner pick-ahead, card-in-card layouts) where the
	 * default `lg` badge eats half the available row width on phones.
	 */
	responsive?: boolean
	className?: string
}

// `box` is the badge geometry; `text` sizes the initials fallback and is locked
// to the box diameter (three characters inside a 20px circle need 7px type), so
// it deliberately sits outside the shared type scale — and is only applied on
// the fallback branch, where there is actually text.
const SIZES = {
	sm: { box: 'w-5 h-5', text: 'text-[0.45rem]', px: 20 },
	md: { box: 'w-7 h-7', text: 'text-[0.55rem]', px: 28 },
	lg: { box: 'w-10 h-10', text: 'text-xs', px: 40 },
	xl: { box: 'w-14 h-14', text: 'text-sm', px: 56 },
}

const SMALLER: Record<'sm' | 'md' | 'lg' | 'xl', 'sm' | 'md' | 'lg' | 'xl'> = {
	sm: 'sm',
	md: 'sm',
	lg: 'md',
	xl: 'lg',
}

export function TeamBadge({
	shortName,
	badgeUrl,
	size = 'md',
	responsive = false,
	className,
}: TeamBadgeProps) {
	if (responsive) {
		// Render two badges and toggle visibility — keeps each badge's <Image>
		// pinned to its own px dimensions without runtime media query JS.
		return (
			<>
				<TeamBadge
					shortName={shortName}
					badgeUrl={badgeUrl}
					size={SMALLER[size]}
					className={cn('sm:hidden', className)}
				/>
				<TeamBadge
					shortName={shortName}
					badgeUrl={badgeUrl}
					size={size}
					className={cn('hidden sm:flex', className)}
				/>
			</>
		)
	}
	const { box, text, px } = SIZES[size]

	if (badgeUrl) {
		return (
			<div
				className={cn('relative flex items-center justify-center shrink-0', box, className)}
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
				box,
				text,
				className,
			)}
			style={{ backgroundColor: getTeamColour(shortName), width: px, height: px }}
		>
			{shortName.toUpperCase()}
		</div>
	)
}
