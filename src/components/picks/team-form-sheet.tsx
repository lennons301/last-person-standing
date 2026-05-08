'use client'

import { useEffect, useState } from 'react'
import { loadTeamFormDetail } from '@/app/actions/team-form'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'
import { cn } from '@/lib/utils'
import { TeamBadge } from './team-badge'

interface TeamFormSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	teamId: string
	competitionId: string
	opponentTeamId?: string
	beforeRoundNumber?: number
	// Used for the loading-state header so the sheet doesn't pop in empty.
	teamPreview: { name: string; shortName: string; badgeUrl?: string | null }
	opponentPreview?: { shortName: string }
}

export function TeamFormSheet({
	open,
	onOpenChange,
	teamId,
	competitionId,
	opponentTeamId,
	beforeRoundNumber,
	teamPreview,
	opponentPreview,
}: TeamFormSheetProps) {
	const [detail, setDetail] = useState<TeamFormDetail | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) return
		let cancelled = false
		setLoading(true)
		setError(null)
		loadTeamFormDetail({ teamId, competitionId, opponentTeamId, beforeRoundNumber })
			.then((result) => {
				if (cancelled) return
				if (!result) setError('Could not load team form')
				else setDetail(result)
			})
			.catch(() => {
				if (!cancelled) setError('Could not load team form')
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [open, teamId, competitionId, opponentTeamId, beforeRoundNumber])

	const display = detail?.team ?? {
		id: teamId,
		name: teamPreview.name,
		shortName: teamPreview.shortName,
		badgeUrl: teamPreview.badgeUrl ?? null,
		leaguePosition: null,
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="rounded-t-2xl sm:max-w-lg sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:rounded-2xl sm:-translate-x-1/2 sm:-translate-y-1/2"
			>
				<SheetHeader className="text-left">
					<div className="flex items-center gap-3">
						<TeamBadge
							shortName={display.shortName}
							badgeUrl={display.badgeUrl ?? null}
							size="lg"
						/>
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
								<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
									Last {detail.recent.length} matches
								</div>
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
									<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
										vs {opponentPreview.shortName} · last {detail.headToHead.length} meetings
									</div>
									{detail.headToHead.length === 0 ? (
										<p className="text-sm text-muted-foreground">
											No previous meetings this season.
										</p>
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
			</SheetContent>
		</Sheet>
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
				'inline-flex items-center justify-center w-5 h-5 rounded text-[0.65rem] font-bold text-white',
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
