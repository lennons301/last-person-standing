import { cn } from '@/lib/utils'

export type FormResult = 'W' | 'D' | 'L'

interface FormDotsProps {
	results: FormResult[]
	size?: 'sm' | 'md'
	className?: string
}

const COLOURS = {
	W: 'bg-[var(--alive)] text-white',
	D: 'bg-[var(--draw)] text-white',
	L: 'bg-[var(--eliminated)] text-white',
}

const SIZES = {
	sm: 'w-3 h-3 text-[0.45rem]',
	md: 'w-4 h-4 text-[0.55rem]',
}

export function FormDots({ results, size = 'md', className }: FormDotsProps) {
	return (
		<div className={cn('flex gap-0.5', className)}>
			{results.map((r, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: form dots are stable per render
					key={i}
					className={cn(
						'rounded-sm flex items-center justify-center font-bold',
						SIZES[size],
						COLOURS[r],
					)}
				>
					{r}
				</span>
			))}
		</div>
	)
}
