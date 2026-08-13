import Link from 'next/link'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import type {
	CareerHeadline,
	MeSummaryView,
	ModeSection,
	SummaryGameMode,
	TeamRecord,
	TeamRecordFamily,
} from '@/lib/game/me-summary-view'

/** A rate as whole percent, or a dash where there's nothing to divide by. */
function percent(rate: number | null): string {
	return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

/** An average to one decimal, without a pointless trailing nought. */
function average(value: number | null): string {
	return value === null ? '—' : String(Number(value.toFixed(1)))
}

const MODE_NAMES: Record<SummaryGameMode, string> = {
	classic: 'Classic',
	turbo: 'Turbo',
	cup: 'Cup',
}

/** What each mode's section says it measures, in that mode's own terms. */
const MODE_BLURBS: Record<SummaryGameMode, string> = {
	classic: 'Rounds survived — the rounds you held a pick in.',
	turbo: 'Streaks — correct picks in a row, counted the way the game was decided.',
	cup: 'Streaks — picks you survived in a row, counted the way the game was decided.',
}

const NEVER_PLAYED: Record<SummaryGameMode, string> = {
	classic: "You haven't played a classic game yet.",
	turbo: "You haven't played a turbo game yet.",
	cup: "You haven't played a cup game yet.",
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

/** The mode's competition sub-rows: the same record, one season at a time. */
function CompetitionRows({ section }: { section: Extract<ModeSection, { kind: 'played' }> }) {
	return (
		<table className="w-full text-sm">
			<caption className="sr-only">
				{MODE_NAMES[section.mode]} record by competition, deepest first
			</caption>
			<thead className="sr-only">
				<tr>
					<th>Competition</th>
					<th>Played</th>
					<th>Won</th>
					<th>Rate</th>
				</tr>
			</thead>
			<tbody>
				{section.competitions.map((comp) => (
					<tr key={comp.competitionId} className="border-t border-border/60">
						<td className="py-1.5 pr-2 truncate">{comp.name}</td>
						<td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
							{comp.gamesPlayed}
						</td>
						<td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
							{comp.gamesWon}
						</td>
						<td className="py-1.5 pl-2 text-right tabular-nums">{percent(comp.winRate)}</td>
					</tr>
				))}
			</tbody>
		</table>
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
 * One mode's section. An unplayed mode says so in its own words: a record of
 * noughts would read as a bad record rather than as no record at all.
 */
function ModeSectionCard({ section }: { section: ModeSection }) {
	const name = MODE_NAMES[section.mode]
	const headingId = `mode-${section.mode}`

	return (
		<section aria-labelledby={headingId} className="space-y-3">
			<div>
				<h2 id={headingId} className="font-display text-lg font-semibold">
					{name}
				</h2>
				<p className="text-sm text-muted-foreground">
					{section.kind === 'played' ? MODE_BLURBS[section.mode] : NEVER_PLAYED[section.mode]}
				</p>
			</div>

			{section.kind === 'played' && (
				<>
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
						<Stat label="Games played" value={section.gamesPlayed} />
						<Stat label="Games won" value={section.gamesWon} />
						<Stat label="Win rate" value={percent(section.winRate)} />
						{section.mode === 'classic' ? (
							<>
								<Stat label="Deepest run" value={`${section.depth.best} rounds`} />
								<Stat label="Average run" value={`${average(section.depth.average)} rounds`} />
							</>
						) : (
							<>
								<Stat
									label="Longest streak"
									value={section.streak.longest ?? '—'}
									note={
										section.streak.games === 0
											? 'No completed games yet'
											: `Over ${section.streak.games} completed ${section.streak.games === 1 ? 'game' : 'games'}`
									}
								/>
								<Stat label="Average streak" value={average(section.streak.average)} />
							</>
						)}
					</div>
					<CompetitionRows section={section} />
				</>
			)}
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
			{/* The modes measure different things, so each says its own piece. */}
			{summary.modes.map((section) => (
				<ModeSectionCard key={section.mode} section={section} />
			))}
		</div>
	)
}
