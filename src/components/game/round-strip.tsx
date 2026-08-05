import { Clock } from 'lucide-react'
import { LocalDateTime } from '@/components/local-datetime'

export interface RoundStripInfo {
	label: string // short, e.g. "GW36" / "MD1" / "R16"
	longLabel: string // long, e.g. "Gameweek 36" / "Matchday 1"
	deadline: Date | null
	deadlinePassed: boolean
	roundCompleted: boolean
}

/**
 * Standalone round label + deadline, for the states where no hero renders and
 * therefore nothing else on the page says which round you're looking at
 * (`GameViewDescriptor.demote.roundStrip` false). Lifted out of the retired
 * header card unchanged — later tickets in the hierarchy redesign fold these
 * states into hero variants of their own, at which point this can go.
 */
export function RoundStrip({ round }: { round: RoundStripInfo }) {
	return (
		<div className="mb-4 md:mb-6 flex items-center gap-3 rounded-xl border border-border bg-card px-4 md:px-5 py-2.5 md:py-3">
			<RoundStatusPill deadlinePassed={round.deadlinePassed} completed={round.roundCompleted} />
			<div className="min-w-0">
				<div className="font-display text-sm font-semibold leading-tight">{round.longLabel}</div>
				<div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
					<Clock aria-hidden className="h-3 w-3" />
					{round.deadline ? (
						<>
							Deadline{' '}
							<LocalDateTime
								date={round.deadline}
								options={{
									weekday: 'short',
									day: 'numeric',
									month: 'short',
									hour: '2-digit',
									minute: '2-digit',
								}}
							/>
						</>
					) : (
						<>Deadline TBC</>
					)}
				</div>
			</div>
		</div>
	)
}

function RoundStatusPill({
	deadlinePassed,
	completed,
}: {
	deadlinePassed: boolean
	completed: boolean
}) {
	if (completed) {
		return (
			<span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-muted text-muted-foreground">
				Completed
			</span>
		)
	}
	if (deadlinePassed) {
		return (
			<span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-[var(--draw-bg)] text-[var(--draw)]">
				Locked
			</span>
		)
	}
	return (
		<span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-[var(--alive-bg)] text-[var(--alive)]">
			Open
		</span>
	)
}
