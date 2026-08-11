'use client'

import { ChevronRight } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'
import { LocalDateTime } from '@/components/local-datetime'
import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { HeartIcon } from './heart-icon'
import { PlusNBadge } from './plus-n-badge'
import { TeamBadge } from './team-badge'
import { TeamFormSheet } from './team-form-sheet'
import { TierPips } from './tier-pips'

/**
 * The row's type scale. Three steps, deliberately, replacing the ad-hoc pile of
 * `text-[9px]` / `[10px]` / `[11px]` / `[0.7rem]` micro sizes this row used to
 * carry. Everything in the row (and its sub-components) picks one:
 *
 * - `name`     — the team name on the pick button. The primary affordance: the
 *                largest and only bold-dark type in the row.
 * - `meta`     — secondary metadata: kickoff, "vs", league position.
 * - `chip`     — status chips (CURRENT / TENTATIVE / AUTO / USED, +N lives) and
 *                the tier strip. Never allowed to compete with a team name, so
 *                these stay muted unless the state itself is the message.
 *
 * `text-2xs` is a real scale step declared in `globals.css`, not an arbitrary
 * bracket value.
 */
const TYPE = {
	name: 'text-base sm:text-lg font-semibold leading-tight',
	meta: 'text-xs leading-tight',
	chip: 'text-2xs font-semibold',
} as const

/** Shared chip shell — colour comes from the caller, geometry from here. */
const CHIP = cn(
	TYPE.chip,
	'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 max-w-full uppercase tracking-wide',
)

export interface FixtureTeamInfo {
	id: string
	name: string
	shortName: string
	badgeUrl?: string | null
	form?: FormResult[]
	leaguePosition?: number | null
}

/**
 * `renderFormSheet` lifted one level up, for components that own a *set* of
 * `FixtureRow`s (classic's picker and its planner) and resolve the renderer per
 * row. Keyed on the row's two teams rather than on any mode's fixture type, so
 * one renderer serves current-round rows and planner rows alike.
 */
export type RowFormSheetRenderer = (args: {
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	side: 'home' | 'away'
	open: boolean
	onClose: () => void
}) => React.ReactNode

export type SideState =
	| { kind: 'current' }
	| { kind: 'tentative' }
	| { kind: 'auto-locked' }
	| { kind: 'restricted'; reason?: string }
	| { kind: 'used'; label: string }
	| { kind: 'planned-elsewhere'; label: string }

export interface FixtureRowProps {
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	/** ISO string. Rendered in the user's local timezone via <LocalDateTime />. */
	kickoff?: string | Date | null
	selectedSide?: 'home' | 'away' | null
	usedSide?: 'home' | 'away' | 'both' | null
	usedLabel?: string
	onPickHome?: () => void
	onPickAway?: () => void
	disabledSide?: 'home' | 'away' | 'both' | null
	disabledReason?: string
	tierValue?: number
	tierMax?: 3 | 5
	plusN?: number
	showHeart?: boolean
	/**
	 * Which side is the underdog (lower tier) — used to anchor the +N
	 * lives indicator to the team that earns the bonus. Without this,
	 * the +N sits on the top strip and the viewer has to know which
	 * pot each team is in to work it out. With it, the badge lives on
	 * the underdog's pick button directly.
	 */
	underdogSide?: 'home' | 'away' | null
	homeState?: SideState
	awayState?: SideState
	// Required for the form-detail sheet. Optional only for old callsites that
	// don't yet pass them — when omitted, the form row is non-tappable.
	competitionId?: string
	roundNumber?: number
	/**
	 * Overrides how the form-detail sheet is rendered. The default path resolves
	 * the sheet from `competitionId` through a database-backed server action,
	 * which a fixture-driven gallery can't call — `/preview/picks` passes its own
	 * renderer so the form bar stays tappable with no database. Supplying this
	 * makes the form bar tappable even without a `competitionId`.
	 */
	renderFormSheet?: (args: {
		side: 'home' | 'away'
		open: boolean
		onClose: () => void
	}) => React.ReactNode
	/**
	 * Extra content rendered inside the bordered card, below the form bar.
	 * Used by turbo's pick interface to attach PredictionButtons to the
	 * fixture without breaking visual grouping.
	 */
	children?: React.ReactNode
}

export function FixtureRow({
	home,
	away,
	kickoff,
	selectedSide,
	usedSide,
	usedLabel,
	onPickHome,
	onPickAway,
	disabledSide,
	disabledReason,
	tierValue,
	tierMax,
	plusN,
	showHeart,
	underdogSide,
	homeState,
	awayState,
	competitionId,
	roundNumber,
	renderFormSheet,
	children,
}: FixtureRowProps) {
	const isFullyUsed = usedSide === 'both'
	// The +N badge moves onto the underdog team's button when we know
	// which side it is. The top strip keeps heart + pips as the generic
	// "this fixture has a tier gap" indicator; the actionable bonus
	// indicator goes where the click happens.
	const bonusLivesOnButton = underdogSide && plusN ? plusN : 0
	const showTopPlusN = !underdogSide && plusN != null && plusN > 0
	const [sheetTeam, setSheetTeam] = useState<'home' | 'away' | null>(null)
	// Retain the last opened side so the form panel keeps its content through the
	// sheet's dismiss animation, instead of flipping to the other team as it closes
	// (sheetTeam goes null the moment the close starts).
	const lastSheetSide = useRef<'home' | 'away'>('home')
	const activeSheetSide = sheetTeam ?? lastSheetSide.current
	const sheetEnabled = !!competitionId || !!renderFormSheet
	// The top strip carries everything that isn't a team: tier annotations, the
	// row-level status label and the kickoff. `usedLabel` lives here rather than
	// inline in the team row because inline it competed with the team names for
	// width on a phone — and here it also escapes the dimming applied to a
	// fully-used card, so the reason the row is greyed out stays legible.
	const showStrip = tierValue != null || showTopPlusN || !!showHeart || !!usedLabel

	return (
		<div>
			{showStrip && (
				<div className={cn('flex items-center gap-2 mb-1.5', TYPE.meta, 'text-muted-foreground')}>
					{usedLabel && (
						<span className={cn(CHIP, 'bg-muted text-muted-foreground')}>{usedLabel}</span>
					)}
					{showHeart && <HeartIcon size={13} />}
					{tierValue != null && (
						<TierPips value={tierValue as 0 | 1 | 2 | 3 | 4 | 5} max={tierMax} />
					)}
					{showTopPlusN && plusN != null && <PlusNBadge value={plusN} />}
					{kickoff && (
						<span className="ml-auto">
							<LocalDateTime date={kickoff} />
						</span>
					)}
				</div>
			)}
			<div
				className={cn(
					'rounded-lg border border-border bg-card overflow-hidden',
					isFullyUsed && 'opacity-30 pointer-events-none',
				)}
			>
				<div className="flex items-stretch transition-all">
					<TeamPickButton
						team={home}
						side="home"
						selected={selectedSide === 'home'}
						used={usedSide === 'home'}
						disabled={disabledSide === 'home' || disabledSide === 'both'}
						disabledReason={disabledReason}
						state={homeState}
						onClick={onPickHome}
						bonusLives={underdogSide === 'home' ? bonusLivesOnButton : 0}
					/>
					<div className="flex flex-col items-center justify-center shrink-0 px-2 min-w-[44px] sm:px-3 sm:min-w-[56px] bg-muted/30 border-l border-r border-border">
						<span className={cn(TYPE.meta, 'text-muted-foreground uppercase tracking-wide')}>
							vs
						</span>
						{kickoff && !showStrip && (
							<LocalDateTime
								date={kickoff}
								className={cn(TYPE.chip, 'font-normal text-muted-foreground mt-1 text-center')}
							/>
						)}
					</div>
					<TeamPickButton
						team={away}
						side="away"
						selected={selectedSide === 'away'}
						used={usedSide === 'away'}
						disabled={disabledSide === 'away' || disabledSide === 'both'}
						disabledReason={disabledReason}
						state={awayState}
						onClick={onPickAway}
						bonusLives={underdogSide === 'away' ? bonusLivesOnButton : 0}
					/>
				</div>
				<FormBar
					home={home}
					away={away}
					sheetEnabled={sheetEnabled}
					onOpenSheet={(side) => {
						lastSheetSide.current = side
						setSheetTeam(side)
					}}
				/>
				{children}
			</div>

			{renderFormSheet
				? renderFormSheet({
						side: activeSheetSide,
						open: sheetTeam !== null,
						onClose: () => setSheetTeam(null),
					})
				: competitionId && (
						<TeamFormSheet
							open={sheetTeam !== null}
							onOpenChange={(open) => {
								if (!open) setSheetTeam(null)
							}}
							teamId={activeSheetSide === 'home' ? home.id : away.id}
							competitionId={competitionId}
							opponentTeamId={activeSheetSide === 'home' ? away.id : home.id}
							beforeRoundNumber={roundNumber}
							teamPreview={activeSheetSide === 'home' ? home : away}
							opponentPreview={
								activeSheetSide === 'home'
									? { shortName: away.shortName }
									: { shortName: home.shortName }
							}
						/>
					)}
		</div>
	)
}

interface FormBarProps {
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	sheetEnabled: boolean
	onOpenSheet: (side: 'home' | 'away') => void
}

/**
 * The bottom strip: league position and recent form, one tappable half per team.
 *
 * Position is deliberately *not* gated on form. It used to be — the whole bar
 * only rendered when at least one side had form results, so at the start of a
 * season (nobody has played) the row silently lost its league positions too.
 * Now position alone is enough to bring the bar out, and the form-less half says
 * so explicitly rather than rendering blank.
 *
 * A row with neither is still bar-less, as before: modes that don't source form
 * or positions at all (cup) pass neither, and an unconditional "No form yet"
 * there would be claiming something about the teams that the row can't know.
 */
function FormBar({ home, away, sheetEnabled, onOpenSheet }: FormBarProps) {
	const hasContent = [home, away].some((t) => t.form?.length || t.leaguePosition != null)
	if (!hasContent) return null

	return (
		<div className="grid grid-cols-2 border-t border-border bg-muted/40">
			<FormHalf
				team={home}
				side="home"
				sheetEnabled={sheetEnabled}
				onOpenSheet={() => onOpenSheet('home')}
			/>
			<FormHalf
				team={away}
				side="away"
				sheetEnabled={sheetEnabled}
				onOpenSheet={() => onOpenSheet('away')}
			/>
		</div>
	)
}

interface FormHalfProps {
	team: FixtureTeamInfo
	side: 'home' | 'away'
	sheetEnabled: boolean
	onOpenSheet: () => void
}

function FormHalf({ team, side, sheetEnabled, onOpenSheet }: FormHalfProps) {
	const isHome = side === 'home'
	const hasForm = !!team.form?.length
	const content = (
		<>
			{team.leaguePosition != null && !isHome && (
				<span className={cn(TYPE.meta, 'text-muted-foreground font-medium font-mono mr-2')}>
					{ordinal(team.leaguePosition)}
				</span>
			)}
			{hasForm ? (
				<FormDots results={team.form as FormResult[]} size="sm" />
			) : (
				// An explicit "nothing yet" beats an empty half — a blank strip reads
				// as a half-loaded row, this reads as the season not having started.
				<span className={cn(TYPE.chip, 'font-normal text-muted-foreground/70 whitespace-nowrap')}>
					No form yet
				</span>
			)}
			{team.leaguePosition != null && isHome && (
				<span className={cn(TYPE.meta, 'text-muted-foreground font-medium font-mono ml-2')}>
					{ordinal(team.leaguePosition)}
				</span>
			)}
			{sheetEnabled && (
				<ChevronRight
					className={cn(
						'w-3 h-3 shrink-0 text-muted-foreground/60',
						isHome ? 'mr-0.5' : 'ml-0.5 rotate-180',
					)}
					aria-hidden
				/>
			)}
		</>
	)

	const baseCls = cn(
		'flex items-center min-w-0 px-2 py-2 sm:px-3 transition-colors',
		isHome ? 'flex-row-reverse justify-start' : 'flex-row justify-start',
	)

	if (!sheetEnabled) {
		return <div className={baseCls}>{content}</div>
	}
	return (
		<button
			type="button"
			onClick={onOpenSheet}
			className={cn(
				baseCls,
				'hover:bg-muted/70 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
			)}
			aria-label={`Open form details for ${team.name}`}
		>
			{content}
		</button>
	)
}

interface TeamPickButtonProps {
	team: FixtureTeamInfo
	side: 'home' | 'away'
	selected: boolean
	used: boolean
	disabled: boolean
	disabledReason?: string
	state?: SideState
	onClick?: () => void
	/**
	 * Lives gained if this team's pick wins (cup mode, when this side is
	 * the underdog). Rendered as a chip on the button so the bonus is
	 * attributed unambiguously to the team that earns it. 0 / undefined
	 * hides the chip.
	 */
	bonusLives?: number
}

function TeamPickButton({
	team,
	side,
	selected,
	used,
	disabled,
	state,
	onClick,
	bonusLives,
}: TeamPickButtonProps) {
	const stateBlocksClick =
		state?.kind === 'restricted' || state?.kind === 'used' || state?.kind === 'planned-elsewhere'
	const clickable = !!onClick && !disabled && !used && !stateBlocksClick
	const isHome = side === 'home'
	const stateCls = sideClass(state)
	const chip = sideChip(state)
	const showBonus = !!bonusLives && bonusLives > 0

	return (
		<button
			type="button"
			onClick={clickable ? onClick : undefined}
			disabled={!clickable}
			className={cn(
				'flex items-center gap-2 px-2.5 py-3 sm:gap-3 sm:px-4 flex-1 min-w-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
				isHome ? 'flex-row-reverse' : 'flex-row',
				clickable && 'hover:bg-muted/50 cursor-pointer',
				selected && 'bg-[var(--alive-bg)] ring-2 ring-[var(--alive)] ring-inset',
				used && 'opacity-30 line-through',
				disabled && !used && 'opacity-50 cursor-not-allowed',
				stateCls,
			)}
		>
			<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="lg" responsive />
			<div
				className={cn('flex flex-col gap-0.5 min-w-0 flex-1', isHome ? 'items-end' : 'items-start')}
			>
				{/* The mobile short code never truncates: it's 3–4 characters, so it
				    gets `whitespace-nowrap` and no overflow clipping. Only the desktop
				    full name — which genuinely can be too long — truncates. Previously
				    both shared one `truncate w-full` span, so a chip alongside it (AUTO /
				    TENTATIVE / USED GW3) shrank the column and clipped codes like MUN. */}
				<span className={cn(TYPE.name, 'sm:hidden whitespace-nowrap')}>{team.shortName}</span>
				<span className={cn(TYPE.name, 'hidden sm:block w-full truncate')}>{team.name}</span>
				{(showBonus || chip) && (
					<div
						className={cn(
							'flex items-center gap-1.5 flex-wrap min-w-0 max-w-full',
							isHome ? 'justify-end' : 'justify-start',
						)}
					>
						{showBonus && (
							<span
								className={cn(
									CHIP,
									bonusLives >= 2 ? 'bg-amber-100 text-amber-900' : 'bg-muted text-foreground/80',
								)}
								title={`Pick ${team.name} — win earns +${bonusLives} ${bonusLives === 1 ? 'life' : 'lives'}`}
							>
								+{bonusLives} {bonusLives === 1 ? 'life' : 'lives'}
							</span>
						)}
						{chip}
					</div>
				)}
			</div>
		</button>
	)
}

function sideClass(state?: SideState): string {
	if (!state) return ''
	switch (state.kind) {
		case 'current':
			return 'border-[var(--alive)] bg-[var(--alive-bg)]'
		case 'tentative':
			return 'border-2 border-dashed border-[var(--planned)] bg-[var(--planned-bg)]'
		case 'auto-locked':
			return 'border-2 border-[var(--planned)] bg-[var(--planned-bg)]'
		case 'restricted':
			return 'opacity-40 cursor-not-allowed'
		case 'used':
		case 'planned-elsewhere':
			return 'opacity-40 cursor-not-allowed line-through'
	}
}

/**
 * Status chips. All one scale step, all the same shell — the state is carried by
 * the wording plus a single tint, not by six different sizes and saturations.
 * Only `current` (your live pick) and `auto-locked` (a decision the system made
 * for you) get a filled tint; the rest stay muted so they never out-shout the
 * team name they sit under.
 */
function sideChip(state?: SideState): React.ReactNode {
	if (!state) return null
	switch (state.kind) {
		case 'current':
			return <span className={cn(CHIP, 'bg-[var(--alive-bg)] text-[var(--alive)]')}>Current</span>
		case 'tentative':
			return (
				<span className={cn(CHIP, 'bg-[var(--planned-bg)] text-[var(--planned)]')}>Tentative</span>
			)
		case 'auto-locked':
			return <span className={cn(CHIP, 'bg-[var(--planned)] text-white')}>🔒 Auto</span>
		case 'restricted':
			return (
				<span className={cn(TYPE.chip, 'font-normal text-muted-foreground')}>
					{state.reason ?? 'Restricted'}
				</span>
			)
		case 'used':
		case 'planned-elsewhere':
			return <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>{state.label}</span>
	}
}

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
