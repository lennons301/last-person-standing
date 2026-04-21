'use client'

import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { TeamBadge } from './team-badge'

export interface FixtureTeamInfo {
	id: string
	name: string
	shortName: string
	badgeUrl?: string | null
	form?: FormResult[]
	leaguePosition?: number | null
}

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
}: FixtureRowProps) {
	const isFullyUsed = usedSide === 'both'

	return (
		<div
			className={cn(
				'rounded-lg border border-border bg-card flex items-stretch transition-all overflow-hidden',
				isFullyUsed && 'opacity-30 pointer-events-none',
			)}
		>
			<TeamPickButton
				team={home}
				side="home"
				selected={selectedSide === 'home'}
				used={usedSide === 'home'}
				disabled={disabledSide === 'home' || disabledSide === 'both'}
				disabledReason={disabledReason}
				onClick={onPickHome}
			/>
			<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[64px] bg-muted/30 border-l border-r border-border">
				<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
					vs
				</span>
				{kickoff && (
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
				onClick={onPickAway}
			/>
			{usedLabel && (
				<span className="text-[0.7rem] text-muted-foreground px-2 self-center shrink-0">
					{usedLabel}
				</span>
			)}
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
	onClick?: () => void
}

function TeamPickButton({ team, side, selected, used, disabled, onClick }: TeamPickButtonProps) {
	const clickable = !!onClick && !disabled && !used
	const isHome = side === 'home'

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
				'flex items-center gap-3 px-4 py-3 flex-1 min-w-0 transition-all',
				isHome ? 'flex-row-reverse' : 'flex-row',
				clickable && 'hover:bg-muted/50 cursor-pointer',
				selected && 'bg-[var(--alive-bg)] ring-2 ring-[var(--alive)] ring-inset',
				used && 'opacity-30 line-through',
				disabled && !used && 'opacity-50 cursor-not-allowed',
			)}
		>
			<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="lg" />
			<div
				className={cn('flex flex-col gap-1.5 min-w-0 flex-1', isHome ? 'items-end' : 'items-start')}
			>
				<span className="font-semibold text-base leading-tight truncate w-full">{team.name}</span>
				<div className="flex items-center gap-2">
					{team.leaguePosition != null && (
						<span className="text-xs text-muted-foreground font-medium">
							{ordinal(team.leaguePosition)}
						</span>
					)}
					{team.form && team.form.length > 0 && <FormDots results={team.form} size="md" />}
				</div>
			</div>
		</button>
	)
}

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
