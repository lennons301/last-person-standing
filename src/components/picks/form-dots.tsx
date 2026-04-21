import { cn } from '@/lib/utils'

export type FormResult = 'W' | 'D' | 'L'

interface FormDotsProps {
	results: FormResult[]
	size?: 'sm' | 'md' | 'lg'
	className?: string
}

const COLOURS = {
	W: 'bg-[var(--alive)] text-white',
	D: 'bg-[var(--draw)] text-white',
	L: 'bg-[var(--eliminated)] text-white',
}

const SIZES = {
	sm: 'w-4 h-4 text-[0.55rem]',
	md: 'w-5 h-5 text-[0.65rem]',
	lg: 'w-6 h-6 text-xs',
}

export function FormDots({ results, size = 'md', className }: FormDotsProps) {
	return (
		<div className={cn('flex gap-1', className)}>
			{results.map((r, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: form dots are stable per render
					key={i}
					className={cn(
						'rounded flex items-center justify-center font-bold',
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
