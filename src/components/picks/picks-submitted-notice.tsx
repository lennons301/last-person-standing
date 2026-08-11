import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Picks locked in" / "Unsaved changes" — the state of the viewer's submission
 * relative to what's currently on screen, for the ranked-prediction modes.
 *
 * Purely presentational, and split out of `TurboPick` for the reason AGENTS.md
 * gives: the dirty state only exists after a reorder, so a fixture-driven
 * gallery can't reach it by mounting the picker. `/preview/picks` renders both
 * states from here directly.
 */
export function PicksSubmittedNotice({ dirty }: { dirty: boolean }) {
	return (
		<div
			className={cn(
				'mb-4 rounded-lg border px-4 py-3 flex items-start gap-3',
				dirty
					? 'border-[var(--draw)]/60 bg-[var(--draw-bg)]'
					: 'border-[var(--alive)]/40 bg-[var(--alive-bg)]',
			)}
		>
			{dirty ? (
				<AlertCircle className="h-5 w-5 text-[var(--draw)] shrink-0 mt-0.5" />
			) : (
				<CheckCircle2 className="h-5 w-5 text-[var(--alive)] shrink-0 mt-0.5" />
			)}
			<div className="flex-1">
				<div
					className={cn(
						'font-semibold text-sm',
						dirty ? 'text-[var(--draw)]' : 'text-[var(--alive)]',
					)}
				>
					{dirty ? 'Unsaved changes' : 'Picks locked in'}
				</div>
				<p className="text-xs text-muted-foreground mt-0.5">
					{dirty
						? 'Resubmit to update your picks. Previous submission stays active until you do.'
						: 'Your picks are in. Reorder, change predictions, or remove before the deadline — then resubmit.'}
				</p>
			</div>
		</div>
	)
}
