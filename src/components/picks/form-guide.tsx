import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { LocalDateTime } from '@/components/local-datetime'
import { formGuidePath } from '@/lib/game/form-guide-link'
import type {
	FormGuideNextFixture,
	FormGuideRecord,
	FormGuideResult,
	TeamFormGuide,
} from '@/lib/game/team-form-guide'
import { perGame } from '@/lib/game/team-form-guide'
import { cn } from '@/lib/utils'
import { ordinal } from './ordinal'
import { PositionLine } from './position-line'
import { TeamBadge } from './team-badge'
import { SECTION_HEADING } from './type-scale'

interface FormGuideViewProps {
	guide: TeamFormGuide
	/** Where the "back" affordance goes — the game the player came from, when
	 * we know it. Absent on a directly-visited (shared) URL. */
	backHref?: string | null
	backLabel?: string
}

/**
 * The full form-guide page's body: everything about one team in one
 * competition, and nothing about any game.
 *
 * Purely presentational — it takes a resolved `TeamFormGuide` and no callbacks,
 * so `/preview/form-guide` renders every state of it from hand-built fixtures
 * with no auth and no database, per AGENTS.md.
 *
 * Section order follows the question a player is actually asking: who's next
 * and what does the market think (top), how has the season gone (record,
 * goals, position line), how do these two meet (head-to-head), then the full
 * results list for anyone who wants to read the season match by match.
 */
export function FormGuideView({ guide, backHref, backLabel = 'Back' }: FormGuideViewProps) {
	const { team, competition, overall, homeRecord, awayRecord } = guide

	return (
		<div className="space-y-6">
			{backHref && (
				<Link
					href={backHref}
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-4 w-4" />
					{backLabel}
				</Link>
			)}

			<header className="flex items-center gap-4">
				<TeamBadge shortName={team.shortName} badgeUrl={team.badgeUrl} size="xl" />
				<div className="min-w-0">
					<h1 className="font-display text-2xl font-semibold leading-tight">{team.name}</h1>
					<p className="text-sm text-muted-foreground">
						{competition.name}
						{team.leaguePosition != null && (
							<>
								{' · '}
								{ordinal(team.leaguePosition)}
								{guide.tableSize ? ` of ${guide.tableSize}` : ''}
							</>
						)}
					</p>
				</div>
			</header>

			{guide.nextFixture && <NextFixtureCard next={guide.nextFixture} team={team} />}

			<section>
				<h2 className={SECTION_HEADING}>This season</h2>
				<div className="mt-2 grid gap-3 sm:grid-cols-2">
					<div className="rounded-lg border border-border bg-card p-4">
						<RecordRow label="Overall" record={overall} />
						<RecordRow label="Home" record={homeRecord} />
						<RecordRow label="Away" record={awayRecord} />
					</div>
					<GoalsCard record={overall} />
				</div>
			</section>

			<section>
				<h2 className={SECTION_HEADING}>League position</h2>
				<div className="mt-2 rounded-lg border border-border bg-card p-4">
					<PositionLine points={guide.positionLine} tableSize={guide.tableSize} />
				</div>
			</section>

			{guide.headToHead && (
				<section>
					<h2 className={SECTION_HEADING}>Head-to-head vs {guide.headToHead.opponent.name}</h2>
					<div className="mt-2 rounded-lg border border-border bg-card divide-y divide-border">
						{guide.headToHead.results.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">
								No meetings in {competition.name} yet.
							</p>
						) : (
							guide.headToHead.results.map((r) => (
								<ResultRow
									key={r.fixtureId}
									result={r}
									competitionId={competition.id}
									backHref={backHref}
								/>
							))
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-1.5">
						Meetings in {competition.name} only.
					</p>
				</section>
			)}

			<section>
				<h2 className={SECTION_HEADING}>Results</h2>
				<div className="mt-2 rounded-lg border border-border bg-card divide-y divide-border">
					{guide.results.length === 0 ? (
						<p className="p-4 text-sm text-muted-foreground">No matches played yet this season.</p>
					) : (
						guide.results.map((r) => (
							<ResultRow
								key={r.fixtureId}
								result={r}
								competitionId={competition.id}
								backHref={backHref}
							/>
						))
					)}
				</div>
			</section>
		</div>
	)
}

/**
 * The next match, with the same indicative win-probabilities the pick surfaces
 * show — the persisted daily-sync read, frozen at the round deadline. An
 * unpriced fixture simply says nothing about probability rather than rendering
 * a zero.
 */
function NextFixtureCard({
	next,
	team,
}: {
	next: FormGuideNextFixture
	team: { shortName: string; name: string }
}) {
	const teamOdds = next.odds ? (next.home ? next.odds.home : next.odds.away) : null
	const opponentOdds = next.odds ? (next.home ? next.odds.away : next.odds.home) : null

	return (
		<section>
			<h2 className={SECTION_HEADING}>Next fixture</h2>
			<div className="mt-2 rounded-lg border border-border bg-card p-4">
				<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span className="font-mono">{next.roundName}</span>
					<LocalDateTime date={next.kickoff} fallback="Date TBC" />
				</div>
				<div className="mt-2 flex items-center gap-3">
					<TeamBadge shortName={next.opponent.shortName} badgeUrl={next.opponent.badgeUrl} />
					<div className="min-w-0">
						<div className="font-semibold leading-tight">
							{next.home ? 'vs' : 'away to'} {next.opponent.name}
						</div>
						{next.odds ? (
							<div className="text-xs text-muted-foreground mt-0.5">
								<Probability label={team.shortName} probability={teamOdds?.probability} />
								{' · '}
								<Probability
									label={next.opponent.shortName}
									probability={opponentOdds?.probability}
								/>
								{' · odds as of '}
								<LocalDateTime date={next.odds.asOf} options={ODDS_AS_OF_FORMAT} />
							</div>
						) : (
							<div className="text-xs text-muted-foreground/70 mt-0.5">No odds for this match</div>
						)}
					</div>
				</div>
			</div>
		</section>
	)
}

const ODDS_AS_OF_FORMAT: Intl.DateTimeFormatOptions = {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
}

function Probability({ label, probability }: { label: string; probability?: number }) {
	if (probability == null) return null
	return (
		<span>
			{label}{' '}
			<span className="font-semibold text-foreground/80">{Math.round(probability * 100)}%</span>
		</span>
	)
}

/** One W/D/L line — the whole season, or its home or away half. */
function RecordRow({ label, record }: { label: string; record: FormGuideRecord }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
			<span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
				{label}
			</span>
			{record.played === 0 ? (
				<span className="text-sm text-muted-foreground/70">Not played yet</span>
			) : (
				<span className="text-sm tabular-nums">
					<strong className="font-semibold">{record.wins}</strong>W{' '}
					<strong className="font-semibold">{record.draws}</strong>D{' '}
					<strong className="font-semibold">{record.losses}</strong>L
					<span className="text-muted-foreground"> · {record.played} played</span>
				</span>
			)}
		</div>
	)
}

/** Goals for/against, totals and per game. */
function GoalsCard({ record }: { record: FormGuideRecord }) {
	const scored = perGame(record.goalsFor, record.played)
	const conceded = perGame(record.goalsAgainst, record.played)
	return (
		<div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 gap-3">
			<GoalStat label="Scored" total={record.goalsFor} average={scored} />
			<GoalStat label="Conceded" total={record.goalsAgainst} average={conceded} />
		</div>
	)
}

function GoalStat({
	label,
	total,
	average,
}: {
	label: string
	total: number
	average: number | null
}) {
	return (
		<div>
			<div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
				{label}
			</div>
			<div className="text-2xl font-semibold tabular-nums leading-tight">{total}</div>
			<div className="text-xs text-muted-foreground">
				{average == null ? '— per game' : `${average.toFixed(2)} per game`}
			</div>
		</div>
	)
}

/**
 * One finished match. The opponent's badge links on to *their* guide, so the
 * page is walkable — which is also the second badge entry point the sheet has.
 */
function ResultRow({
	result,
	competitionId,
	backHref,
}: {
	result: FormGuideResult
	competitionId: string
	backHref?: string | null
}) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5 text-sm">
			<ResultPill result={result.result} />
			<TeamBadge
				shortName={result.opponent.shortName}
				badgeUrl={result.opponent.badgeUrl}
				size="sm"
				href={formGuidePath(competitionId, result.opponent.id, { from: backHref })}
			/>
			<span className="min-w-0 truncate">
				{result.opponent.name}{' '}
				<span className="text-muted-foreground">({result.home ? 'H' : 'A'})</span>
			</span>
			<span className="ml-auto font-semibold tabular-nums whitespace-nowrap">
				{result.goalsFor}–{result.goalsAgainst}
			</span>
			<span className="text-xs text-muted-foreground font-mono w-10 text-right shrink-0">
				{result.roundLabel}
			</span>
		</div>
	)
}

function ResultPill({ result }: { result: 'W' | 'D' | 'L' }) {
	const cls =
		result === 'W'
			? 'bg-[var(--alive)]'
			: result === 'L'
				? 'bg-[var(--eliminated)]'
				: 'bg-[var(--draw)]'
	return (
		<span
			className={cn(
				'inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-bold text-white shrink-0',
				cls,
			)}
		>
			{result}
		</span>
	)
}
