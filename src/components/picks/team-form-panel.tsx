import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { LocalDateTime } from '@/components/local-datetime'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { FormSplit, TeamFormDetail } from '@/lib/game/team-form-detail'
import { cn } from '@/lib/utils'
import { FormDots } from './form-dots'
import { ODDS_AS_OF_FORMAT } from './odds-format'
import { ordinal } from './ordinal'
import { TeamBadge } from './team-badge'

/** One outcome of the 1X2 market: the de-vigged chance and the price it came from. */
export interface FormMarketQuote {
	probability: number
	price: number
}

/**
 * The full home/draw/away market for the fixture this sheet was opened from —
 * the detail that sits one level below the two win-probabilities the fixture row
 * itself shows.
 *
 * It comes down with the row, not from the form query: the sheet renders it even
 * while the form is still loading (or after it failed), because it was already
 * on screen when the viewer tapped.
 */
export interface FormMarket {
	home: FormMarketQuote & { shortName: string }
	draw: FormMarketQuote
	away: FormMarketQuote & { shortName: string }
	/** When the bookmaker last moved the market. Frozen at the round deadline. */
	asOf: string | Date
	/** Which side of the fixture this sheet's team is, so its outcome reads as theirs. */
	teamSide: 'home' | 'away'
}

/**
 * The specific fixture the sheet was opened from — not the team's season, the
 * one match. `statusLabel` and whether `score` is set come from
 * `describeFixturePhase` (`src/lib/game/fixture-phase.ts`): before kickoff
 * there's a time to show and no score, once there's a result the score
 * replaces it. `score` is already oriented to this team ("2-1" from its own
 * perspective), matching the progress grid's own cell.
 */
export interface FixtureSummaryView {
	statusLabel: string
	opponentShortName: string
	homeAway: 'H' | 'A'
	kickoff: Date | string | null
	score: string | null
}

/**
 * Props of the presentational half of the team form-detail sheet.
 *
 * `TeamFormSheet` (the sibling file) owns the data-loading: it calls a
 * database-backed server action and hands the result down here. This file takes
 * a `TeamFormDetail` — or a loading / error state — plus the market that came
 * down with the caller's row, and nothing else, so the `/preview/picks` gallery
 * can render every state from hand-built fixtures with no auth and no database,
 * per the "split the presentational half out" rule in AGENTS.md.
 */
export interface TeamFormPanelProps {
	/** Resolved detail, or null while loading / after a failure. */
	detail: TeamFormDetail | null
	loading?: boolean
	error?: string | null
	/**
	 * Full 1X2 for the fixture. Absent for an unpriced fixture (or a competition
	 * we have no odds for), in which case the sheet shows no market at all —
	 * never a zero, exactly as the row doesn't.
	 */
	market?: FormMarket | null
	/** Header content available before `detail` resolves, so the sheet never pops in empty. */
	teamPreview: { name: string; shortName: string; badgeUrl?: string | null }
	/**
	 * Element used for the team name heading. Inside the sheet this must be
	 * Radix's `SheetTitle` (the dialog needs an accessible name); rendered
	 * standalone — as `/preview/picks` does — Radix would throw for want of a
	 * dialog context, so the default is a plain heading.
	 */
	titleComponent?: React.ComponentType<{ className?: string; children: React.ReactNode }>
	/**
	 * Link to the team's full form guide (`formGuidePath`). When set, the header
	 * badge and the footer link both lead there — the sheet is the quick read,
	 * the guide is the deep dive. Omitted where no route exists to link to.
	 */
	formGuideHref?: string
	/** The fixture this sheet was opened from. Absent when opened team-first (no one fixture in view). */
	fixtureSummary?: FixtureSummaryView
}

export function TeamFormPanel({
	detail,
	loading = false,
	error = null,
	market = null,
	teamPreview,
	titleComponent: Title = PlainTitle,
	formGuideHref,
	fixtureSummary,
}: TeamFormPanelProps) {
	const display = detail?.team ?? {
		name: teamPreview.name,
		shortName: teamPreview.shortName,
		badgeUrl: teamPreview.badgeUrl ?? null,
		leaguePosition: null,
	}

	return (
		<>
			<SheetHeader className="text-left">
				<div className="flex items-center gap-3">
					<TeamBadge
						shortName={display.shortName}
						badgeUrl={display.badgeUrl ?? null}
						size="lg"
						href={formGuideHref}
					/>
					<div className="flex-1 min-w-0">
						<Title className="text-base font-semibold text-foreground">{display.name}</Title>
						{detail && (
							<div className="text-xs text-muted-foreground mt-0.5">
								{display.leaguePosition != null && `${ordinal(display.leaguePosition)} · `}
								{detail.splits.overall.wins}W {detail.splits.overall.draws}D{' '}
								{detail.splits.overall.losses}L this season
							</div>
						)}
					</div>
				</div>
				{fixtureSummary && <FixtureSummary summary={fixtureSummary} />}
			</SheetHeader>

			<div className="px-4 pb-6 sm:px-0 sm:pb-2 mt-4 space-y-5">
				{loading && <div className="text-sm text-muted-foreground">Loading…</div>}
				{error && <div className="text-sm text-destructive">{error}</div>}
				{detail && (
					<>
						<section>
							<SectionLabel>Home and away</SectionLabel>
							<SplitTable splits={detail.splits} />
						</section>

						<section className="border-t pt-4">
							<SectionLabel>Last {detail.recent.length} matches</SectionLabel>
							<ul className="space-y-1.5">
								{detail.recent.map((r) => (
									<li
										key={`${r.roundNumber}-${r.opponentShortName}`}
										className="flex items-center gap-3 text-sm"
									>
										<ResultPill result={r.result} />
										<span className="text-xs text-muted-foreground w-16 font-mono">
											{r.opponentShortName} ({r.home ? 'H' : 'A'})
										</span>
										<span className="font-semibold tabular-nums">
											{r.goalsFor}–{r.goalsAgainst}
										</span>
										<span className="ml-auto text-xs text-muted-foreground font-mono">
											{r.roundLabel}
										</span>
									</li>
								))}
								{detail.recent.length === 0 && (
									<li className="text-sm text-muted-foreground">No completed matches yet.</li>
								)}
							</ul>
						</section>
					</>
				)}

				{market && <MarketSection market={market} />}

				{formGuideHref && (
					// The way out of the sheet's summary and into the season: position
					// line, home/away split, goals, every result. Offered even while the
					// sheet is still loading — the page it leads to doesn't depend on
					// what the sheet resolved.
					<Link
						href={formGuideHref}
						className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Full form guide
						<ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
					</Link>
				)}
			</div>
		</>
	)
}

/**
 * Season record by venue, with goals. Three rows — overall, home, away — because
 * the aggregate hides the read a picker is actually after: a mid-table team can
 * be unbeaten at home, and the pick is for one specific venue.
 */
function SplitTable({
	splits,
}: {
	splits: { overall: FormSplit; home: FormSplit; away: FormSplit }
}) {
	const rows: Array<{ label: string; split: FormSplit }> = [
		{ label: 'All', split: splits.overall },
		{ label: 'Home', split: splits.home },
		{ label: 'Away', split: splits.away },
	]

	return (
		<div className="text-xs">
			<div className="grid grid-cols-[2.5rem_1.5rem_3.5rem_3.5rem_1fr] items-center gap-x-1.5 text-2xs uppercase tracking-wider text-muted-foreground/70 mb-1">
				<span />
				<span className="text-right">P</span>
				<span className="text-right">W-D-L</span>
				<span className="text-right">GF-GA</span>
				<span>Form</span>
			</div>
			{rows.map(({ label, split }) => (
				<div
					key={label}
					className="grid grid-cols-[2.5rem_1.5rem_3.5rem_3.5rem_1fr] items-center gap-x-1.5 py-0.5 tabular-nums"
				>
					<span className="text-muted-foreground">{label}</span>
					<span className="text-right font-mono">{split.played}</span>
					<span className="text-right font-mono">
						{split.wins}-{split.draws}-{split.losses}
					</span>
					<span className="text-right font-mono">
						{split.goalsFor}-{split.goalsAgainst}
					</span>
					{split.form.length > 0 ? (
						<FormDots results={split.form} size="sm" />
					) : (
						<span className="text-muted-foreground/70">—</span>
					)}
				</div>
			))}
		</div>
	)
}

/**
 * The full 1X2 for the fixture: every outcome, its de-vigged chance and the
 * price it came from. The fixture row above shows the two win chances only, so
 * this is the level of detail the tap-through exists for — the draw included,
 * which is the outcome that eliminates a classic picker.
 */
function MarketSection({ market }: { market: FormMarket }) {
	const outcomes: Array<{ key: string; label: string; quote: FormMarketQuote; theirs: boolean }> = [
		{
			key: 'home',
			label: `${market.home.shortName} win`,
			quote: market.home,
			theirs: market.teamSide === 'home',
		},
		{ key: 'draw', label: 'Draw', quote: market.draw, theirs: false },
		{
			key: 'away',
			label: `${market.away.shortName} win`,
			quote: market.away,
			theirs: market.teamSide === 'away',
		},
	]

	return (
		<section className="border-t pt-4">
			<SectionLabel>Match odds</SectionLabel>
			<div className="space-y-1.5">
				{outcomes.map((o) => (
					<div key={o.key} className="flex items-center gap-2 text-xs tabular-nums">
						<span
							className={cn(
								'w-20 shrink-0 truncate',
								o.theirs ? 'font-semibold text-foreground' : 'text-muted-foreground',
							)}
						>
							{o.label}
						</span>
						<span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
							<span
								className={cn(
									'block h-full rounded-full',
									o.theirs ? 'bg-foreground/70' : 'bg-foreground/25',
								)}
								style={{ width: `${Math.round(o.quote.probability * 100)}%` }}
							/>
						</span>
						<span
							className={cn('w-9 text-right', o.theirs ? 'font-semibold' : 'text-foreground/80')}
						>
							{Math.round(o.quote.probability * 100)}%
						</span>
						<span className="w-10 text-right font-mono text-muted-foreground">
							{o.quote.price.toFixed(2)}
						</span>
					</div>
				))}
			</div>
			<p className="text-2xs text-muted-foreground/70 mt-2">
				Indicative bookmaker prices, as of{' '}
				<LocalDateTime date={market.asOf} options={ODDS_AS_OF_FORMAT} />. Frozen once the round
				deadline passes.
			</p>
		</section>
	)
}

/**
 * The presentational sheet: `TeamFormPanel` inside the bottom-sheet/dialog
 * shell, with no notion of where the detail came from.
 */
export function TeamFormSheetView({
	open,
	onOpenChange,
	...panel
}: TeamFormPanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="rounded-t-2xl sm:max-w-lg sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:rounded-2xl sm:-translate-x-1/2 sm:-translate-y-1/2"
			>
				<TeamFormPanel {...panel} titleComponent={SheetTitle} />
			</SheetContent>
		</Sheet>
	)
}

function PlainTitle({ className, children }: { className?: string; children: React.ReactNode }) {
	return <h3 className={className}>{children}</h3>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
			{children}
		</div>
	)
}

/**
 * The one fixture the sheet was opened from — kickoff before the match,
 * score once there's one. Mutually exclusive: a score means the match has
 * moved past "kicks off at", so the time it would have shown is gone.
 */
function FixtureSummary({ summary }: { summary: FixtureSummaryView }) {
	return (
		<div className="mt-3 rounded-lg border border-border px-3 py-2">
			<div className="flex items-center justify-between gap-2 text-sm">
				<span className="font-medium">
					{summary.opponentShortName} ({summary.homeAway === 'H' ? 'H' : 'A'})
				</span>
				<span className="text-xs text-muted-foreground">{summary.statusLabel}</span>
			</div>
			{summary.score ? (
				<div className="mt-1 text-base font-semibold tabular-nums">{summary.score}</div>
			) : (
				summary.kickoff && (
					<div className="mt-1 text-xs text-muted-foreground">
						<LocalDateTime date={summary.kickoff} />
					</div>
				)
			)}
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
				'inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-bold text-white',
				cls,
			)}
		>
			{result}
		</span>
	)
}
