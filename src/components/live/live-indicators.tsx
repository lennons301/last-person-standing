import { cn } from '@/lib/utils'

export function LiveDot({ className }: { className?: string }) {
	return (
		<span
			role="img"
			aria-label="live"
			className={cn(
				'inline-block h-1.5 w-1.5 rounded-full bg-current',
				'animate-[pulse_1.4s_ease-in-out_infinite]',
				className,
			)}
		/>
	)
}

export function ReconnectingChip() {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
			<span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-[pulse_1.4s_ease-in-out_infinite]" />
			Reconnecting…
		</span>
	)
}
