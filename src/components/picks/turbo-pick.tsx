'use client'

import { useRouter } from 'next/navigation'
import type React from 'react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
	buildPickTableRows,
	defaultPickView,
	type PickTableRow,
	type PickView,
	pickTableHasStandings,
	type RankedFixtureCall,
} from '@/lib/game/pick-table-view'
import { cn } from '@/lib/utils'
import { type FixtureOdds, FixtureRow, type FixtureTeamInfo } from './fixture-row'
import { PickConfirmBar } from './pick-confirm-bar'
import { PickTable } from './pick-table'
import { PickViewToggle } from './pick-view-toggle'
import { PicksSubmittedNotice } from './picks-submitted-notice'
import { type Prediction, PredictionButtons } from './prediction-buttons'
import type { RankedPick } from './ranked-item'
import { RankingList } from './ranking-list'
import type { FormMarket } from './team-form-panel'
import { SECTION_HEADING, TYPE } from './type-scale'

export interface TurboPickFixture {
	id: string
	/**
	 * The shared team shape both pick views read — the standings line included,
	 * which is what the Table view's columns are made of. Absent on a competition
	 * with no table behind it, in which case turbo never offers the view.
	 */
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoff: string | null
	/** Indicative win-probabilities. Absent for fixtures we have no odds for. */
	odds?: FixtureOdds | null
}

/** A ranked prediction as it crosses into (and out of) this component. */
export interface TurboPickEntry {
	fixtureId: string
	confidenceRank: number
	predictedResult: Prediction
}

interface TurboPickProps {
	gameId: string
	roundId: string
	roundNumber: number
	competitionId: string
	fixtures: TurboPickFixture[]
	existingPicks: TurboPickEntry[]
	numberOfPicks: number
	/** When set, the admin is picking on behalf of this player. */
	actingAs?: { gamePlayerId: string; userName: string }
	/**
	 * Ranking the list starts on, when it differs from what's been submitted.
	 * Defaults to `existingPicks`, which is the only thing the game page passes:
	 * a player's on-screen ranking starts as whatever they last locked in.
	 *
	 * `/preview/picks` is the one caller that sets it, because two of the
	 * picker's states are unreachable from `existingPicks` alone — turbo's API
	 * only accepts a complete ranking, so a partial one never comes back from the
	 * database, and "unsaved changes" only exists once the on-screen order has
	 * drifted from the submitted one.
	 */
	initialRanking?: TurboPickEntry[]
	/**
	 * Decides which view the remaining fixtures open in: a league opens on the
	 * Table (its players already think in a standings board), anything else on
	 * the fixture rows. The toggle is offered either way — unless the round has no
	 * standings behind it at all, in which case there is no Table to show.
	 */
	competitionType?: 'league' | 'knockout' | 'group_knockout' | null
	/**
	 * Overrides how the form-detail sheet is rendered for one side of one
	 * fixture — ranked or remaining. The default path resolves it through a
	 * database-backed server action; `/preview/picks` supplies its own so the
	 * gallery stays database-free. See `FixtureRow`'s prop of the same name.
	 */
	renderFormSheet?: (args: {
		fixtureId: string
		side: 'home' | 'away'
		open: boolean
		onClose: () => void
		/**
		 * The fixture's full 1X2, for the sheet's market block. Present for the
		 * remaining-fixtures rows, which carry the fixture's odds; absent for
		 * ranked rows, which show no probabilities of their own.
		 */
		market?: FormMarket | null
	}) => React.ReactNode
}

/**
 * Turbo's pick interface: N confidence-ranked predictions for a single round.
 *
 * The round title and its deadline countdown belong to the game hero directly
 * above — this component used to repeat both, so the same gameweek name and the
 * same clock appeared twice within a screen of each other. It starts at its two
 * lists instead.
 */
export function TurboPick({
	gameId,
	roundId,
	roundNumber,
	competitionId,
	fixtures,
	existingPicks,
	numberOfPicks,
	actingAs,
	initialRanking,
	competitionType,
	renderFormSheet,
}: TurboPickProps) {
	const router = useRouter()

	// The submitted snapshot, and what the list starts as. The same thing for
	// every real caller; `/preview/picks` is the exception (see `initialRanking`).
	const initialRanked = toRankedPicks(existingPicks, fixtures)
	const startingRanked = initialRanking ? toRankedPicks(initialRanking, fixtures) : initialRanked

	const [ranked, setRanked] = useState<RankedPick[]>(startingRanked)
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

	// The same round as a standings board. Built from *every* fixture, not just
	// the remaining ones: a team already in the ranking is marked with the rank it
	// holds rather than dropped, so the board stays the whole round to compare on.
	const rankedFixtures: Record<string, RankedFixtureCall> = {}
	for (const r of ranked) {
		rankedFixtures[r.fixtureId] = {
			rank: r.rank,
			teamId:
				r.prediction === 'home_win'
					? r.homeTeam.id
					: r.prediction === 'away_win'
						? r.awayTeam.id
						: null,
		}
	}
	const tableRows = buildPickTableRows({ fixtures, rankedFixtures })
	const tableAvailable = pickTableHasStandings(tableRows)
	const [view, setView] = useState<PickView>(defaultPickView(competitionType, tableAvailable))
	// A round whose standings vanish (or a cup the toggle never offered) must not
	// strand the player on a view that isn't there.
	const activeView: PickView = tableAvailable ? view : 'fixtures'

	function handlePredictionChange(fixtureId: string, prediction: Prediction) {
		setPendingPredictions({ ...pendingPredictions, [fixtureId]: prediction })
	}

	/**
	 * Append one call to the confidence set. Both views end up here — the fixture
	 * row's "add to predictions" and the table's "Rank #N" — so a ranking built
	 * across the two is one list in one order, whichever view made each entry.
	 */
	function addToRanked(fixture: TurboPickFixture, prediction: Prediction) {
		if (rankedFixtureIds.has(fixture.id)) return
		setRanked([
			...ranked,
			{
				id: fixture.id,
				rank: ranked.length + 1,
				fixtureId: fixture.id,
				homeTeam: {
					id: fixture.home.id,
					shortName: fixture.home.shortName,
					name: fixture.home.name,
					badgeUrl: fixture.home.badgeUrl,
				},
				awayTeam: {
					id: fixture.away.id,
					shortName: fixture.away.shortName,
					name: fixture.away.name,
					badgeUrl: fixture.away.badgeUrl,
				},
				prediction,
			},
		])
	}

	function handleAddToRanked(fixture: TurboPickFixture) {
		const prediction = pendingPredictions[fixture.id]
		if (!prediction) return
		addToRanked(fixture, prediction)
		const { [fixture.id]: _removed, ...rest } = pendingPredictions
		setPendingPredictions(rest)
	}

	/**
	 * Rank a team from the board: the row is a team, so the call it makes is
	 * "this team wins". The draw is the one prediction the Table view can't
	 * express — it belongs to a fixture, not a team — and stays the fixture row's.
	 */
	function handleRankFromTable(row: PickTableRow) {
		const fixture = fixtures.find((f) => f.id === row.fixtureId)
		if (!fixture) return
		addToRanked(fixture, row.side === 'home' ? 'home_win' : 'away_win')
	}

	/** Move a ranked row one place up or down the confidence order. */
	function handleMoveFromTable(row: PickTableRow, direction: 'up' | 'down') {
		const index = ranked.findIndex((r) => r.fixtureId === row.fixtureId)
		const target = direction === 'up' ? index - 1 : index + 1
		if (index < 0 || target < 0 || target >= ranked.length) return
		const next = [...ranked]
		;[next[index], next[target]] = [next[target], next[index]]
		setRanked(next.map((r, i) => ({ ...r, rank: i + 1 })))
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
			{hasSubmittedPicks && <PicksSubmittedNotice dirty={isDirty} />}

			<SectionHeading
				title="Your predictions"
				aside={`${ranked.length} of ${numberOfPicks}`}
				hint="Most confident first. Tap a team for its form."
			/>

			<RankingList
				picks={ranked}
				onReorder={(newOrder) => setRanked(newOrder)}
				onRemove={handleRemove}
				onChangePrediction={(id) => setEditingId(id)}
				competitionId={competitionId}
				roundNumber={roundNumber}
				renderFormSheet={
					renderFormSheet
						? (pick) => (args) => renderFormSheet({ fixtureId: pick.fixtureId, ...args })
						: undefined
				}
			/>

			{remaining.length > 0 && (
				<div className="mt-6 pt-4 border-t">
					<SectionHeading
						title={activeView === 'table' ? 'All teams' : 'Remaining fixtures'}
						aside={`${remaining.length} left`}
						hint={
							activeView === 'table'
								? 'Tap Rank to back a team to win. Sort by position, team or win chance.'
								: 'Predict a result to add it to your ranking.'
						}
					/>

					{tableAvailable && <PickViewToggle view={activeView} onChange={setView} />}

					{activeView === 'table' ? (
						<PickTable
							rows={tableRows}
							competitionId={competitionId}
							roundNumber={roundNumber}
							// The board's renderer is keyed on the row's fixture, which is what
							// turbo's own renderer wants — so it passes straight through.
							renderFormSheet={
								renderFormSheet
									? ({ fixtureId, side, open, onClose, market }) =>
											renderFormSheet({ fixtureId, side, open, onClose, market })
									: undefined
							}
							ranking={{
								count: ranked.length,
								target: numberOfPicks,
								onAdd: handleRankFromTable,
								onMove: handleMoveFromTable,
								onRemove: (row) => handleRemove(row.fixtureId),
							}}
						/>
					) : (
						<div className="space-y-2">
							{remaining.map((fix) => {
								const hasPrediction = !!pendingPredictions[fix.id]
								return (
									<FixtureRow
										key={fix.id}
										home={{
											id: fix.home.id,
											name: fix.home.name,
											shortName: fix.home.shortName,
											badgeUrl: fix.home.badgeUrl,
											form: fix.home.form,
											leaguePosition: fix.home.leaguePosition,
										}}
										away={{
											id: fix.away.id,
											name: fix.away.name,
											shortName: fix.away.shortName,
											badgeUrl: fix.away.badgeUrl,
											form: fix.away.form,
											leaguePosition: fix.away.leaguePosition,
										}}
										kickoff={fix.kickoff}
										odds={fix.odds}
										competitionId={competitionId}
										roundNumber={roundNumber}
										renderFormSheet={
											renderFormSheet
												? (args) => renderFormSheet({ fixtureId: fix.id, ...args })
												: undefined
										}
									>
										<div className="px-4 py-3 border-t border-border bg-muted/20">
											<PredictionButtons
												value={pendingPredictions[fix.id]}
												onChange={(p) => handlePredictionChange(fix.id, p)}
											/>
											{hasPrediction && (
												<button
													type="button"
													onClick={() => handleAddToRanked(fix)}
													className="mt-2.5 text-sm font-semibold text-[var(--accent)] w-full text-center py-1.5 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
												>
													↑ Add to predictions as #{ranked.length + 1}
												</button>
											)}
										</div>
									</FixtureRow>
								)
							})}
						</div>
					)}
				</div>
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

/**
 * Confidence-ordered pick entries → ranked rows, dropping any entry whose
 * fixture isn't in this round (the row can't be drawn without its teams).
 */
function toRankedPicks(entries: TurboPickEntry[], fixtures: TurboPickFixture[]): RankedPick[] {
	return entries
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
					id: fix.home.id,
					shortName: fix.home.shortName,
					name: fix.home.name,
					badgeUrl: fix.home.badgeUrl,
				},
				awayTeam: {
					id: fix.away.id,
					shortName: fix.away.shortName,
					name: fix.away.name,
					badgeUrl: fix.away.badgeUrl,
				},
				prediction: p.predictedResult,
			}
		})
		.filter((x): x is RankedPick => x !== null)
}

/**
 * Heading for one of the picker's two lists. Both get the same treatment: they're
 * lists of equal rank, and the old pair announced themselves at two different
 * weights (a display heading against a muted uppercase micro-label), which read
 * as a hierarchy that isn't there. The round title they used to sit under belongs
 * to the game hero now.
 */
function SectionHeading({ title, aside, hint }: { title: string; aside: string; hint: string }) {
	return (
		<div className="mb-2">
			<div className="flex justify-between items-baseline gap-3">
				<h3 className={SECTION_HEADING}>{title}</h3>
				<span className={cn(TYPE.meta, 'text-muted-foreground shrink-0')}>{aside}</span>
			</div>
			<p className={cn(TYPE.meta, 'text-muted-foreground mt-0.5')}>{hint}</p>
		</div>
	)
}
