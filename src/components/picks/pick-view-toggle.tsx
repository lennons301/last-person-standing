'use client'

import type { PickView } from '@/lib/game/pick-table-view'
import { cn } from '@/lib/utils'

/**
 * Fixtures ⇄ Table. Two readings of the same round — the matches, or the teams
 * in them ranked — so it's a segmented control rather than two links: the
 * player is switching lens, not navigating.
 *
 * Shared by classic and turbo, which offer the same two lenses over the same
 * board and differ only in what a row commits.
 *
 * Callers hide it entirely when the round has no standings behind it (see
 * `pickTableHasStandings`): a Table view of a competition with no table is an
 * empty board, and an empty board is worse than no toggle.
 */
export function PickViewToggle({
	view,
	onChange,
}: {
	view: PickView
	onChange: (next: PickView) => void
}) {
	return (
		<fieldset className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 mb-2">
			<legend className="sr-only">Pick view</legend>
			{(['fixtures', 'table'] as const).map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => onChange(option)}
					aria-pressed={view === option}
					className={cn(
						'px-3 py-1.5 text-xs font-semibold rounded-md capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
						view === option
							? 'bg-card text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					{option}
				</button>
			))}
		</fieldset>
	)
}
