'use client'

import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDeadline } from '@/lib/format'
import { cn } from '@/lib/utils'
import { FormDots, type FormResult } from './form-dots'
import { PickConfirmBar } from './pick-confirm-bar'
import { type Prediction, PredictionButtons } from './prediction-buttons'
import type { RankedPick } from './ranked-item'
import { RankingList } from './ranking-list'
import { TeamBadge } from './team-badge'

export interface TurboPickFixture {
	id: string
	home: {
		id: string
		name: string
		shortName: string
		badgeUrl?: string | null
		form?: FormResult[]
		leaguePosition?: number | null
	}
	away: {
		id: string
		name: string
		shortName: string
		badgeUrl?: string | null
		form?: FormResult[]
		leaguePosition?: number | null
	}
	kickoff: string | null
}

interface TurboPickProps {
	gameId: string
	roundId: string
	roundName: string
	deadline: Date | null
	fixtures: TurboPickFixture[]
	existingPicks: Array<{ fixtureId: string; confidenceRank: number; predictedResult: Prediction }>
	numberOfPicks: number
	/** When set, the admin is picking on behalf of this player. */
	actingAs?: { gamePlayerId: string; userName: string }
}

function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function TurboPick({
	gameId,
	roundId,
	roundName,
	deadline,
	fixtures,
	existingPicks,
	numberOfPicks,
	actingAs,
}: TurboPickProps) {
	const router = useRouter()

	const initialRanked: RankedPick[] = existingPicks
		.slice()
		.sort((a, b) => a.confidenceRank - b.confidenceRank)
		.map((p, i): RankedPick | null => {
			const fix = fixtures.find((f) => f.id === p.fixtureId)
			if (!fix) return null
			return {
				id: p.fixtureId,
				rank: i + 1,
				fixtureId: p.fixtureId,
				homeTeam: {
					shortName: fix.home.shortName,
					name: fix.home.name,
					badgeUrl: fix.home.badgeUrl,
				},
				awayTeam: {
					shortName: fix.away.shortName,
					name: fix.away.name,
					badgeUrl: fix.away.badgeUrl,
				},
				prediction: p.predictedResult,
			}
		})
		.filter((x): x is RankedPick => x !== null)

	const [ranked, setRanked] = useState<RankedPick[]>(initialRanked)
	const [pendingPredictions, setPendingPredictions] = useState<Record<string, Prediction>>({})
	const [editingId, setEditingId] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const hasSubmittedPicks = initialRanked.length > 0
	// Compare current ranked picks against the submitted snapshot to detect unsaved changes
	const isDirty = (() => {
		if (!hasSubmittedPicks) return ranked.length > 0
		if (ranked.length !== initialRanked.length) return true
		for (let i = 0; i < ranked.length; i++) {
			const current = ranked[i]
			const submitted = initialRanked[i]
			if (current.fixtureId !== submitted.fixtureId) return true
			if (current.prediction !== submitted.prediction) return true
		}
		return false
	})()

	const rankedFixtureIds = new Set(ranked.map((r) => r.fixtureId))
	const remaining = fixtures.filter((f) => !rankedFixtureIds.has(f.id))

	function handlePredictionChange(fixtureId: string, prediction: Prediction) {
		setPendingPredictions({ ...pendingPredictions, [fixtureId]: prediction })
	}

	function handleAddToRanked(fixture: TurboPickFixture) {
		const prediction = pendingPredictions[fixture.id]
		if (!prediction) return
		setRanked([
			...ranked,
			{
				id: fixture.id,
				rank: ranked.length + 1,
				fixtureId: fixture.id,
				homeTeam: {
					shortName: fixture.home.shortName,
					name: fixture.home.name,
					badgeUrl: fixture.home.badgeUrl,
				},
				awayTeam: {
					shortName: fixture.away.shortName,
					name: fixture.away.name,
					badgeUrl: fixture.away.badgeUrl,
				},
				prediction,
			},
		])
		const { [fixture.id]: _removed, ...rest } = pendingPredictions
		setPendingPredictions(rest)
	}

	function handleRemove(id: string) {
		setRanked(ranked.filter((r) => r.id !== id).map((r, i) => ({ ...r, rank: i + 1 })))
	}

	function handleEditPrediction(newPred: Prediction) {
		if (!editingId) return
		setRanked(ranked.map((r) => (r.id === editingId ? { ...r, prediction: newPred } : r)))
		setEditingId(null)
	}

	async function handleSubmit() {
		if (ranked.length !== numberOfPicks) return
		setLoading(true)
		setError(null)
		const res = await fetch(`/api/picks/${gameId}/${roundId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				picks: ranked.map((r) => ({
					fixtureId: r.fixtureId,
					confidenceRank: r.rank,
					predictedResult: r.prediction,
				})),
				...(actingAs ? { actingAs: actingAs.gamePlayerId } : {}),
			}),
		})
		setLoading(false)
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: 'Failed' }))
			setError(body.error ?? 'Failed')
			return
		}
		router.refresh()
	}

	const editingPick = ranked.find((r) => r.id === editingId)

	return (
		<div>
			<div className="flex justify-between items-baseline mb-3">
				<h2 className="font-display text-xl font-semibold">{roundName}</h2>
				{deadline && (
					<span className="text-xs font-medium text-[var(--draw)] bg-[var(--draw-bg)] px-2 py-0.5 rounded-md">
						⏱ {formatDeadline(deadline)}
					</span>
				)}
			</div>

			{hasSubmittedPicks && (
				<div
					className={cn(
						'mb-4 rounded-lg border px-4 py-3 flex items-start gap-3',
						isDirty
							? 'border-[var(--draw)]/60 bg-[var(--draw-bg)]'
							: 'border-[var(--alive)]/40 bg-[var(--alive-bg)]',
					)}
				>
					{isDirty ? (
						<AlertCircle className="h-5 w-5 text-[var(--draw)] shrink-0 mt-0.5" />
					) : (
						<CheckCircle2 className="h-5 w-5 text-[var(--alive)] shrink-0 mt-0.5" />
					)}
					<div className="flex-1">
						<div
							className={cn(
								'font-semibold text-sm',
								isDirty ? 'text-[var(--draw)]' : 'text-[var(--alive)]',
							)}
						>
							{isDirty ? 'Unsaved changes' : 'Picks locked in'}
						</div>
						<p className="text-xs text-muted-foreground mt-0.5">
							{isDirty
								? 'Resubmit to update your picks. Previous submission stays active until you do.'
								: 'Your picks are in. Reorder, change predictions, or remove before the deadline — then resubmit.'}
						</p>
					</div>
				</div>
			)}

			<div className="flex justify-between items-baseline mb-2">
				<h3 className="font-display font-semibold text-lg">Your predictions</h3>
				<span className="text-sm text-muted-foreground">
					{ranked.length} of {numberOfPicks}
				</span>
			</div>

			<RankingList
				picks={ranked}
				onReorder={(newOrder) => setRanked(newOrder)}
				onRemove={handleRemove}
				onChangePrediction={(id) => setEditingId(id)}
			/>

			{remaining.length > 0 && (
				<>
					<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-6 mb-3 pt-4 border-t">
						Remaining fixtures — predict to add
					</h3>

					<div className="space-y-2">
						{remaining.map((fix) => {
							const hasPrediction = !!pendingPredictions[fix.id]
							return (
								<div
									key={fix.id}
									className="border border-border rounded-lg bg-card overflow-hidden"
								>
									<div className="flex items-stretch">
										<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0 flex-row-reverse">
											<TeamBadge
												shortName={fix.home.shortName}
												badgeUrl={fix.home.badgeUrl}
												size="lg"
											/>
											<div className="flex flex-col gap-1.5 min-w-0 flex-1 items-end">
												<span className="font-semibold text-base leading-tight truncate w-full text-right">
													{fix.home.name}
												</span>
												<div className="flex items-center gap-2">
													{fix.home.leaguePosition != null && (
														<span className="text-xs text-muted-foreground font-medium">
															{ordinal(fix.home.leaguePosition)}
														</span>
													)}
													{fix.home.form && fix.home.form.length > 0 && (
														<FormDots results={fix.home.form} size="md" />
													)}
												</div>
											</div>
										</div>
										<div className="flex flex-col items-center justify-center px-3 shrink-0 min-w-[64px] bg-muted/30 border-l border-r border-border">
											<span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
												vs
											</span>
											{fix.kickoff && (
												<span className="text-[0.7rem] text-muted-foreground mt-1 text-center leading-tight">
													{fix.kickoff}
												</span>
											)}
										</div>
										<div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
											<TeamBadge
												shortName={fix.away.shortName}
												badgeUrl={fix.away.badgeUrl}
												size="lg"
											/>
											<div className="flex flex-col gap-1.5 min-w-0 flex-1 items-start">
												<span className="font-semibold text-base leading-tight truncate w-full">
													{fix.away.name}
												</span>
												<div className="flex items-center gap-2">
													{fix.away.leaguePosition != null && (
														<span className="text-xs text-muted-foreground font-medium">
															{ordinal(fix.away.leaguePosition)}
														</span>
													)}
													{fix.away.form && fix.away.form.length > 0 && (
														<FormDots results={fix.away.form} size="md" />
													)}
												</div>
											</div>
										</div>
									</div>
									<div className="px-4 py-3 border-t border-border bg-muted/20">
										<PredictionButtons
											value={pendingPredictions[fix.id]}
											onChange={(p) => handlePredictionChange(fix.id, p)}
										/>
										{hasPrediction && (
											<button
												type="button"
												onClick={() => handleAddToRanked(fix)}
												className="mt-2.5 text-sm font-semibold text-[var(--accent)] w-full text-center py-1.5 hover:underline"
											>
												↑ Add to predictions as #{ranked.length + 1}
											</button>
										)}
									</div>
								</div>
							)
						})}
					</div>
				</>
			)}

			{error && <p className="text-sm text-[var(--eliminated)] mt-3">{error}</p>}

			<div className="h-20" />

			<div className="fixed bottom-0 left-0 right-0 md:sticky md:bottom-0">
				<PickConfirmBar
					message={
						hasSubmittedPicks && !isDirty
							? 'Picks submitted — edit any pick to resubmit'
							: `${ranked.length} of ${numberOfPicks} predictions ranked${isDirty ? ' · unsaved changes' : ''}`
					}
					actionLabel={
						actingAs
							? `Submit as ${actingAs.userName}`
							: hasSubmittedPicks
								? 'Resubmit picks'
								: 'Lock in picks'
					}
					onConfirm={handleSubmit}
					disabled={ranked.length !== numberOfPicks || (hasSubmittedPicks && !isDirty)}
					loading={loading}
				/>
			</div>

			<Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Change prediction: {editingPick?.homeTeam.name} vs {editingPick?.awayTeam.name}
						</DialogTitle>
					</DialogHeader>
					<PredictionButtons value={editingPick?.prediction} onChange={handleEditPrediction} />
				</DialogContent>
			</Dialog>
		</div>
	)
}
