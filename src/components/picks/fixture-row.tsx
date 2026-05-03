'use client'

import type React from 'react'
import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { HeartIcon } from './heart-icon'
import { PlusNBadge } from './plus-n-badge'
import { TeamBadge } from './team-badge'
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
	kickoff?: string
	selectedSide?: 'home' | 'away' | null
	usedSide?: 'home' | 'away' | 'both' | null
	usedLabel?: string
	onPickHome?: () => void
	onPickAway?: () => void
	disabledSide?: 'home' | 'away' | 'both' | null
	disabledReason?: string
	// Tier strip (per-fixture annotations)
	tierValue?: number
	tierMax?: 3 | 5
	plusN?: number
	showHeart?: boolean
	// Per-side state
	homeState?: SideState
	awayState?: SideState
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
}: FixtureRowProps) {
	const isFullyUsed = usedSide === 'both'
	const showTierStrip = tierValue != null || plusN != null || showHeart

	return (
		<div className={cn(isFullyUsed && 'opacity-30 pointer-events-none')}>
			{showTierStrip && (
				<div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
					{showHeart && <HeartIcon size={13} />}
					{tierValue != null && (
						<TierPips value={tierValue as 0 | 1 | 2 | 3 | 4 | 5} max={tierMax} />
					)}
					{plusN != null && <PlusNBadge value={plusN} />}
					{kickoff && <span className="ml-auto">{kickoff}</span>}
				</div>
			)}
			<div
				className={cn(
					'rounded-lg border border-border bg-card flex items-stretch transition-all overflow-hidden',
				)}
			>
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
				<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[64px] bg-muted/30 border-l border-r border-border">
					<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
						vs
					</span>
					{kickoff && !showTierStrip && (
						<span className="text-[0.7rem] text-muted-foreground mt-1 text-center leading-tight">
							{kickoff}
						</span>
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
		</div>
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

	/*
	 * Layout goal: symmetric, badge nearest the centre "vs" divider.
	 * Home:  [name / position+form — right aligned]  [BADGE]
	 * Away:  [BADGE]  [name / position+form — left aligned]
	 */
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
				className={cn('flex flex-col gap-1.5 min-w-0 flex-1', isHome ? 'items-end' : 'items-start')}
			>
				{/* Country/long names truncate to first chars on narrow phones — show
				 * the 3-letter shortName instead and switch to the full name from `sm`
				 * upward. Keeps the touch target useful and avoids "Argen…" / "C". */}
				<span className="font-semibold text-base leading-tight truncate w-full">
					<span className="sm:hidden">{team.shortName}</span>
					<span className="hidden sm:inline">{team.name}</span>
				</span>
				<div className="flex items-center gap-2">
					{team.leaguePosition != null && (
						<span className="text-xs text-muted-foreground font-medium">
							{ordinal(team.leaguePosition)}
						</span>
					)}
					{/* sm-and-up uses larger dots; below sm we shrink so the form guide
					 * stays inside the row even when the team name is long. */}
					{team.form && team.form.length > 0 && (
						<>
							<span className="sm:hidden">
								<FormDots results={team.form} size="sm" />
							</span>
							<span className="hidden sm:inline">
								<FormDots results={team.form} size="md" />
							</span>
						</>
					)}
				</div>
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
