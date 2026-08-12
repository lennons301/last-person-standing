import type { PositionPoint } from '@/lib/game/standings-snapshot'
import { cn } from '@/lib/utils'
import { ordinal } from './ordinal'

interface PositionLineProps {
	/** Oldest matchday first. */
	points: PositionPoint[]
	/** Teams in the table — the bottom of the axis. Falls back to the worst
	 * position seen when we have no snapshot-derived size yet. */
	tableSize?: number | null
	className?: string
}

// Chart geometry, in viewBox units. The SVG scales uniformly to its container,
// so these are ratios in practice, not pixels.
const W = 320
const H = 132
const PAD = { top: 10, right: 10, bottom: 18, left: 26 }

/**
 * League position across the season, 1st at the top.
 *
 * The x-axis is **matches played**, not the competition's round number: the
 * snapshot is keyed that way (postponements leave clubs on different game
 * counts), and it's also what makes a sparse series honest — a line that
 * starts at matchday 9 is saying "this is where our record begins", which is
 * exactly true, because the snapshot accumulates from deployment onward with
 * no backfill.
 *
 * Three states, all of them deliberate:
 * - nothing recorded → a sentence saying so, no empty axes pretending to be a
 *   chart;
 * - one matchday → the single point, drawn as a point (no line through one
 *   observation);
 * - two or more → the line.
 */
export function PositionLine({ points, tableSize, className }: PositionLineProps) {
	if (points.length === 0) {
		return (
			<p className={cn('text-sm text-muted-foreground', className)}>
				No position history yet — the line starts from the first matchday we record.
			</p>
		)
	}

	const worst = Math.max(...points.map((p) => p.position))
	const bottom = Math.max(tableSize ?? 0, worst, 2)
	const lastMatchday = Math.max(...points.map((p) => p.matchday))
	const firstMatchday = Math.min(...points.map((p) => p.matchday))
	// A single-matchday series has no span to scale across; give it one so the
	// point lands in the middle rather than on the left edge.
	const spanStart = firstMatchday === lastMatchday ? firstMatchday - 1 : firstMatchday
	const spanEnd = firstMatchday === lastMatchday ? firstMatchday + 1 : lastMatchday

	const x = (matchday: number) =>
		PAD.left + ((matchday - spanStart) / (spanEnd - spanStart)) * (W - PAD.left - PAD.right)
	const y = (position: number) =>
		PAD.top + ((position - 1) / Math.max(bottom - 1, 1)) * (H - PAD.top - PAD.bottom)

	const path = points.map((p) => `${x(p.matchday)},${y(p.position)}`).join(' ')
	const latest = points[points.length - 1]
	const best = Math.min(...points.map((p) => p.position))

	return (
		<div className={className}>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full h-auto text-foreground"
				role="img"
				aria-label={`League position by matchday: ${ordinal(latest.position)} after ${latest.matchday} played, best ${ordinal(best)}, worst ${ordinal(worst)}`}
			>
				<title>League position by matchday</title>
				{/* Top and bottom of the table, so a position reads against the
				    league's shape rather than floating in space. */}
				{[1, bottom].map((position) => (
					<g key={position}>
						<line
							x1={PAD.left}
							x2={W - PAD.right}
							y1={y(position)}
							y2={y(position)}
							className="stroke-border"
							strokeWidth={1}
						/>
						<text
							x={PAD.left - 5}
							y={y(position) + 3}
							textAnchor="end"
							className="fill-muted-foreground text-2xs font-mono"
						>
							{position}
						</text>
					</g>
				))}

				{points.length > 1 && (
					<polyline
						points={path}
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				)}
				{points.map((p) => (
					<circle
						key={p.matchday}
						cx={x(p.matchday)}
						cy={y(p.position)}
						r={p.matchday === latest.matchday ? 3.5 : 2}
						fill="currentColor"
					/>
				))}

				{/* Matchday endpoints only. Every tick would be unreadable at this
				    size, and the two that matter are where the record starts and
				    where it has got to. */}
				<text
					x={PAD.left}
					y={H - 5}
					textAnchor="start"
					className="fill-muted-foreground text-2xs font-mono"
				>
					MD{firstMatchday}
				</text>
				{lastMatchday !== firstMatchday && (
					<text
						x={W - PAD.right}
						y={H - 5}
						textAnchor="end"
						className="fill-muted-foreground text-2xs font-mono"
					>
						MD{lastMatchday}
					</text>
				)}
			</svg>
			<p className="text-xs text-muted-foreground mt-1">
				{ordinal(latest.position)} after {latest.matchday} played · best {ordinal(best)} · worst{' '}
				{ordinal(worst)}
			</p>
		</div>
	)
}
