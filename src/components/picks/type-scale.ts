import { cn } from '@/lib/utils'

/**
 * The pick selector's type scale. Three steps, deliberately, replacing the
 * ad-hoc pile of `text-[9px]` / `[10px]` / `[11px]` / `[0.7rem]` micro sizes the
 * pick surfaces used to carry. Everything in a pick row (`FixtureRow`, the
 * turbo ranked list, and their sub-components) picks one:
 *
 * - `name`     — a team name. The primary affordance: the largest and only
 *                bold-dark type in a row, whether that row is a fixture you can
 *                pick or a prediction you already ranked.
 * - `meta`     — secondary metadata: kickoff, "vs", league position, counts.
 * - `chip`     — status chips (CURRENT / TENTATIVE / AUTO / USED, +N lives,
 *                HOME / DRAW / AWAY) and the tier strip. Never allowed to
 *                compete with a team name, so these stay muted unless the state
 *                itself is the message.
 *
 * `text-2xs` is a real scale step declared in `globals.css`, not an arbitrary
 * bracket value.
 *
 * Lives in its own module rather than in `fixture-row.tsx` because the ranked
 * list is a peer of the fixture row, not a child of it: both lists sit on the
 * turbo picker at once, and a team name has to read identically in each.
 */
export const TYPE = {
	name: 'text-base sm:text-lg font-semibold leading-tight',
	meta: 'text-xs leading-tight',
	chip: 'text-2xs font-semibold',
} as const

/** Shared chip shell — colour comes from the caller, geometry from here. */
export const CHIP = cn(
	TYPE.chip,
	'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 max-w-full uppercase tracking-wide',
)

/**
 * Section heading for the picker's lists ("Your predictions", "Remaining
 * fixtures"). One treatment, so two sibling lists of equal rank stop announcing
 * themselves at two different weights — the round title itself belongs to the
 * game hero, not here.
 */
export const SECTION_HEADING = 'font-display text-base font-semibold'
