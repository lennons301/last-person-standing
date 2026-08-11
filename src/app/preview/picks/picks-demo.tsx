'use client'

import { useState } from 'react'
import type { RankedListFixture, RowFixture, TurboScenario } from '@/app/preview/picks/fixtures'
import { TEAM_FORM_DETAIL, TEAM_FORM_DETAIL_EMPTY } from '@/app/preview/picks/fixtures'
import { FixtureRow, type FixtureTeamInfo } from '@/components/picks/fixture-row'
import { type PlannerFixture, PlannerRound, type UsedInfo } from '@/components/picks/planner-round'
import type { RankedTeam } from '@/components/picks/ranked-item'
import { RankingList } from '@/components/picks/ranking-list'
import { TeamFormSheetView } from '@/components/picks/team-form-panel'
import { TurboPick } from '@/components/picks/turbo-pick'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'

/**
 * Interactive halves of the pick-selector gallery. `FixtureRow` and
 * `PlannerRound` both take click handlers, which a server component can't pass,
 * so the gallery's rows live here — and the form sheet is fed from fixtures
 * through `renderFormSheet` so nothing in this gallery reaches a database.
 */

/**
 * Swaps the fixture detail's team for whichever team the viewer tapped. A team
 * with no form stands in for a season that hasn't started, so its sheet reports
 * an unplayed season rather than a loaded one.
 */
function detailForTeam(t: FixtureTeamInfo | RankedTeam): TeamFormDetail {
	const played = 'form' in t ? !!t.form?.length : true
	const base = played ? TEAM_FORM_DETAIL : TEAM_FORM_DETAIL_EMPTY
	return {
		...base,
		team: {
			id: t.id,
			name: t.name,
			shortName: t.shortName,
			badgeUrl: t.badgeUrl ?? null,
			leaguePosition: ('leaguePosition' in t ? t.leaguePosition : null) ?? null,
		},
	}
}

/** Swaps the fixture detail's team for whichever side the viewer tapped. */
function detailFor(fixture: RowFixture, side: 'home' | 'away'): TeamFormDetail {
	return detailForTeam(side === 'home' ? fixture.home : fixture.away)
}

export function PreviewFixtureRow({
	fixture,
	kickoff,
}: {
	fixture: RowFixture
	/** Pre-resolved on the server so the fixture stays a plain serialisable object. */
	kickoff: string | null
}) {
	const [selected, setSelected] = useState<'home' | 'away' | null>(fixture.selectedSide ?? null)
	const readonly = !!fixture.readonly

	return (
		<FixtureRow
			home={fixture.home}
			away={fixture.away}
			kickoff={kickoff}
			selectedSide={selected}
			usedSide={fixture.usedSide}
			usedLabel={fixture.usedLabel}
			homeState={fixture.homeState}
			awayState={fixture.awayState}
			disabledSide={fixture.disabledSide}
			disabledReason={fixture.disabledReason}
			tierValue={fixture.tierValue}
			tierMax={fixture.tierMax}
			plusN={fixture.plusN}
			showHeart={fixture.showHeart}
			underdogSide={fixture.underdogSide}
			onPickHome={readonly ? undefined : () => setSelected((s) => (s === 'home' ? null : 'home'))}
			onPickAway={readonly ? undefined : () => setSelected((s) => (s === 'away' ? null : 'away'))}
			renderFormSheet={({ side, open, onClose }) => (
				<TeamFormSheetView
					open={open}
					onOpenChange={(next) => {
						if (!next) onClose()
					}}
					detail={detailFor(fixture, side)}
					teamPreview={side === 'home' ? fixture.home : fixture.away}
					opponentPreview={{
						shortName: side === 'home' ? fixture.away.shortName : fixture.home.shortName,
					}}
				/>
			)}
		/>
	)
}

/**
 * The real `TurboPick`, driven entirely from fixtures.
 *
 * It reaches a database in exactly one place — the form sheet's server action —
 * so the gallery hands it a `renderFormSheet` and stays database-free.
 * "Lock in picks" still POSTs to the picks API, which will refuse an
 * unauthenticated gallery request and surface the error inline; that's the
 * confirm bar's real failure path, not a broken fixture.
 */
export function PreviewTurboPick({
	scenario,
	fixtures,
}: {
	scenario: TurboScenario
	/** Kickoffs pre-resolved on the server so the fixtures stay serialisable. */
	fixtures: Array<{ id: string; kickoff: string | null }>
}) {
	const kickoffs = new Map(fixtures.map((f) => [f.id, f.kickoff]))
	const byId = new Map(scenario.fixtures.map((f) => [f.id, f]))

	return (
		<TurboPick
			gameId={`preview-${scenario.id}`}
			roundId="preview-round"
			roundNumber={1}
			competitionId="preview-competition"
			numberOfPicks={scenario.numberOfPicks}
			existingPicks={scenario.existingPicks}
			initialRanking={scenario.initialRanking}
			fixtures={scenario.fixtures.map((f) => ({
				id: f.id,
				home: f.home,
				away: f.away,
				kickoff: kickoffs.get(f.id) ?? null,
			}))}
			renderFormSheet={({ fixtureId, side, open, onClose }) => {
				const fixture = byId.get(fixtureId)
				if (!fixture) return null
				const team = side === 'home' ? fixture.home : fixture.away
				const opponent = side === 'home' ? fixture.away : fixture.home
				return (
					<TeamFormSheetView
						open={open}
						onOpenChange={(next) => {
							if (!next) onClose()
						}}
						detail={detailForTeam(team)}
						teamPreview={team}
						opponentPreview={{ shortName: opponent.shortName }}
					/>
				)
			}}
		/>
	)
}

/** Ranked rows outside the picker, so the row itself can be reviewed at width. */
export function PreviewRankedList({ fixture }: { fixture: RankedListFixture }) {
	const [picks, setPicks] = useState(fixture.picks)

	return (
		<RankingList
			picks={picks}
			onReorder={setPicks}
			onRemove={(id) =>
				setPicks((current) =>
					current.filter((p) => p.id !== id).map((p, i) => ({ ...p, rank: i + 1 })),
				)
			}
			// The picker owns the change-prediction dialog; here the chip is just a
			// chip, so tapping it does nothing rather than opening half a flow.
			onChangePrediction={() => {}}
			renderFormSheet={(pick) =>
				({ side, open, onClose }) => {
					const team = side === 'home' ? pick.homeTeam : pick.awayTeam
					const opponent = side === 'home' ? pick.awayTeam : pick.homeTeam
					return (
						<TeamFormSheetView
							open={open}
							onOpenChange={(next) => {
								if (!next) onClose()
							}}
							detail={detailForTeam(team)}
							teamPreview={team}
							opponentPreview={{ shortName: opponent.shortName }}
						/>
					)
				}}
		/>
	)
}

export function PreviewPlannerRound({
	roundId,
	roundNumber,
	roundName,
	roundLabel,
	deadline,
	fixturesTbc,
	fixtures,
	usedTeams,
	lockedTeamId,
}: {
	roundId: string
	roundNumber: number
	roundName: string
	roundLabel: string
	deadline: string | null
	fixturesTbc: boolean
	fixtures: Array<Omit<PlannerFixture, 'kickoff'> & { kickoff: string | null }>
	usedTeams: UsedInfo[]
	lockedTeamId: string | null
}) {
	const [locked, setLocked] = useState(lockedTeamId)
	return (
		<PlannerRound
			roundId={roundId}
			roundNumber={roundNumber}
			roundName={roundName}
			roundLabel={roundLabel}
			deadline={deadline ? new Date(deadline) : null}
			fixturesTbc={fixturesTbc}
			fixtures={fixtures.map((f) => ({ ...f, kickoff: f.kickoff ? new Date(f.kickoff) : null }))}
			usedTeams={usedTeams}
			lockedTeamId={locked}
			onLock={async (_roundId, teamId) => setLocked(teamId)}
		/>
	)
}
