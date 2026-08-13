import Link from 'next/link'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import type {
	CareerHeadline,
	MeSummaryView,
	TeamRecord,
	TeamRecordFamily,
} from '@/lib/game/me-summary-view'

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

function TeamRecordRow({ record }: { record: TeamRecord }) {
	return (
		<li className="flex items-center gap-2 py-2">
			<TeamBadge shortName={record.shortName} badgeUrl={record.badgeUrl} size="sm" />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium leading-tight">{record.name}</div>
				<div className="text-2xs text-muted-foreground leading-tight mt-0.5">
					{record.picks} {record.picks === 1 ? 'pick' : 'picks'} · {record.wins}{' '}
					{record.wins === 1 ? 'win' : 'wins'}
					{record.savedByLife > 0 && ` · ${record.savedByLife} saved by a life`}
				</div>
			</div>
			<div className="shrink-0 font-display text-base font-semibold tabular-nums">
				{percent(record.rate)}
			</div>
		</li>
	)
}

function TeamRecordList({ records }: { records: TeamRecord[] }) {
	return (
		<ul className="divide-y divide-border/60">
			{records.map((record) => (
				<TeamRecordRow key={record.teamId} record={record} />
			))}
		</ul>
	)
}

/**
 * One end of a family's ranking. Absent rather than empty: a family with a
 * single team has a best and no worst, and a labelled empty list would read as
 * missing data.
 */
function TeamRecordEnd({ label, records }: { label: string; records: TeamRecord[] }) {
	if (records.length === 0) return null
	return (
		<div>
			<div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
			<TeamRecordList records={records} />
		</div>
	)
}

/**
 * One competition family's team records: both ends up front, the whole list a
 * tap away. The heading is the family, never a season — the seasons in it are
 * pooled, which is the only way a per-team rate gets a sample worth reading.
 */
function TeamRecordFamilyBlock({ family }: { family: TeamRecordFamily }) {
	const teams = `${family.all.length} ${family.all.length === 1 ? 'team' : 'teams'}`
	// What pooled, rather than a claim that something did: one season is the
	// ordinary case for a tournament, and saying "1 season" is how the two-season
	// block above it reads as the pooling it is.
	const pooled =
		family.seasons > 0
			? `${teams} picked across ${family.seasons} ${family.seasons === 1 ? 'season' : 'seasons'}.`
			: `${teams} picked.`

	return (
		<div className="rounded-lg border border-border bg-card p-4 space-y-3">
			<div>
				<h3 className="font-display text-base font-semibold">{family.name}</h3>
				<p className="text-xs text-muted-foreground mt-0.5">{pooled}</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<TeamRecordEnd label="Best" records={family.best} />
				<TeamRecordEnd label="Worst" records={family.worst} />
			</div>
			<Disclosure title={`All ${teams}`} defaultOpen={false} bordered={false}>
				<TeamRecordList records={family.all} />
			</Disclosure>
		</div>
	)
}

/**
 * The Teams section: one block per competition family, and nothing across them.
 * A World Cup side and a league one have never faced the same opposition, so a
 * single leaderboard over both would rank nothing — which is why there is no
 * career-wide team list here at any width.
 */
function TeamsSection({ families }: { families: TeamRecordFamily[] }) {
	if (families.length === 0) return null

	return (
		<section className="space-y-3">
			<div>
				<h2 className="font-display text-lg font-semibold">Teams</h2>
				<p className="text-sm text-muted-foreground mt-1">
					How each team you&apos;ve picked has served you, one competition at a time. A pick a cup
					life absorbed is counted on its own — the team still lost.
				</p>
			</div>
			{families.map((family) => (
				<TeamRecordFamilyBlock key={family.familyKey} family={family} />
			))}
		</section>
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
			<TeamsSection families={summary.teamRecords} />
		</div>
	)
}
