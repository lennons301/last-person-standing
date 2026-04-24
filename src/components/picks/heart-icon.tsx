import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeartIconProps {
	className?: string
	size?: number
}

export function HeartIcon({ className, size = 14 }: HeartIconProps) {
	return (
		<Heart
			className={cn('fill-[#dc2626] text-[#dc2626] shrink-0', className)}
			size={size}
			aria-label="life-earning fixture"
			role="img"
		/>
	)
}
