'use client'

import {
	CheckCircle2,
	Clock,
	Flame,
	Heart,
	ListChecks,
	type LucideIcon,
	Pencil,
	Target,
	UserCog,
} from 'lucide-react'
import { LocalDateTime } from '@/components/local-datetime'
import { requestPickEdit } from '@/components/picks/edit-pick-event'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import { formatDeadline } from '@/lib/format'
import type {
	GameHeroDescriptor,
	GameMode,
	HeroEntry,
	HeroPickSummary,
	HeroRound,
	HeroSurvival,
	HeroWinnerEntry,
	HeroWinnerStatIcon,
} from '@/lib/game/game-view'
import { cn } from '@/lib/utils'

/**
 * Top-of-page hero: the personal lens on the game, in one state-driven band.
 *
 * Before the deadline it owns the viewer's pick — a loud call to action with no
 * pick in, a calm confirmation with a change affordance once there is one. After
 * the deadline it flips from pick-focus to spectate-focus: the player's own live
 * read while the round runs, their result once it settles, the rebuy offer that
 * follows a round-1 elimination, a quiet spectator note when they're out for
 * good, and the winner outcome on a completed game. The field-wide standings
 * below stay the calm view, so the two never duplicate live information.
 *
 * Purely presentational: everything it branches on comes from the descriptor
 * built by `buildGameView`. The two slots are for behaviour it can't own —
 * `notices` (auto-pick / voided-pick / pending-rebuy notices, so they read as
 * part of the state rather than as banners stacked above the page) and
 * `rebuyAction` (the buttons that POST a rebuy).
 */
export interface GameHeroProps {
	hero: GameHeroDescriptor
	/** Auto-pick / voided-pick / pending-rebuy notices, rendered inside the body. */
	notices?: React.ReactNode
	/** Rebuy buttons — only rendered by the `rebuy` variant. */
	rebuyAction?: React.ReactNode
	/** Anchor the CTA scrolls to — the pick interface further down the page. */
	pickAnchor?: string
}

/** Frame + accessible name per variant. */
function skinFor(hero: GameHeroDescriptor): { frame: string; label: string } {
	switch (hero.kind) {
		case 'pick-open':
			return { frame: 'border-2 border-primary/60 bg-primary/5', label: 'Your pick' }
		case 'pick-made':
			return {
				frame: 'border border-[var(--alive)]/40 bg-[var(--alive-bg)]',
				label: 'Your pick',
			}
		case 'live':
			return { frame: survivalFrame(hero.survival), label: 'Your round' }
		case 'round-result':
			return {
				frame:
					hero.result === 'eliminated'
						? 'border border-[var(--eliminated-border)] bg-[var(--eliminated-bg)]'
						: 'border border-[var(--alive)]/40 bg-[var(--alive-bg)]',
				label: 'Your round',
			}
		case 'winner':
			return {
				frame: 'border border-amber-300 bg-gradient-to-br from-amber-50 via-amber-50 to-yellow-100',
				label: 'Game result',
			}
		case 'rebuy':
			return {
				frame: 'border-2 border-[var(--draw)]/60 bg-[var(--draw-bg)]',
				label: 'Rebuy',
			}
		case 'spectator':
			return { frame: 'border border-border bg-card', label: 'Spectating' }
		default:
			return { frame: 'border border-border bg-card', label: 'Game' }
	}
}

function survivalFrame(survival: HeroSurvival): string {
	switch (survival) {
		case 'surviving':
			return 'border border-[var(--alive)]/40 bg-[var(--alive-bg)]'
		case 'at-risk':
			return 'border border-[var(--draw)]/50 bg-[var(--draw-bg)]'
		case 'out':
			return 'border border-[var(--eliminated-border)] bg-[var(--eliminated-bg)]'
		default:
			return 'border border-border bg-card'
	}
}

export function GameHero({ hero, notices, rebuyAction, pickAnchor = '#pick' }: GameHeroProps) {
	if (hero.kind === 'none') return null

	const skin = skinFor(hero)
	const actingAsName =
		hero.kind === 'pick-open' ||
		hero.kind === 'pick-made' ||
		hero.kind === 'live' ||
		hero.kind === 'round-result'
			? hero.actingAsName
			: null

	return (
		<section
			aria-label={skin.label}
			className={cn('mb-4 md:mb-6 rounded-xl overflow-hidden', skin.frame)}
		>
			<div className="p-4 md:p-5">
				{hero.round && <RoundLine round={hero.round} deadline={deadlineModeFor(hero)} />}

				{hero.kind === 'pick-open' && (
					<PickOpenBody
						mode={hero.mode}
						round={hero.round}
						picksMade={hero.picksMade}
						picksRequired={hero.picksRequired}
						pickAnchor={pickAnchor}
					/>
				)}
				{hero.kind === 'pick-made' && (
					<PickMadeBody mode={hero.mode} pick={hero.pick} pickAnchor={pickAnchor} />
				)}
				{hero.kind === 'live' && (
					<LiveBody mode={hero.mode} entry={hero.entry} survival={hero.survival} />
				)}
				{hero.kind === 'round-result' && (
					<RoundResultBody
						mode={hero.mode}
						round={hero.round}
						entry={hero.entry}
						result={hero.result}
						nextRound={hero.nextRound}
					/>
				)}
				{hero.kind === 'winner' && (
					<WinnerBody
						winners={hero.winners}
						runnerUpName={hero.runnerUpName}
						viewerOutcome={hero.viewerOutcome}
						viewerPotShare={hero.viewerPotShare}
					/>
				)}
				{hero.kind === 'rebuy' && (
					<RebuyBody
						entryFee={hero.entryFee}
						closesAtIso={hero.closesAtIso}
						pendingPayment={hero.pendingPayment}
						eliminatedRoundLabel={hero.eliminatedRoundLabel}
						action={rebuyAction}
					/>
				)}
				{hero.kind === 'spectator' && (
					<SpectatorBody eliminatedRoundLabel={hero.eliminatedRoundLabel} />
				)}

				{actingAsName && (
					<p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--draw)] bg-[var(--draw-bg)] px-2 py-1 rounded-md">
						<UserCog className="h-3.5 w-3.5" />
						Picking as {actingAsName}
					</p>
				)}

				{notices}
			</div>
		</section>
	)
}

/** How the round line treats the deadline in each state. */
type DeadlineMode = 'countdown' | 'closed' | 'complete' | 'none'

function deadlineModeFor(hero: GameHeroDescriptor): DeadlineMode {
	switch (hero.kind) {
		case 'pick-open':
		case 'pick-made':
			return 'countdown'
		case 'live':
			return 'closed'
		case 'round-result':
			return 'complete'
		// Rebuy and spectator can both sit on a round that's still open. Neither
		// player is picking in it, so the round line names the round and stops
		// there — the rebuy copy carries the only deadline that matters to them.
		default:
			return 'none'
	}
}

function RoundLine({ round, deadline }: { round: HeroRound; deadline: DeadlineMode }) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			<span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-card text-foreground border border-border">
				{round.label}
			</span>
			<span className="font-display text-sm font-semibold">{round.longLabel}</span>
			{deadline !== 'none' && (
				<span className="flex items-center gap-1 text-xs text-muted-foreground">
					<Clock className="h-3 w-3" />
					{deadline === 'countdown' ? (
						round.deadlineIso ? (
							<>
								Deadline <LocalDateTime date={round.deadlineIso} />
								<span suppressHydrationWarning>
									{' '}
									· {formatDeadline(new Date(round.deadlineIso))} left
								</span>
							</>
						) : (
							<>Deadline TBC</>
						)
					) : deadline === 'complete' ? (
						<>Round complete</>
					) : (
						<>Picks locked</>
					)}
				</span>
			)}
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

const SURVIVAL_COPY: Record<HeroSurvival, { word: string; tint: string } | null> = {
	surviving: { word: 'Surviving', tint: 'text-[var(--alive)]' },
	'at-risk': { word: 'At risk', tint: 'text-[var(--draw)]' },
	out: { word: 'Out', tint: 'text-[var(--eliminated)]' },
	unknown: null,
}

/**
 * The personal live read: the viewer's own pick and how it's doing. Deliberately
 * not the whole field — the live ticker above and the standings below cover that.
 */
function LiveBody({
	mode,
	entry,
	survival,
}: {
	mode: GameMode
	entry: HeroEntry
	survival: HeroSurvival
}) {
	const verdict = SURVIVAL_COPY[survival]
	return (
		<div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
			<div className="flex items-center gap-3 min-w-0">
				{entry.type === 'team' && <TeamBadge shortName={entry.shortName} size="lg" />}
				<div className="min-w-0">
					<div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
						{entry.type === 'none'
							? 'No pick in'
							: entry.type === 'ranked' && entry.picksRequired > 1
								? 'Your picks'
								: 'Your pick'}
					</div>
					<EntryHeadline mode={mode} entry={entry} />
					<EntryMeta mode={mode} entry={entry} />
				</div>
			</div>
			{verdict && (
				<div className={cn('font-display text-xl md:text-2xl font-bold', verdict.tint)}>
					{verdict.word}
				</div>
			)}
		</div>
	)
}

/** The big line: the team + its score, or how the ranked slate is landing. */
function EntryHeadline({ mode, entry }: { mode: GameMode; entry: HeroEntry }) {
	if (entry.type === 'none') {
		return (
			<div className="font-display text-lg md:text-xl font-semibold leading-tight">
				{mode === 'classic' ? 'You missed the deadline' : 'Nothing submitted before the deadline'}
			</div>
		)
	}

	if (entry.type === 'team') {
		const fx = entry.fixture
		// The score sits right after the picked team's name, so it has to read from
		// THEIR side: an away pick in a 3–0 home win is 0–3, not 3–0. Without a
		// known side there's nothing to orient against — the meta line below carries
		// the scoreline with both short names instead.
		const oriented =
			fx && fx.homeScore != null && fx.awayScore != null && entry.side
				? entry.side === 'away'
					? { for: fx.awayScore, against: fx.homeScore }
					: { for: fx.homeScore, against: fx.awayScore }
				: null
		return (
			<div className="font-display text-lg md:text-xl font-semibold leading-tight">
				{entry.name}
				{oriented && (
					<span className="ml-2 tabular-nums">
						{oriented.for}–{oriented.against}
					</span>
				)}
				{entry.opponentName && (
					<span className="text-sm text-muted-foreground font-normal">
						{' '}
						vs {entry.opponentName}
						{entry.side ? ` (${entry.side === 'home' ? 'H' : 'A'})` : ''}
					</span>
				)}
			</div>
		)
	}

	return (
		<div className="font-display text-lg md:text-xl font-semibold leading-tight">
			{entry.correct} of {entry.picksMade} correct
		</div>
	)
}

/**
 * The small line under the headline. No match minute: fixtures carry a status,
 * not a clock, so live matches read "Live" rather than "60'".
 */
function EntryMeta({ mode, entry }: { mode: GameMode; entry: HeroEntry }) {
	if (entry.type === 'none') {
		return (
			<div className="text-xs text-muted-foreground mt-0.5">
				{mode === 'classic'
					? "No pick means no survival — you're out when the round settles."
					: 'The empty slots score nothing this round.'}
			</div>
		)
	}

	if (entry.type === 'team') {
		const fx = entry.fixture
		if (!fx) return null
		// Home–away, with both short names around it: the one place the scoreline is
		// unambiguous whichever side the pick was on.
		const scoreline =
			fx.homeScore != null && fx.awayScore != null
				? `${fx.homeShort} ${fx.homeScore}–${fx.awayScore} ${fx.awayShort}`
				: `${fx.homeShort} v ${fx.awayShort}`
		return (
			<div className="text-xs text-muted-foreground mt-0.5">
				{scoreline} · {matchStateLabel(fx.status)}
				{fx.status === 'scheduled' && fx.kickoffIso && (
					<>
						{' '}
						<LocalDateTime date={fx.kickoffIso} />
					</>
				)}
			</div>
		)
	}

	// "0 still to play" is noise once every slot has landed.
	const bits = [`${entry.wrong} wrong`]
	if (entry.pending > 0) bits.push(`${entry.pending} still to play`)
	if (entry.livesRemaining != null) {
		bits.push(`${entry.livesRemaining} ${entry.livesRemaining === 1 ? 'life' : 'lives'} left`)
	}
	return <div className="text-xs text-muted-foreground mt-0.5">{bits.join(' · ')}</div>
}

function matchStateLabel(status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled') {
	switch (status) {
		case 'live':
			return 'Live'
		case 'finished':
			return 'Full time'
		case 'postponed':
			return 'Postponed'
		case 'cancelled':
			return 'Cancelled'
		default:
			return 'Kick-off'
	}
}

function RoundResultBody({
	mode,
	round,
	entry,
	result,
	nextRound,
}: {
	mode: GameMode
	round: HeroRound
	entry: HeroEntry
	result: 'survived' | 'eliminated' | 'played'
	nextRound: HeroRound | null
}) {
	const heading =
		result === 'survived'
			? `You survived ${round.longLabel}`
			: result === 'eliminated'
				? "You're out"
				: `${round.longLabel} is done`

	return (
		<div className="mt-3 space-y-3">
			<div className="flex items-center gap-3 min-w-0">
				{entry.type === 'team' && <TeamBadge shortName={entry.shortName} size="lg" />}
				<div className="min-w-0">
					<h2
						className={cn(
							'font-display text-xl md:text-2xl font-bold leading-tight',
							result === 'eliminated' && 'text-[var(--eliminated)]',
							result === 'survived' && 'text-[var(--alive)]',
						)}
					>
						{heading}
					</h2>
					<EntryHeadline mode={mode} entry={entry} />
					<EntryMeta mode={mode} entry={entry} />
				</div>
			</div>
			{nextRound && (
				<p className="text-sm text-muted-foreground">
					{/* "Next up" would be a lie for someone who just went out — the round
					    is still worth naming, it just isn't theirs any more. */}
					{result === 'eliminated' ? 'The game goes on: ' : 'Next up: '}
					<span className="font-semibold text-foreground">{nextRound.longLabel}</span>
					{nextRound.deadlineIso ? (
						<>
							{' '}
							— deadline <LocalDateTime date={nextRound.deadlineIso} />
						</>
					) : (
						<> — deadline TBC</>
					)}
				</p>
			)}
		</div>
	)
}

const WINNER_ICONS: Record<HeroWinnerStatIcon, LucideIcon> = {
	flame: Flame,
	target: Target,
	heart: Heart,
	'list-checks': ListChecks,
}

function WinnerBody({
	winners,
	runnerUpName,
	viewerOutcome,
	viewerPotShare,
}: {
	winners: HeroWinnerEntry[]
	runnerUpName: string | null
	viewerOutcome: 'won' | 'shared' | 'lost'
	viewerPotShare: string | null
}) {
	const isSplit = winners.length > 1
	// The viewer's own cut, not the first winner's: a split pot's shares differ by
	// a penny when the total doesn't divide evenly.
	const share = viewerPotShare ?? '0.00'
	const heading =
		viewerOutcome === 'won'
			? `You won £${share}`
			: viewerOutcome === 'shared'
				? `You share the pot — your cut is £${share}`
				: isSplit
					? `${winners.map((w) => w.name).join(' & ')} share the pot`
					: `${winners[0]?.name ?? 'Nobody'} wins`

	return (
		<div className="mt-3 space-y-3">
			<div className="flex items-center gap-3">
				<span className="text-3xl" aria-hidden>
					🏆
				</span>
				<div className="min-w-0">
					<div className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
						{isSplit ? `Split pot · ${winners.length} way` : 'Winner'}
					</div>
					<h2 className="font-display text-xl md:text-2xl font-bold leading-tight text-amber-950">
						{heading}
					</h2>
				</div>
			</div>

			<ul className="divide-y divide-amber-200/70 rounded-lg border border-amber-200 bg-amber-50/70">
				{winners.map((w) => (
					<li key={w.userId} className="flex items-center gap-4 px-4 py-3">
						<span className="text-xl shrink-0" aria-hidden>
							🥇
						</span>
						<div className="min-w-0 flex-1">
							<div className="font-display text-base font-bold text-amber-950 truncate">
								{w.name}
							</div>
							{w.stats.length > 0 && (
								<div className="mt-0.5 flex items-center gap-3 text-xs text-amber-800">
									{w.stats.map((s) => {
										const Icon = WINNER_ICONS[s.iconKey]
										return (
											<span key={s.label} className="inline-flex items-center gap-1">
												<Icon className="h-3 w-3" />
												<span className="font-semibold">{s.value}</span>
												<span className="text-amber-700/80">{s.label}</span>
											</span>
										)
									})}
								</div>
							)}
						</div>
						<div className="text-right shrink-0">
							<div className="font-display text-xl font-bold leading-none text-amber-900">
								£{w.potShare}
							</div>
							<div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
								{isSplit ? 'share' : 'won'}
							</div>
						</div>
					</li>
				))}
			</ul>

			{runnerUpName && (
				<p className="text-[11px] text-amber-800">
					Runner-up: <span className="font-semibold text-amber-900">{runnerUpName}</span>
				</p>
			)}
		</div>
	)
}

function RebuyBody({
	entryFee,
	closesAtIso,
	pendingPayment,
	eliminatedRoundLabel,
	action,
}: {
	entryFee: string
	closesAtIso: string | null
	pendingPayment: { id: string; amount: string } | null
	eliminatedRoundLabel: string | null
	action?: React.ReactNode
}) {
	return (
		<div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
			<div className="min-w-0">
				<h2 className="font-display text-xl md:text-2xl font-bold leading-tight">
					{pendingPayment ? 'Rebuy payment pending' : `Buy back in for £${entryFee}`}
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{pendingPayment ? (
						<>
							Mark as paid once you've transferred £{pendingPayment.amount}. You're back in as soon
							as the payment is claimed.
						</>
					) : (
						<>
							{eliminatedRoundLabel
								? `You went out in ${eliminatedRoundLabel}. `
								: 'You went out in round 1. '}
							One rebuy is on offer
							{closesAtIso ? (
								<>
									{' '}
									— it closes at the round 2 deadline (<LocalDateTime date={closesAtIso} />)
								</>
							) : null}
							.
						</>
					)}
				</p>
			</div>
			{action}
		</div>
	)
}

function SpectatorBody({ eliminatedRoundLabel }: { eliminatedRoundLabel: string | null }) {
	return (
		<div className="mt-2">
			<p className="text-sm text-muted-foreground">
				{eliminatedRoundLabel ? (
					<>
						Eliminated in{' '}
						<span className="font-semibold text-foreground">{eliminatedRoundLabel}</span> — you're
						spectating.
					</>
				) : (
					<>You're out of this one — spectating.</>
				)}{' '}
				Live scores and standings are below.
			</p>
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
