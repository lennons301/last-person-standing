'use client'
import { deriveMatchState } from '@/lib/live/derive'
import type { LiveFixture } from '@/lib/live/types'
import { cn } from '@/lib/utils'
import { LiveDot } from './live-indicators'

interface LiveFixtureCardProps {
	fixture: LiveFixture
	isMyPick?: boolean
	now?: Date
	className?: string
}

function statusText(
	state: 'pre' | 'live' | 'ht' | 'ft',
	kickoff: Date | string | null,
	now: Date,
): string {
	if (state === 'ht') return 'HALF TIME'
	if (state === 'ft') return 'FULL TIME'
	if (state === 'live') return 'LIVE'
	if (!kickoff) return 'TBC'
	const t = typeof kickoff === 'string' ? Date.parse(kickoff) : kickoff.getTime()
	const totalMins = Math.max(0, Math.round((t - now.getTime()) / 60_000))
	if (totalMins === 0) return 'KICKING OFF'
	// Days/hours/minutes for kickoffs more than an hour away — pure-minutes
	// loses context (e.g. WC opener showing "60480m" is meaningless).
	const days = Math.floor(totalMins / (60 * 24))
	const hours = Math.floor((totalMins % (60 * 24)) / 60)
	const mins = totalMins % 60
	if (days > 0) return `KICKS OFF IN ${days}d ${hours}h`
	if (hours > 0) return `KICKS OFF IN ${hours}h ${mins}m`
	return `KICKS OFF IN ${mins}m`
}

export function LiveFixtureCard({
	fixture,
	isMyPick = false,
	now = new Date(),
	className,
}: LiveFixtureCardProps) {
	const state = deriveMatchState(fixture, now)
	const statusClasses =
		state === 'live'
			? 'text-[#ef4444] border-[#ef4444]'
			: state === 'ht'
				? 'text-amber-500 border-amber-500'
				: 'text-muted-foreground border-border'
	return (
		<div
			data-fixture-id={fixture.id}
			data-state={state}
			className={cn(
				'relative flex min-w-[170px] flex-col gap-1 rounded-lg border bg-card px-3 py-2',
				statusClasses,
				state === 'pre' && 'opacity-70',
				state === 'ft' && 'opacity-80',
				className,
			)}
		>
			{isMyPick && (
				// Inline at top of card (was previously `absolute -top-1.5` which got
				// clipped by the live-ticker's overflow-x-auto wrapper on mobile).
				<span className="self-end -mb-0.5 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
					My pick
				</span>
			)}
			<div className="flex items-center justify-between text-sm font-semibold">
				<span>{fixture.homeShort}</span>
				<span data-score="home" className="tabular-nums font-bold">
					{fixture.homeScore ?? '−'}
				</span>
			</div>
			<div className="flex items-center justify-between text-sm font-semibold">
				<span>{fixture.awayShort}</span>
				<span data-score="away" className="tabular-nums font-bold">
					{fixture.awayScore ?? '−'}
				</span>
			</div>
			<div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
				{state === 'live' && <LiveDot className="text-[#ef4444]" />}
				<span className="text-current">{statusText(state, fixture.kickoff, now)}</span>
			</div>
		</div>
	)
}
