import { Flame, Trophy } from 'lucide-react'
import type { Outcome, PlayerOutlook, WinScenarios } from '@/lib/game-logic/win-scenarios'
import { cn } from '@/lib/utils'

interface ScenariosViewProps {
	scenarios: WinScenarios
	/** gamePlayerId → display name. */
	playerName: (id: string) => string
	/** fixtureId → "GHA v CRO". */
	fixtureLabel: (id: string) => string
	/** fixtureId + outcome → "GHA win" / "CRO win" / "draw". */
	describeOutcome: (id: string, outcome: Outcome) => string
}

const VERDICT_ORDER: Record<PlayerOutlook['verdict'], number> = {
	leading: 0,
	in_contention: 1,
	out: 2,
}

/**
 * "What needs to happen" — each player's path to winning, plus (once it narrows
 * to a few results) the exact branch table. Shared by turbo + cup.
 */
export function ScenariosView({
	scenarios,
	playerName,
	fixtureLabel,
	describeOutcome,
}: ScenariosViewProps) {
	const outlooks = [...scenarios.outlooks].sort(
		(a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.ceiling - a.ceiling,
	)

	return (
		<div className="space-y-5">
			{scenarios.tooManyToEnumerate && (
				<p className="text-xs text-muted-foreground italic">
					Too many results still to play to map exact scenarios — showing each player's best/worst
					case for now. This sharpens as fixtures finish.
				</p>
			)}

			<div className="space-y-2">
				{outlooks.map((o) => (
					<OutlookCard
						key={o.gamePlayerId}
						outlook={o}
						name={playerName(o.gamePlayerId)}
						fixtureLabel={fixtureLabel}
					/>
				))}
			</div>

			{scenarios.table && scenarios.table.length > 0 && (
				<div>
					<h3 className="flex items-center gap-2 font-display text-lg font-semibold mb-2">
						<Trophy className="h-4 w-4 text-[var(--accent)]" /> How it's decided
					</h3>
					<div className="space-y-1.5">
						{scenarios.table.map((b) => (
							<div
								key={`${b.conditions.map((c) => `${c.fixtureId}:${c.outcome}`).join('|')}`}
								className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
							>
								<span className="text-muted-foreground">
									{b.conditions.length === 0
										? 'However it finishes'
										: b.conditions.map((c) => describeOutcome(c.fixtureId, c.outcome)).join(' · ')}
								</span>
								<span className="text-muted-foreground">→</span>
								<span className="font-semibold">
									{b.tieOnGoals
										? `${b.winners.map(playerName).join(' & ')} tie (goals decide)`
										: `${b.winners.map(playerName).join(' & ')} win${b.winners.length > 1 ? ' (split)' : 's'}`}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

function OutlookCard({
	outlook,
	name,
	fixtureLabel,
}: {
	outlook: PlayerOutlook
	name: string
	fixtureLabel: (id: string) => string
}) {
	const { verdict, floor, ceiling, pivotalPicks } = outlook
	const streak = floor === ceiling ? `${floor}` : `${floor}–${ceiling}`
	return (
		<div
			className={cn(
				'rounded-lg border px-3 py-2.5',
				verdict === 'leading'
					? 'border-[var(--alive)]/60 bg-[var(--alive-bg)]/40'
					: verdict === 'out'
						? 'border-border bg-muted/20 opacity-70'
						: 'border-border bg-card',
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold truncate">{name}</span>
				<VerdictBadge verdict={verdict} />
			</div>
			<div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1">
					<Flame className="h-3 w-3 text-[var(--draw)]" /> streak {streak}
				</span>
				{verdict === 'in_contention' && pivotalPicks.length > 0 && (
					<span>
						hinges on{' '}
						<span className="font-medium text-foreground">
							{fixtureLabel(pivotalPicks[0].fixtureId)}
						</span>
						{pivotalPicks.length > 1 && `, then ${pivotalPicks.length - 1} more`}
					</span>
				)}
			</div>
		</div>
	)
}

function VerdictBadge({ verdict }: { verdict: PlayerOutlook['verdict'] }) {
	const map = {
		leading: { label: 'Leading', cls: 'bg-[var(--alive)] text-white' },
		in_contention: { label: 'In contention', cls: 'bg-[var(--draw-bg)] text-[var(--draw)]' },
		out: { label: "Can't win", cls: 'bg-[var(--eliminated-bg)] text-[var(--eliminated)]' },
	}[verdict]
	return (
		<span
			className={cn(
				'shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
				map.cls,
			)}
		>
			{map.label}
		</span>
	)
}
