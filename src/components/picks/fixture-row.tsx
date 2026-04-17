'use client'

import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { TeamBadge } from './team-badge'

export interface FixtureTeamInfo {
	id: string
	name: string
	shortName: string
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
				'rounded-lg border border-border bg-card px-3 py-3 flex items-center gap-2 transition-all',
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
			<div className="flex flex-col items-center px-2 shrink-0">
				<span className="text-[0.6rem] text-muted-foreground">vs</span>
				{kickoff && <span className="text-[0.65rem] text-muted-foreground">{kickoff}</span>}
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
			{usedLabel && <span className="text-[0.65rem] text-muted-foreground ml-1">{usedLabel}</span>}
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

	return (
		<button
			type="button"
			onClick={clickable ? onClick : undefined}
			disabled={!clickable}
			className={cn(
				'flex items-center gap-2 px-2 py-1 rounded-md flex-1 min-w-0 transition-all',
				side === 'home' && 'flex-row-reverse text-right justify-start',
				clickable && 'hover:bg-muted/50 cursor-pointer',
				selected &&
					'bg-[var(--alive-bg)] outline-2 outline outline-[var(--alive)] -outline-offset-2',
				used && 'opacity-30 line-through',
				disabled && !used && 'opacity-50 cursor-not-allowed',
			)}
		>
			<TeamBadge shortName={team.shortName} size="md" />
			<div
				className={cn(
					'flex flex-col gap-0.5 min-w-0',
					side === 'home' ? 'items-end' : 'items-start',
				)}
			>
				<span className="font-semibold text-sm truncate">{team.name}</span>
				{team.form && team.form.length > 0 && <FormDots results={team.form} size="sm" />}
				{team.leaguePosition != null && (
					<span className="text-[0.7rem] text-muted-foreground">
						{ordinal(team.leaguePosition)} · {side === 'home' ? 'Home' : 'Away'}
					</span>
				)}
			</div>
		</button>
	)
}

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
