import Link from 'next/link'
import { TeamBadge } from '@/components/picks/team-badge'
import { Button } from '@/components/ui/button'
import type {
	CareerHeadline,
	ClassicRoundOne,
	MeSummaryView,
	ModeSection,
	SummaryGameMode,
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

/**
 * Classic's first hurdle. The rebuy figure carries its own denominator with it,
 * because it isn't over the exits shown beside it: a game with rebuys switched
 * off never offered a way back, so it can't count as one the player passed up.
 */
function RoundOneStats({ roundOne }: { roundOne: ClassicRoundOne }) {
	return (
		<>
			<Stat
				label="Round 1 survival"
				value={percent(roundOne.survivalRate)}
				note={
					roundOne.settled === 0
						? `No round one has settled yet, over ${roundOne.games} ${roundOne.games === 1 ? 'game' : 'games'}`
						: `Your opening pick came off in ${roundOne.survived} of ${roundOne.settled}`
				}
			/>
			{/*
			 * Labelled by the pick, not by an elimination: with rebuys switched off a
			 * lost round one doesn't put the player out (the starting-round
			 * exemption), so "exits" would be untrue for exactly the games the rebuy
			 * card below already refuses to hold against them.
			 */}
			<Stat
				label="Opening pick down"
				value={roundOne.exits}
				note="Games your round 1 pick didn't win"
			/>
			<Stat
				label="Bought back in"
				value={roundOne.rebuyable === 0 ? '—' : roundOne.rebought}
				note={
					roundOne.rebuyable === 0
						? 'No rebuy on offer'
						: `${roundOne.rebought} of ${roundOne.rebuyable} round 1 exits`
				}
			/>
		</>
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
								<RoundOneStats roundOne={section.roundOne} />
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
			{/* The modes measure different things, so each says its own piece. */}
			{summary.modes.map((section) => (
				<ModeSectionCard key={section.mode} section={section} />
			))}
		</div>
	)
}
