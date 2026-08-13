import Link from 'next/link'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import type { CareerHeadline, MeSummaryView } from '@/lib/game/me-summary-view'

/** A rate as whole percent, or a dash where there's nothing to divide by. */
function percent(rate: number | null): string {
	return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

function Stat({
	label,
	value,
	note,
}: {
	label: string
	value: React.ReactNode
	note?: React.ReactNode
}) {
	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
			<div className="font-display text-2xl font-semibold mt-1">{value}</div>
			{note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
		</div>
	)
}

function CareerHeadlineCards({ headline }: { headline: CareerHeadline }) {
	const { pickAccuracy: accuracy, mostPickedTeam: team } = headline

	return (
		<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
			<Stat label="Games played" value={headline.gamesPlayed} />
			<Stat label="Games won" value={headline.gamesWon} />
			<Stat label="Win rate" value={percent(headline.winRate)} />
			<Stat
				label="Pick accuracy"
				value={percent(accuracy.rate)}
				note={
					<>
						{accuracy.successful} of {accuracy.settled} picks came off
						{accuracy.savedByLife > 0 && ` · ${accuracy.savedByLife} saved by a life`}
					</>
				}
			/>
			<Stat
				label="Most picked"
				value={
					team ? (
						<span className="inline-flex items-center gap-2">
							<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="sm" />
							<span className="truncate">{team.name}</span>
						</span>
					) : (
						'—'
					)
				}
				note={team ? `${team.picks} ${team.picks === 1 ? 'pick' : 'picks'}` : 'No picks yet'}
			/>
		</div>
	)
}

/**
 * The player's own summary page, rendered straight from
 * `buildMeSummaryView`'s model. Every figure here is decided by the builder —
 * this file only lays it out, which is what keeps the page itself free of
 * branching.
 *
 * There is no id in sight: the page it belongs to reads its player from the
 * session, so this component is never rendered for anybody else.
 */
export function PlayerSummaryView({ summary }: { summary: MeSummaryView }) {
	if (summary.kind === 'empty') {
		return (
			<div className="max-w-md mx-auto text-center py-12">
				<h1 className="font-display text-2xl font-semibold mb-2">Your summary</h1>
				<p className="text-muted-foreground mb-6">
					Nothing to show yet — play a game and your record will build up here.
				</p>
				<Button asChild size="lg">
					<Link href="/game/create">Create a game</Link>
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="font-display text-2xl font-semibold">Your summary</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Your record across every game you&apos;ve played.
				</p>
			</div>
			<CareerHeadlineCards headline={summary.headline} />
		</div>
	)
}
