'use client'

import { CheckCircle2, Clock, Pencil, UserCog } from 'lucide-react'
import { GameStatLine } from '@/components/game/game-stat-line'
import { LocalDateTime } from '@/components/local-datetime'
import { requestPickEdit } from '@/components/picks/edit-pick-event'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import { formatDeadline } from '@/lib/format'
import type {
	GameHeroDescriptor,
	GameMode,
	GameViewStats,
	HeroPickSummary,
	HeroRound,
} from '@/lib/game/game-view'

/**
 * Top-of-page hero. One state-driven band that owns the round label, the
 * deadline and — before that deadline — the viewer's pick: a loud call to action
 * when there's no pick yet, a calm confirmation with a change affordance once
 * there is. It stays in the calm state right up to the deadline, because editing
 * the pick is the main thing a player does pre-deadline.
 *
 * Purely presentational: everything it branches on comes from the descriptor
 * built by `buildGameView`. `notices` is the slot the auto-pick and voided-pick
 * notices render into, so they read as part of the pick state instead of as
 * standalone banners stacked above the page.
 */
export interface GameHeroProps {
	hero: GameHeroDescriptor
	stats: GameViewStats
	/** Auto-pick / voided-pick notices, rendered inside the hero body. */
	notices?: React.ReactNode
	/** Anchor the CTA scrolls to — the pick interface further down the page. */
	pickAnchor?: string
}

export function GameHero({ hero, stats, notices, pickAnchor = '#pick' }: GameHeroProps) {
	if (hero.kind === 'none') return null

	const loud = hero.kind === 'pick-open'

	return (
		<section
			aria-label="Your pick"
			className={
				loud
					? 'mb-4 md:mb-6 rounded-xl border-2 border-primary/60 bg-primary/5 overflow-hidden'
					: 'mb-4 md:mb-6 rounded-xl border border-[var(--alive)]/40 bg-[var(--alive-bg)] overflow-hidden'
			}
		>
			<div className="p-4 md:p-5">
				<RoundLine round={hero.round} />

				{hero.kind === 'pick-open' ? (
					<PickOpenBody
						mode={hero.mode}
						round={hero.round}
						picksMade={hero.picksMade}
						picksRequired={hero.picksRequired}
						pickAnchor={pickAnchor}
					/>
				) : (
					<PickMadeBody mode={hero.mode} pick={hero.pick} pickAnchor={pickAnchor} />
				)}

				{hero.actingAsName && (
					<p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--draw)] bg-[var(--draw-bg)] px-2 py-1 rounded-md">
						<UserCog className="h-3.5 w-3.5" />
						Picking as {hero.actingAsName}
					</p>
				)}

				{notices}
			</div>

			<GameStatLine
				stats={stats}
				className="border-t border-border/60 bg-card/60 px-4 md:px-5 py-2.5"
			/>
		</section>
	)
}

function RoundLine({ round }: { round: HeroRound }) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			<span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-card text-foreground border border-border">
				{round.label}
			</span>
			<span className="font-display text-sm font-semibold">{round.longLabel}</span>
			<span className="flex items-center gap-1 text-xs text-muted-foreground">
				<Clock className="h-3 w-3" />
				{round.deadlineIso ? (
					<>
						Deadline <LocalDateTime date={round.deadlineIso} />
						<span suppressHydrationWarning>
							{' '}
							· {formatDeadline(new Date(round.deadlineIso))} left
						</span>
					</>
				) : (
					<>Deadline TBC</>
				)}
			</span>
		</div>
	)
}

function PickOpenBody({
	mode,
	round,
	picksMade,
	picksRequired,
	pickAnchor,
}: {
	mode: GameMode
	round: HeroRound
	picksMade: number
	picksRequired: number
	pickAnchor: string
}) {
	const partial = picksMade > 0
	const heading = partial
		? 'Finish your picks'
		: picksRequired > 1
			? 'Make your picks'
			: 'Make your pick'
	return (
		<div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
			<div className="min-w-0">
				<h2 className="font-display text-xl md:text-2xl font-bold leading-tight">{heading}</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{promptFor(mode, round, picksRequired)}
					{partial && (
						<span className="font-semibold text-foreground">
							{' '}
							{picksMade} of {picksRequired} ranked so far.
						</span>
					)}
				</p>
			</div>
			<Button asChild size="lg" className="gap-1.5">
				<a href={pickAnchor}>{partial ? 'Finish picks' : heading}</a>
			</Button>
		</div>
	)
}

function PickMadeBody({
	mode,
	pick,
	pickAnchor,
}: {
	mode: GameMode
	pick: HeroPickSummary
	pickAnchor: string
}) {
	const changeLabel =
		pick.type === 'ranked' && pick.picksRequired > 1 ? 'Change picks' : 'Change pick'
	return (
		<div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
			<div className="flex items-center gap-3 min-w-0">
				{pick.type === 'team' ? (
					<TeamBadge shortName={pick.shortName} size="lg" />
				) : (
					<CheckCircle2 className="h-8 w-8 text-[var(--alive)]" />
				)}
				<div className="min-w-0">
					<div className="text-xs uppercase tracking-wide text-[var(--alive)] font-semibold">
						{pick.isAuto ? 'Auto-pick locked in' : "You're in"}
					</div>
					{pick.type === 'team' ? (
						<>
							<div className="font-display text-lg md:text-xl font-semibold leading-tight">
								{pick.name}
								{pick.opponentName && (
									<span className="text-sm text-muted-foreground font-normal">
										{' '}
										vs {pick.opponentName}
										{pick.side ? ` (${pick.side === 'home' ? 'H' : 'A'})` : ''}
									</span>
								)}
							</div>
							{pick.kickoffIso && (
								<div className="text-xs text-muted-foreground mt-0.5">
									Kick-off <LocalDateTime date={pick.kickoffIso} />
								</div>
							)}
						</>
					) : (
						<div className="font-display text-lg md:text-xl font-semibold leading-tight">
							{pick.picksMade} of {pick.picksRequired}{' '}
							{mode === 'classic' ? 'picks' : 'predictions'} locked
						</div>
					)}
				</div>
			</div>
			<div className="flex flex-col items-end gap-1">
				<Button asChild variant="outline" className="gap-1.5">
					<a href={pickAnchor} onClick={() => requestPickEdit()}>
						<Pencil className="h-3.5 w-3.5" />
						{changeLabel}
					</a>
				</Button>
				<span className="text-[0.7rem] text-muted-foreground">Editable until the deadline</span>
			</div>
		</div>
	)
}

function promptFor(mode: GameMode, round: HeroRound, picksRequired: number): string {
	switch (mode) {
		case 'classic':
			return `Pick one team to win in ${round.longLabel}. Win and you survive to the next round.`
		case 'turbo':
			return `Rank ${picksRequired} predictions for ${round.longLabel}. The longest run of correct calls wins.`
		case 'cup':
			return `Rank ${picksRequired} predictions for ${round.longLabel}. Lives cover your misses — underdog calls earn more.`
	}
}
