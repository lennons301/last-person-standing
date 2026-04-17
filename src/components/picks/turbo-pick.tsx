'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDeadline } from '@/lib/format'
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
		form?: FormResult[]
		leaguePosition?: number | null
	}
	away: {
		id: string
		name: string
		shortName: string
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
}

export function TurboPick({
	gameId,
	roundId,
	roundName,
	deadline,
	fixtures,
	existingPicks,
	numberOfPicks,
}: TurboPickProps) {
	const router = useRouter()

	const initialRanked: RankedPick[] = existingPicks
		.slice()
		.sort((a, b) => a.confidenceRank - b.confidenceRank)
		.map((p, i) => {
			const fix = fixtures.find((f) => f.id === p.fixtureId)
			if (!fix) return null
			return {
				id: p.fixtureId,
				rank: i + 1,
				fixtureId: p.fixtureId,
				homeTeam: { shortName: fix.home.shortName, name: fix.home.name },
				awayTeam: { shortName: fix.away.shortName, name: fix.away.name },
				prediction: p.predictedResult,
			}
		})
		.filter((x): x is RankedPick => x !== null)

	const [ranked, setRanked] = useState<RankedPick[]>(initialRanked)
	const [pendingPredictions, setPendingPredictions] = useState<Record<string, Prediction>>({})
	const [editingId, setEditingId] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

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
				homeTeam: { shortName: fixture.home.shortName, name: fixture.home.name },
				awayTeam: { shortName: fixture.away.shortName, name: fixture.away.name },
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

			<div className="flex justify-between items-baseline mb-2">
				<h3 className="font-display font-semibold">Your predictions</h3>
				<span className="text-xs text-muted-foreground">
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
					<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-6 mb-2 pt-3 border-t">
						Remaining fixtures — predict to add
					</h3>

					<div className="space-y-2">
						{remaining.map((fix) => (
							<div key={fix.id} className="border border-border rounded-lg p-3 bg-card">
								<div className="flex items-center gap-2 mb-2">
									<TeamBadge shortName={fix.home.shortName} size="sm" />
									<div className="flex-1 min-w-0">
										<div className="font-semibold text-sm truncate">{fix.home.name}</div>
										{fix.home.form && <FormDots results={fix.home.form} size="sm" />}
									</div>
									<span className="text-xs text-muted-foreground">vs</span>
									<div className="flex-1 min-w-0 text-right">
										<div className="font-semibold text-sm truncate">{fix.away.name}</div>
										{fix.away.form && (
											<FormDots results={fix.away.form} size="sm" className="justify-end" />
										)}
									</div>
									<TeamBadge shortName={fix.away.shortName} size="sm" />
								</div>
								<PredictionButtons
									value={pendingPredictions[fix.id]}
									onChange={(p) => handlePredictionChange(fix.id, p)}
								/>
								{pendingPredictions[fix.id] && (
									<button
										type="button"
										onClick={() => handleAddToRanked(fix)}
										className="mt-2 text-xs font-medium text-[var(--accent)] w-full text-center py-1 hover:underline"
									>
										↑ Add to predictions as #{ranked.length + 1}
									</button>
								)}
							</div>
						))}
					</div>
				</>
			)}

			{error && <p className="text-sm text-[var(--eliminated)] mt-3">{error}</p>}

			<div className="h-20" />

			<div className="fixed bottom-0 left-0 right-0 md:sticky md:bottom-0">
				<PickConfirmBar
					message={`${ranked.length} of ${numberOfPicks} predictions ranked`}
					actionLabel="Lock in picks"
					onConfirm={handleSubmit}
					disabled={ranked.length !== numberOfPicks}
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
