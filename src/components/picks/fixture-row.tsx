'use client'

import { ChevronRight } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { LocalDateTime } from '@/components/local-datetime'
import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { HeartIcon } from './heart-icon'
import { PlusNBadge } from './plus-n-badge'
import { TeamBadge } from './team-badge'
import { TeamFormSheet } from './team-form-sheet'
import { TierPips } from './tier-pips'

export interface FixtureTeamInfo {
	id: string
	name: string
	shortName: string
	badgeUrl?: string | null
	form?: FormResult[]
	leaguePosition?: number | null
}

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
	homeState?: SideState
	awayState?: SideState
	// Required for the form-detail sheet. Optional only for old callsites that
	// don't yet pass them — when omitted, the form row is non-tappable.
	competitionId?: string
	roundNumber?: number
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
	homeState,
	awayState,
	competitionId,
	roundNumber,
}: FixtureRowProps) {
	const isFullyUsed = usedSide === 'both'
	const showTierStrip = tierValue != null || plusN != null || showHeart
	const [sheetTeam, setSheetTeam] = useState<'home' | 'away' | null>(null)
	const sheetEnabled = !!competitionId

	return (
		<div className={cn(isFullyUsed && 'opacity-30 pointer-events-none')}>
			{showTierStrip && (
				<div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
					{showHeart && <HeartIcon size={13} />}
					{tierValue != null && (
						<TierPips value={tierValue as 0 | 1 | 2 | 3 | 4 | 5} max={tierMax} />
					)}
					{plusN != null && <PlusNBadge value={plusN} />}
					{kickoff && (
						<span className="ml-auto">
							<LocalDateTime date={kickoff} />
						</span>
					)}
				</div>
			)}
			<div className="rounded-lg border border-border bg-card overflow-hidden">
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
					/>
					<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[56px] bg-muted/30 border-l border-r border-border">
						<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
							vs
						</span>
						{kickoff && !showTierStrip && (
							<LocalDateTime
								date={kickoff}
								className="text-[0.7rem] text-muted-foreground mt-1 text-center leading-tight"
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
					/>
					{usedLabel && (
						<span className="text-[0.7rem] text-muted-foreground px-2 self-center shrink-0">
							{usedLabel}
						</span>
					)}
				</div>
				{Boolean(home.form?.length || away.form?.length) && (
					<FormBar
						home={home}
						away={away}
						sheetEnabled={sheetEnabled}
						onOpenSheet={(side) => setSheetTeam(side)}
					/>
				)}
			</div>

			{sheetEnabled && competitionId && (
				<TeamFormSheet
					open={sheetTeam !== null}
					onOpenChange={(open) => {
						if (!open) setSheetTeam(null)
					}}
					teamId={sheetTeam === 'home' ? home.id : away.id}
					competitionId={competitionId}
					opponentTeamId={sheetTeam === 'home' ? away.id : home.id}
					beforeRoundNumber={roundNumber}
					teamPreview={sheetTeam === 'home' ? home : away}
					opponentPreview={
						sheetTeam === 'home' ? { shortName: away.shortName } : { shortName: home.shortName }
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

function FormBar({ home, away, sheetEnabled, onOpenSheet }: FormBarProps) {
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
	const content = (
		<>
			{team.leaguePosition != null && !isHome && (
				<span className="text-[10px] text-muted-foreground font-medium font-mono mr-2">
					{ordinal(team.leaguePosition)}
				</span>
			)}
			{team.form && team.form.length > 0 && <FormDots results={team.form} size="sm" />}
			{team.leaguePosition != null && isHome && (
				<span className="text-[10px] text-muted-foreground font-medium font-mono ml-2">
					{ordinal(team.leaguePosition)}
				</span>
			)}
			{sheetEnabled && (
				<ChevronRight
					className={cn(
						'w-3 h-3 text-muted-foreground/60',
						isHome ? 'mr-0.5' : 'ml-0.5 rotate-180',
					)}
					aria-hidden
				/>
			)}
		</>
	)

	const baseCls = cn(
		'flex items-center px-3 py-2 transition-colors',
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
}

function TeamPickButton({
	team,
	side,
	selected,
	used,
	disabled,
	state,
	onClick,
}: TeamPickButtonProps) {
	const stateBlocksClick =
		state?.kind === 'restricted' || state?.kind === 'used' || state?.kind === 'planned-elsewhere'
	const clickable = !!onClick && !disabled && !used && !stateBlocksClick
	const isHome = side === 'home'
	const stateCls = sideClass(state)
	const chip = sideChip(state)

	return (
		<button
			type="button"
			onClick={clickable ? onClick : undefined}
			disabled={!clickable}
			className={cn(
				'flex items-center gap-3 px-4 py-3 flex-1 min-w-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
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
				<span className="font-semibold text-base leading-tight truncate w-full">
					<span className="sm:hidden">{team.shortName}</span>
					<span className="hidden sm:inline">{team.name}</span>
				</span>
				{chip && <div className={cn('flex', isHome ? 'justify-end' : 'justify-start')}>{chip}</div>}
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
			return 'border-2 border-dashed border-[#7c3aed] bg-[#f5f3ff]'
		case 'auto-locked':
			return 'border-2 border-[#7c3aed] bg-[#ede9fe]'
		case 'restricted':
			return 'opacity-40 cursor-not-allowed'
		case 'used':
		case 'planned-elsewhere':
			return 'opacity-40 cursor-not-allowed line-through'
	}
}

function sideChip(state?: SideState): React.ReactNode {
	if (!state) return null
	switch (state.kind) {
		case 'current':
			return (
				<span className="text-[9px] bg-[var(--alive-bg)] text-[var(--alive)] px-1.5 py-0.5 rounded font-bold">
					CURRENT
				</span>
			)
		case 'tentative':
			return (
				<span className="text-[9px] bg-[#ddd6fe] text-[#5b21b6] px-1.5 py-0.5 rounded font-bold">
					TENTATIVE
				</span>
			)
		case 'auto-locked':
			return (
				<span className="text-[9px] bg-[#7c3aed] text-white px-1.5 py-0.5 rounded font-bold">
					🔒 AUTO
				</span>
			)
		case 'restricted':
			return (
				<span className="text-[9px] text-muted-foreground">{state.reason ?? 'Restricted'}</span>
			)
		case 'used':
		case 'planned-elsewhere':
			return (
				<span className="text-[9px] bg-muted text-foreground/70 px-1.5 py-0.5 rounded font-bold">
					{state.label}
				</span>
			)
	}
}

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
