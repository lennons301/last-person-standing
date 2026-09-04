'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FixtureTeamInfo } from '@/lib/game/pick-view-types'
import { cn } from '@/lib/utils'
import type { FormSheetRenderer } from './fixture-row'
import type { Prediction } from './prediction-buttons'
import { TeamBadge } from './team-badge'
import { TeamFormSheet } from './team-form-sheet'
import { CHIP, TYPE } from './type-scale'

export interface RankedPick {
	id: string
	rank: number
	fixtureId: string
	/**
	 * The two sides, in the shape every other pick surface reads them in. A
	 * ranked row draws only the badge and the name, but the form sheet it taps
	 * through to is handed the whole team — so a team that hasn't played yet is
	 * one the sheet can tell apart from one whose form nobody passed on.
	 */
	homeTeam: FixtureTeamInfo
	awayTeam: FixtureTeamInfo
	prediction: Prediction
}

interface RankedItemProps {
	pick: RankedPick
	isFirst: boolean
	isLast: boolean
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
	onChangePrediction: () => void
	// Required for the form-detail sheet — the same sheet the unranked fixture
	// list opens. Without one of these (or `renderFormSheet`) the team names stay
	// plain text, as they were before ranked items gained the tap-through.
	competitionId?: string
	roundNumber?: number
	/**
	 * Overrides how the form-detail sheet is rendered, exactly as `FixtureRow`'s
	 * prop of the same name does: the default path resolves the sheet through a
	 * database-backed server action, which the `/preview/picks` gallery can't
	 * call. Supplying this makes the team names tappable even without a
	 * `competitionId`.
	 */
	renderFormSheet?: FormSheetRenderer
}

const PRED_LABEL: Record<Prediction, string> = {
	home_win: 'Home',
	draw: 'Draw',
	away_win: 'Away',
}

const PRED_COLOUR: Record<Prediction, string> = {
	home_win: 'bg-[var(--accent)] text-white',
	draw: 'bg-[var(--draw)] text-white',
	away_win: 'bg-[var(--eliminated)] text-white',
}

/**
 * One ranked prediction in the turbo confidence list.
 *
 * Both team names are tap-throughs to the same `TeamFormSheet` the unranked
 * fixture list opens. Ranking a fixture used to strip its form away — the row
 * dropped to a badge and a prediction — so re-checking a committed pick meant
 * un-ranking it first. Now any team you're weighing up taps for form, ranked or
 * not, and the ranked row keeps its density: the sheet carries the detail rather
 * than the row growing a second form bar.
 */
export function RankedItem({
	pick,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	onRemove,
	onChangePrediction,
	competitionId,
	roundNumber,
	renderFormSheet,
}: RankedItemProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: pick.id,
	})
	const [sheetSide, setSheetSide] = useState<'home' | 'away' | null>(null)
	// Retain the last opened side so the panel keeps its content through the
	// sheet's dismiss animation instead of flipping teams as it closes — same
	// reason `FixtureRow` does.
	const lastSheetSide = useRef<'home' | 'away'>('home')
	const activeSide = sheetSide ?? lastSheetSide.current
	const sheetEnabled = !!competitionId || !!renderFormSheet

	function openSheet(side: 'home' | 'away') {
		lastSheetSide.current = side
		setSheetSide(side)
	}

	const sheetTeam = activeSide === 'home' ? pick.homeTeam : pick.awayTeam
	const sheetOpponent = activeSide === 'home' ? pick.awayTeam : pick.homeTeam

	return (
		<>
			<div
				ref={setNodeRef}
				style={{ transform: CSS.Transform.toString(transform), transition }}
				className={cn(
					'flex items-center gap-2 sm:gap-3 bg-card border border-border rounded-lg px-2 py-2 sm:px-3 sm:py-2.5 mb-1.5',
					isDragging && 'opacity-50 border-dashed',
				)}
			>
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="text-muted-foreground p-1 cursor-grab touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
					style={{ touchAction: 'none' }}
					aria-label="Drag to reorder"
				>
					<GripVertical className="h-5 w-5" />
				</button>
				<div
					className={cn(
						'w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-background shrink-0',
						pick.rank <= 3 ? 'bg-[var(--alive)]' : 'bg-foreground',
					)}
				>
					{pick.rank}
				</div>
				{/* Teams and controls share a line from `sm` up and stack below it. Six
				    things on one 375px line left the two team names as the only
				    shrinkable ones, so they truncated — on a row whose entire content
				    is those two names. */}
				<div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
					<div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
						<TeamName
							team={pick.homeTeam}
							sheetEnabled={sheetEnabled}
							onOpen={() => openSheet('home')}
						/>
						<span
							className={cn(
								TYPE.meta,
								'text-muted-foreground font-semibold uppercase tracking-wide',
							)}
						>
							vs
						</span>
						<TeamName
							team={pick.awayTeam}
							sheetEnabled={sheetEnabled}
							onOpen={() => openSheet('away')}
						/>
					</div>
					<div className="flex items-center gap-2 shrink-0 ml-auto">
						<button
							type="button"
							onClick={onChangePrediction}
							className={cn(
								CHIP,
								'shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
								PRED_COLOUR[pick.prediction],
							)}
							aria-label={`Change prediction (currently ${PRED_LABEL[pick.prediction]})`}
						>
							{PRED_LABEL[pick.prediction]}
						</button>
						<div className="flex flex-col gap-0.5 shrink-0">
							<button
								type="button"
								onClick={onMoveUp}
								disabled={isFirst}
								className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								aria-label="Move up"
							>
								<ChevronUp className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={onMoveDown}
								disabled={isLast}
								className="border border-border rounded p-1 disabled:opacity-30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								aria-label="Move down"
							>
								<ChevronDown className="h-3.5 w-3.5" />
							</button>
						</div>
						<button
							type="button"
							onClick={onRemove}
							className="text-muted-foreground hover:text-[var(--eliminated)] p-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							aria-label="Remove"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>

			{renderFormSheet
				? renderFormSheet({
						fixtureId: pick.fixtureId,
						home: pick.homeTeam,
						away: pick.awayTeam,
						side: activeSide,
						open: sheetSide !== null,
						onClose: () => setSheetSide(null),
					})
				: competitionId && (
						<TeamFormSheet
							open={sheetSide !== null}
							onOpenChange={(open) => {
								if (!open) setSheetSide(null)
							}}
							teamId={sheetTeam.id}
							competitionId={competitionId}
							opponentTeamId={sheetOpponent.id}
							beforeRoundNumber={roundNumber}
							teamPreview={sheetTeam}
						/>
					)}
		</>
	)
}

/**
 * A team on a ranked row: short code on mobile, full name from `sm` up — the same
 * two spans (and the same scale step) the fixture row's pick button uses, so a
 * team reads identically whether it's ranked or still in the remaining list.
 */
function TeamName({
	team,
	sheetEnabled,
	onOpen,
}: {
	team: FixtureTeamInfo
	sheetEnabled: boolean
	onOpen: () => void
}) {
	const label = (
		<>
			<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="md" />
			<span className={cn(TYPE.name, 'sm:hidden whitespace-nowrap')}>{team.shortName}</span>
			<span className={cn(TYPE.name, 'hidden sm:block truncate')}>{team.name}</span>
			{sheetEnabled && (
				<ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/60" aria-hidden />
			)}
		</>
	)
	const baseCls = 'flex items-center gap-1.5 min-w-0'

	if (!sheetEnabled) return <span className={baseCls}>{label}</span>
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				baseCls,
				'-mx-0.5 rounded px-0.5 py-0.5 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
			)}
			aria-label={`Open form details for ${team.name}`}
		>
			{label}
		</button>
	)
}
