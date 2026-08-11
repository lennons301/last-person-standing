import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'
import { cn } from '@/lib/utils'
import { TeamBadge } from './team-badge'

/**
 * The presentational half of the team form-detail sheet.
 *
 * `TeamFormSheet` (the sibling file) owns the data-loading: it calls a
 * database-backed server action and hands the result down here. This file takes
 * a `TeamFormDetail` — or a loading / error state — and nothing else, so the
 * `/preview/picks` gallery can render every state from hand-built fixtures with
 * no auth and no database, per the "split the presentational half out" rule in
 * AGENTS.md.
 */
export interface TeamFormPanelProps {
	/** Resolved detail, or null while loading / after a failure. */
	detail: TeamFormDetail | null
	loading?: boolean
	error?: string | null
	/** Header content available before `detail` resolves, so the sheet never pops in empty. */
	teamPreview: { name: string; shortName: string; badgeUrl?: string | null }
	/** When set, the head-to-head section renders against this opponent. */
	opponentPreview?: { shortName: string }
}

export function TeamFormPanel({
	detail,
	loading = false,
	error = null,
	teamPreview,
	opponentPreview,
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
					<TeamBadge shortName={display.shortName} badgeUrl={display.badgeUrl ?? null} size="lg" />
					<div className="flex-1 min-w-0">
						<SheetTitle className="text-base">{display.name}</SheetTitle>
						{detail && (
							<div className="text-xs text-muted-foreground mt-0.5">
								{display.leaguePosition != null && `${ordinal(display.leaguePosition)} · `}
								{detail.seasonRecord.wins}W {detail.seasonRecord.draws}D{' '}
								{detail.seasonRecord.losses}L this season
							</div>
						)}
					</div>
				</div>
			</SheetHeader>

			<div className="px-4 pb-6 sm:px-0 sm:pb-2 mt-4 space-y-5">
				{loading && <div className="text-sm text-muted-foreground">Loading…</div>}
				{error && <div className="text-sm text-destructive">{error}</div>}
				{detail && (
					<>
						<section>
							<SectionLabel>Last {detail.recent.length} matches</SectionLabel>
							<ul className="space-y-1.5">
								{detail.recent.map((r) => (
									<li
										key={`${r.roundNumber}-${r.opponentShortName}`}
										className="flex items-center gap-3 text-sm"
									>
										<ResultPill result={r.result} />
										<span className="text-xs text-muted-foreground w-16 font-mono">
											{r.home ? 'vs' : '@'} {r.opponentShortName}
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

						{detail.headToHead && opponentPreview && (
							<section className="border-t pt-4">
								<SectionLabel>
									vs {opponentPreview.shortName} · last {detail.headToHead.length} meetings
								</SectionLabel>
								{detail.headToHead.length === 0 ? (
									<p className="text-sm text-muted-foreground">No previous meetings this season.</p>
								) : (
									<ul className="space-y-1.5">
										{detail.headToHead.map((r) => (
											<li
												key={r.roundNumber}
												className="flex items-center gap-3 text-sm tabular-nums"
											>
												<span className="font-mono text-xs text-muted-foreground">
													{r.roundLabel}
												</span>
												<span
													className={cn(r.homeTeamShortName === display.shortName && 'font-bold')}
												>
													{r.homeTeamShortName}
												</span>
												<span className="font-semibold">
													{r.homeScore}–{r.awayScore}
												</span>
												<span
													className={cn(r.awayTeamShortName === display.shortName && 'font-bold')}
												>
													{r.awayTeamShortName}
												</span>
											</li>
										))}
									</ul>
								)}
							</section>
						)}
					</>
				)}
			</div>
		</>
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
				<TeamFormPanel {...panel} />
			</SheetContent>
		</Sheet>
	)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
			{children}
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

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
