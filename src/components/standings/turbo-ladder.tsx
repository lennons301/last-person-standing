'use client'

import { AlertTriangle, CheckCircle2, Flame, Target, XCircle, Zap } from 'lucide-react'
import { LocalDateTime } from '@/components/local-datetime'
import { TeamBadge } from '@/components/picks/team-badge'
import { cn } from '@/lib/utils'

export interface LadderPrediction {
	playerId: string
	playerName: string
	prediction: 'home_win' | 'draw' | 'away_win'
	rank: number
	correct: boolean | null
	streakBroken: boolean
	hidden: boolean
}

export interface LadderFixture {
	id: string
	home: { shortName: string; name: string; badgeUrl?: string | null }
	away: { shortName: string; name: string; badgeUrl?: string | null }
	kickoff: Date | null
	homeScore: number | null
	awayScore: number | null
	actualOutcome: 'home_win' | 'draw' | 'away_win' | null
	avgRank: number
	predictions: LadderPrediction[]
}

export interface LadderPlayer {
	id: string
	name: string
	streak: number
	goals: number
	hasSubmitted: boolean
}

interface TurboLadderProps {
	fixtures: LadderFixture[]
	players: LadderPlayer[]
	roundStatus: 'open' | 'active' | 'completed'
}

function formatScore(f: LadderFixture): string | null {
	if (f.homeScore == null || f.awayScore == null) return null
	return `${f.homeScore}–${f.awayScore}`
}

function outcomeLabel(o: 'home_win' | 'draw' | 'away_win'): string {
	return o === 'home_win' ? 'HOME' : o === 'away_win' ? 'AWAY' : 'DRAW'
}

export function TurboLadder({ fixtures, players, roundStatus }: TurboLadderProps) {
	const sortedPlayers = [...players].sort((a, b) => {
		if (b.streak !== a.streak) return b.streak - a.streak
		return b.goals - a.goals
	})
	const topPlayers = sortedPlayers.slice(0, 3)

	const unplayed = fixtures.filter((f) => f.actualOutcome == null)
	const played = fixtures.filter((f) => f.actualOutcome != null)

	// Work out which still-to-play fixtures are "crucial" — streaks would diverge
	// based on outcome, meaning the leaderboard could still change.
	const crucialFixtureIds = new Set<string>()
	for (const f of unplayed) {
		const outcomeCounts = { home_win: 0, draw: 0, away_win: 0 }
		for (const p of f.predictions) {
			outcomeCounts[p.prediction]++
		}
		// If predictions are split across at least 2 outcomes with 2+ players each,
		// or if more than ~60% of players are on one side, consider it "key"
		const distinct = Object.values(outcomeCounts).filter((c) => c >= 1).length
		if (distinct >= 2 && f.predictions.length >= 2) {
			crucialFixtureIds.add(f.id)
		}
	}

	return (
		<div className="space-y-6">
			{/* Podium */}
			{topPlayers.length > 0 && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					{topPlayers.map((p, i) => {
						const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉'
						const borderTone =
							i === 0 ? 'border-[var(--alive)]/60 bg-[var(--alive-bg)]' : 'border-border bg-card'
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
								<div className="flex flex-col items-end shrink-0">
									<div className="flex items-center gap-1 text-lg font-display font-bold">
										<Flame className="h-4 w-4 text-[var(--draw)]" />
										{p.streak}
									</div>
									<div className="flex items-center gap-1 text-xs text-muted-foreground">
										<Target className="h-3 w-3" />
										{p.goals} goals
									</div>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Still to play — only if game isn't completed */}
			{roundStatus !== 'completed' && unplayed.length > 0 && (
				<div>
					<h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
						<Zap className="h-4 w-4 text-[var(--accent)]" />
						Still to play
					</h3>
					<div className="space-y-2">
						{unplayed.map((f) => (
							<FixtureRow key={f.id} fixture={f} crucial={crucialFixtureIds.has(f.id)} showPaths />
						))}
					</div>
				</div>
			)}

			{/* Played */}
			{played.length > 0 && (
				<div>
					<h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
						<CheckCircle2 className="h-4 w-4 text-[var(--alive)]" />
						Played
					</h3>
					<div className="space-y-2">
						{played.map((f) => (
							<FixtureRow key={f.id} fixture={f} />
						))}
					</div>
				</div>
			)}
		</div>
	)
}

function FixtureRow({
	fixture,
	crucial,
	showPaths,
}: {
	fixture: LadderFixture
	crucial?: boolean
	showPaths?: boolean
}) {
	const outcomeCounts = { home_win: 0, draw: 0, away_win: 0 }
	for (const p of fixture.predictions) {
		outcomeCounts[p.prediction]++
	}
	const total = fixture.predictions.length || 1

	const isPlayed = fixture.actualOutcome != null
	const score = formatScore(fixture)

	// Predictions grouped by outcome
	const byOutcome = (o: 'home_win' | 'draw' | 'away_win') =>
		fixture.predictions.filter((p) => p.prediction === o)

	// Streak-breaker players for this fixture (only when played)
	const streakBreakers = isPlayed
		? fixture.predictions.filter((p) => p.streakBroken && !p.hidden)
		: []

	return (
		<div
			className={cn(
				'rounded-lg border bg-card overflow-hidden',
				crucial && 'border-[var(--draw)] shadow-[0_0_0_1px_var(--draw)]',
			)}
		>
			{crucial && (
				<div className="bg-[var(--draw-bg)] text-[var(--draw)] text-xs font-semibold px-3 py-1 flex items-center gap-1.5">
					<AlertTriangle className="h-3.5 w-3.5" />
					Key fixture — outcome decides the leader
				</div>
			)}

			{/* Fixture header */}
			<div className="flex items-stretch">
				<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0 flex-row-reverse">
					<TeamBadge
						shortName={fixture.home.shortName}
						badgeUrl={fixture.home.badgeUrl}
						size="lg"
					/>
					<div className="flex flex-col items-end min-w-0">
						<span className="font-semibold text-base truncate w-full text-right">
							{fixture.home.name}
						</span>
						<span className="text-xs text-muted-foreground">Home</span>
					</div>
				</div>
				<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[88px] bg-muted/30 border-l border-r border-border">
					{score ? (
						<>
							<span className="font-display font-bold text-lg leading-none">{score}</span>
							<span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
								{outcomeLabel(fixture.actualOutcome as 'home_win' | 'draw' | 'away_win')}
							</span>
						</>
					) : (
						<>
							<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
								vs
							</span>
							{fixture.kickoff && (
								<LocalDateTime
									date={fixture.kickoff}
									options={{
										weekday: 'short',
										hour: '2-digit',
										minute: '2-digit',
									}}
									className="text-[0.7rem] text-muted-foreground mt-1 text-center leading-tight"
								/>
							)}
						</>
					)}
				</div>
				<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
					<TeamBadge
						shortName={fixture.away.shortName}
						badgeUrl={fixture.away.badgeUrl}
						size="lg"
					/>
					<div className="flex flex-col items-start min-w-0">
						<span className="font-semibold text-base truncate w-full">{fixture.away.name}</span>
						<span className="text-xs text-muted-foreground">Away</span>
					</div>
				</div>
			</div>

			{/* Predictions breakdown */}
			<div className="border-t border-border bg-muted/10 px-4 py-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Predictions
					</span>
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<SplitBar outcome="home_win" count={outcomeCounts.home_win} total={total} />
						<SplitBar outcome="draw" count={outcomeCounts.draw} total={total} />
						<SplitBar outcome="away_win" count={outcomeCounts.away_win} total={total} />
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
					<PredictionGroup
						label="Home win"
						outcome="home_win"
						predictions={byOutcome('home_win')}
						isCorrectOutcome={fixture.actualOutcome === 'home_win'}
						isPlayed={isPlayed}
					/>
					<PredictionGroup
						label="Draw"
						outcome="draw"
						predictions={byOutcome('draw')}
						isCorrectOutcome={fixture.actualOutcome === 'draw'}
						isPlayed={isPlayed}
					/>
					<PredictionGroup
						label="Away win"
						outcome="away_win"
						predictions={byOutcome('away_win')}
						isCorrectOutcome={fixture.actualOutcome === 'away_win'}
						isPlayed={isPlayed}
					/>
				</div>

				{streakBreakers.length > 0 && (
					<div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs">
						<XCircle className="h-3.5 w-3.5 text-[var(--eliminated)] shrink-0" />
						<span className="font-semibold text-[var(--eliminated)]">Streak ended:</span>
						<span className="text-muted-foreground">
							{streakBreakers.map((p) => p.playerName).join(', ')}
						</span>
					</div>
				)}

				{showPaths && !isPlayed && (
					<div className="mt-3 pt-3 border-t border-border text-xs">
						<PathsToSuccess fixture={fixture} outcomeCounts={outcomeCounts} />
					</div>
				)}
			</div>
		</div>
	)
}

function SplitBar({
	outcome,
	count,
	total,
}: {
	outcome: 'home_win' | 'draw' | 'away_win'
	count: number
	total: number
}) {
	const pct = total > 0 ? Math.round((count / total) * 100) : 0
	const colour =
		outcome === 'home_win'
			? 'bg-[var(--accent)]'
			: outcome === 'draw'
				? 'bg-[var(--draw)]'
				: 'bg-[var(--eliminated)]'
	return (
		<span className="flex items-center gap-1 min-w-[70px]">
			<span className="w-12 h-1 bg-muted rounded-full overflow-hidden">
				<span className={cn('block h-full', colour)} style={{ width: `${pct}%` }} />
			</span>
			<span className="text-[0.65rem] font-medium">
				{count}/{total}
			</span>
		</span>
	)
}

function PredictionGroup({
	label,
	outcome,
	predictions,
	isCorrectOutcome,
	isPlayed,
}: {
	label: string
	outcome: 'home_win' | 'draw' | 'away_win'
	predictions: LadderPrediction[]
	isCorrectOutcome: boolean
	isPlayed: boolean
}) {
	const headerColour =
		outcome === 'home_win'
			? 'text-[var(--accent)]'
			: outcome === 'draw'
				? 'text-[var(--draw)]'
				: 'text-[var(--eliminated)]'

	const borderTone =
		isPlayed && isCorrectOutcome
			? 'border-[var(--alive)] bg-[var(--alive-bg)]'
			: 'border-border bg-card'

	return (
		<div className={cn('rounded border p-2', borderTone)}>
			<div className={cn('text-[0.65rem] font-bold uppercase tracking-wide mb-1.5', headerColour)}>
				{label}
				{predictions.length > 0 && (
					<span className="ml-1 text-muted-foreground font-medium">({predictions.length})</span>
				)}
			</div>
			{predictions.length === 0 ? (
				<div className="text-[0.7rem] text-muted-foreground italic">No one picked this</div>
			) : (
				<div className="flex flex-wrap gap-1">
					{predictions.map((p) =>
						p.hidden ? (
							<span
								key={p.playerId}
								className="text-[0.65rem] font-medium px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-dashed border-border"
							>
								🔒
							</span>
						) : (
							<span
								key={p.playerId}
								className={cn(
									'text-[0.65rem] font-semibold px-1.5 py-0.5 rounded',
									isPlayed && p.correct
										? 'bg-[var(--alive)] text-white'
										: isPlayed && !p.correct
											? 'bg-[var(--eliminated-bg)] text-[var(--eliminated)] line-through'
											: 'bg-muted text-foreground',
								)}
								title={`Ranked #${p.rank}`}
							>
								{p.playerName}
							</span>
						),
					)}
				</div>
			)}
		</div>
	)
}

function PathsToSuccess({
	fixture,
	outcomeCounts,
}: {
	fixture: LadderFixture
	outcomeCounts: Record<'home_win' | 'draw' | 'away_win', number>
}) {
	// Return three lines: if Home → who benefits, if Draw → who, if Away → who
	const outcomes: Array<['home_win' | 'draw' | 'away_win', string]> = [
		['home_win', `${fixture.home.shortName} win`],
		['draw', 'Draw'],
		['away_win', `${fixture.away.shortName} win`],
	]

	// For a simple heuristic: the outcome that benefits the fewest picks is the "shock"
	// path (highest value for people who predicted it), and the most-picked outcome
	// is the "consensus" path.
	return (
		<div className="space-y-1">
			<div className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground mb-1">
				Paths
			</div>
			{outcomes.map(([o, label]) => {
				const count = outcomeCounts[o]
				const shockiness = count === 0 ? 'nobody' : count === 1 ? 'one' : 'consensus'
				return (
					<div key={o} className="flex items-start gap-2">
						<span
							className={cn(
								'text-[0.65rem] font-bold uppercase tracking-wide shrink-0 w-14',
								o === 'home_win'
									? 'text-[var(--accent)]'
									: o === 'draw'
										? 'text-[var(--draw)]'
										: 'text-[var(--eliminated)]',
							)}
						>
							{label}
						</span>
						<span className="text-xs text-muted-foreground">
							{shockiness === 'nobody'
								? 'No one predicted this — breaks everyone alive'
								: shockiness === 'one'
									? `Only 1 player benefits — big swing available`
									: `${count} players advance together`}
						</span>
					</div>
				)
			})}
		</div>
	)
}
