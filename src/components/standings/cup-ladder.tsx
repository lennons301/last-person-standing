'use client'

import { AlertTriangle, CheckCircle2, Flame, Target, Zap } from 'lucide-react'
import { useLiveGame } from '@/components/live/use-live-game'
import { HeartIcon } from '@/components/picks/heart-icon'
import { PlusNBadge } from '@/components/picks/plus-n-badge'
import { TeamBadge } from '@/components/picks/team-badge'
import { TierPips } from '@/components/picks/tier-pips'
import type {
	CupLadderBacker,
	CupLadderData,
	CupLadderFixture,
	CupStandingsPlayer,
} from '@/lib/game/cup-standings-queries'
import type { LiveFixture } from '@/lib/live/types'
import { cn } from '@/lib/utils'

interface CupLadderProps {
	data: CupLadderData
	// Admin pick-for-player action is rendered on per-player rows. The ladder
	// view groups players by fixture/backer, so there's no natural row-level
	// "this player hasn't picked" surface. Deferred — the cup-grid view already
	// exposes the same ✎ action for cup games.
	showAdminActions?: boolean
	gameId?: string
}

const LIVE_FLASH_MS = 1500

export function CupLadder({ data }: CupLadderProps) {
	const { payload, events } = useLiveGame()
	const now = Date.now()

	const liveFixtureById = new Map<string, LiveFixture>()
	for (const f of payload?.fixtures ?? []) {
		liveFixtureById.set(f.id, f)
	}

	const recentGoalByFixture = new Map<string, 'home' | 'away'>()
	for (const ev of events.goals) {
		if (now - ev.observedAt <= LIVE_FLASH_MS) {
			recentGoalByFixture.set(ev.fixtureId, ev.side)
		}
	}

	const played = data.fixtures.filter((f) => f.actualOutcome != null)
	const unplayed = data.fixtures.filter((f) => f.actualOutcome == null)
	const top3 = [...data.players]
		.filter((p) => p.status !== 'eliminated')
		.sort((a, b) => b.streak - a.streak || b.goals - a.goals)
		.slice(0, 3)

	return (
		<div className="space-y-6">
			<Podium players={top3} maxLives={data.maxLives} />
			{unplayed.length > 0 && (
				<section>
					<h3 className="flex items-center gap-2 font-display text-lg font-semibold mb-3">
						<Zap className="h-4 w-4 text-[var(--accent)]" />
						Still to play
					</h3>
					<div className="space-y-2">
						{unplayed.map((f) => (
							<CupFixtureCard
								key={f.id}
								fixture={f}
								liveFixture={liveFixtureById.get(f.id)}
								recentGoalSide={recentGoalByFixture.get(f.id)}
							/>
						))}
					</div>
				</section>
			)}
			{played.length > 0 && (
				<section>
					<h3 className="flex items-center gap-2 font-display text-lg font-semibold mb-3">
						<CheckCircle2 className="h-4 w-4 text-[var(--alive)]" />
						Played
					</h3>
					<div className="space-y-2">
						{played.map((f) => (
							<CupFixtureCard
								key={f.id}
								fixture={f}
								liveFixture={liveFixtureById.get(f.id)}
								recentGoalSide={recentGoalByFixture.get(f.id)}
							/>
						))}
					</div>
				</section>
			)}
		</div>
	)
}

function Podium({ players, maxLives }: { players: CupStandingsPlayer[]; maxLives: number }) {
	if (players.length === 0) return null
	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
			{players.map((p, i) => {
				const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉'
				const borderTone =
					i === 0 ? 'border-[var(--alive)]/60 bg-[var(--alive-bg)]' : 'border-border bg-card'
				const lowLives = p.livesRemaining <= 1
				return (
					<div
						key={p.id}
						className={cn(
							'rounded-lg border-2 p-4 flex items-center justify-between gap-3',
							borderTone,
						)}
					>
						<div className="flex items-center gap-3 min-w-0">
							<div className="text-2xl">{medal}</div>
							<div className="min-w-0">
								<div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
									{i === 0 ? 'Leader' : `#${i + 1}`}
								</div>
								<div className="font-display text-xl font-semibold truncate">{p.name}</div>
							</div>
						</div>
						<div className="flex flex-col items-end shrink-0 gap-1">
							<div className="flex items-center gap-1 text-lg font-display font-bold">
								<Flame className="h-4 w-4 text-[var(--draw)]" />
								{p.streak}
							</div>
							<div
								className={cn(
									'flex items-center gap-1 text-xs',
									lowLives ? 'text-[var(--eliminated)] font-bold' : 'text-muted-foreground',
								)}
								title={`${p.livesRemaining} of ${maxLives} lives`}
							>
								<HeartIcon size={12} />
								{p.livesRemaining}/{maxLives}
							</div>
							<div className="flex items-center gap-1 text-xs text-muted-foreground">
								<Target className="h-3 w-3" />
								{p.goals}
							</div>
						</div>
					</div>
				)
			})}
		</div>
	)
}

function CupFixtureCard({
	fixture,
	liveFixture,
	recentGoalSide,
}: {
	fixture: CupLadderFixture
	liveFixture?: LiveFixture
	recentGoalSide?: 'home' | 'away'
}) {
	const isPlayed = fixture.actualOutcome != null
	const liveStatus = liveFixture?.status
	const liveInProgress = liveStatus === 'live' || liveStatus === 'halftime'
	// Override stored scores with live values when we have them (covers pre-settlement).
	const displayHome = liveFixture?.homeScore != null ? liveFixture.homeScore : fixture.homeScore
	const displayAway = liveFixture?.awayScore != null ? liveFixture.awayScore : fixture.awayScore
	const score = displayHome != null && displayAway != null ? `${displayHome}–${displayAway}` : null

	return (
		<div
			className={cn(
				'rounded-lg border bg-card overflow-hidden transition-shadow duration-300',
				fixture.crucial && 'border-[var(--draw)] shadow-[0_0_0_1px_var(--draw)]',
				liveInProgress && 'border-primary/60 shadow-[0_0_0_1px_var(--primary,#2563eb)]',
				recentGoalSide && 'ring-2 ring-emerald-400 animate-[pulse_0.9s_ease-in-out_2]',
			)}
		>
			{fixture.crucial && (
				<div className="bg-[var(--draw-bg)] text-[var(--draw)] text-xs font-semibold px-3 py-1 flex items-center gap-1.5">
					<AlertTriangle className="h-3.5 w-3.5" />
					Crucial fixture
				</div>
			)}

			{/* Fixture header */}
			<div className="flex items-stretch">
				<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0 flex-row-reverse">
					<TeamBadge
						shortName={fixture.homeTeam.shortName}
						badgeUrl={fixture.homeTeam.badgeUrl}
						size="lg"
					/>
					<div className="flex flex-col items-end min-w-0">
						<span className="font-semibold text-base truncate w-full text-right">
							{fixture.homeTeam.name}
						</span>
						<span className="text-xs text-muted-foreground">Home</span>
					</div>
				</div>
				<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[96px] bg-muted/30 border-l border-r border-border">
					{score ? (
						<>
							<span className="font-display font-bold text-lg leading-none">{score}</span>
							<span
								className={cn(
									'text-[0.65rem] font-semibold uppercase tracking-wider mt-1',
									liveInProgress
										? 'text-primary animate-[pulse_1.4s_ease-in-out_infinite]'
										: 'text-muted-foreground',
								)}
							>
								{liveInProgress
									? liveStatus === 'halftime'
										? 'HT'
										: 'LIVE'
									: fixture.actualOutcome
										? outcomeLabel(fixture.actualOutcome as 'home_win' | 'draw' | 'away_win')
										: ''}
							</span>
						</>
					) : (
						<>
							<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
								vs
							</span>
							{fixture.kickoff && (
								<span className="text-[0.7rem] text-muted-foreground mt-1 text-center leading-tight">
									{fixture.kickoff.toLocaleDateString('en-GB', { weekday: 'short' })}{' '}
									{fixture.kickoff.toLocaleTimeString('en-GB', {
										hour: '2-digit',
										minute: '2-digit',
									})}
								</span>
							)}
						</>
					)}
					<div className="mt-1.5 flex items-center gap-1">
						<TierPips value={Math.min(fixture.plusN, 3) as 0 | 1 | 2 | 3} max={3} />
						{fixture.plusN >= 1 && <PlusNBadge value={fixture.plusN} />}
						{fixture.heart && <HeartIcon size={12} />}
					</div>
				</div>
				<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
					<TeamBadge
						shortName={fixture.awayTeam.shortName}
						badgeUrl={fixture.awayTeam.badgeUrl}
						size="lg"
					/>
					<div className="flex flex-col items-start min-w-0">
						<span className="font-semibold text-base truncate w-full">{fixture.awayTeam.name}</span>
						<span className="text-xs text-muted-foreground">Away</span>
					</div>
				</div>
			</div>

			{/* Backers */}
			<div className="border-t border-border bg-muted/10 px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
				<BackerGroup
					label={`Backing ${fixture.homeTeam.shortName}`}
					backers={fixture.homeBackers}
					isCorrectOutcome={fixture.actualOutcome === 'home_win'}
					isPlayed={isPlayed}
					side="home"
				/>
				<BackerGroup
					label={`Backing ${fixture.awayTeam.shortName}`}
					backers={fixture.awayBackers}
					isCorrectOutcome={fixture.actualOutcome === 'away_win'}
					isPlayed={isPlayed}
					side="away"
				/>
			</div>
		</div>
	)
}

function BackerGroup({
	label,
	backers,
	isCorrectOutcome,
	isPlayed,
	side,
}: {
	label: string
	backers: CupLadderBacker[]
	isCorrectOutcome: boolean
	isPlayed: boolean
	side: 'home' | 'away'
}) {
	const headerColour = side === 'home' ? 'text-[var(--accent)]' : 'text-[var(--eliminated)]'
	const borderTone =
		isPlayed && isCorrectOutcome
			? 'border-[var(--alive)] bg-[var(--alive-bg)]'
			: 'border-border bg-card'

	return (
		<div className={cn('rounded border p-2', borderTone)}>
			<div className={cn('text-[0.65rem] font-bold uppercase tracking-wide mb-1.5', headerColour)}>
				{label}
				{backers.length > 0 && (
					<span className="ml-1 text-muted-foreground font-medium">({backers.length})</span>
				)}
			</div>
			{backers.length === 0 ? (
				<div className="text-[0.7rem] text-muted-foreground italic">No one picked this</div>
			) : (
				<div className="flex flex-wrap gap-1">
					{backers.map((b) => (
						<BackerChip key={`${b.playerId}-${b.confidenceRank}`} backer={b} />
					))}
				</div>
			)}
		</div>
	)
}

function BackerChip({ backer }: { backer: CupLadderBacker }) {
	if (backer.result === 'hidden') {
		return (
			<span className="text-[0.65rem] font-medium px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-dashed border-border">
				🔒
			</span>
		)
	}

	const bg =
		backer.result === 'win'
			? 'bg-[var(--alive)] text-white'
			: backer.result === 'saved_by_life'
				? 'bg-amber-500 text-white'
				: backer.result === 'loss'
					? 'bg-[var(--eliminated-bg)] text-[var(--eliminated)] line-through'
					: 'bg-muted text-foreground'

	return (
		<span
			className={cn(
				'relative inline-flex items-center gap-1 text-[0.65rem] font-semibold px-1.5 py-0.5 rounded',
				bg,
			)}
			title={`Ranked #${backer.confidenceRank}`}
		>
			<span>{backer.playerName}</span>
			<span className="opacity-75">#{backer.confidenceRank}</span>
			{backer.livesGained > 0 && (
				<span className="ml-0.5 bg-emerald-700 text-white text-[8px] px-1 rounded-full font-bold">
					+{backer.livesGained}
				</span>
			)}
			{backer.livesSpent > 0 && (
				<span className="ml-0.5 bg-amber-800 text-white text-[8px] px-1 rounded-full font-bold">
					-{backer.livesSpent}
				</span>
			)}
		</span>
	)
}

function outcomeLabel(o: 'home_win' | 'draw' | 'away_win'): string {
	return o === 'home_win' ? 'HOME' : o === 'away_win' ? 'AWAY' : 'DRAW'
}
