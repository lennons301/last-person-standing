'use client'

import { useState } from 'react'
import type { RowFixture } from '@/app/preview/picks/fixtures'
import { TEAM_FORM_DETAIL, TEAM_FORM_DETAIL_EMPTY } from '@/app/preview/picks/fixtures'
import { FixtureRow } from '@/components/picks/fixture-row'
import { type PlannerFixture, PlannerRound, type UsedInfo } from '@/components/picks/planner-round'
import { TeamFormSheetView } from '@/components/picks/team-form-panel'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'

/**
 * Interactive halves of the pick-selector gallery. `FixtureRow` and
 * `PlannerRound` both take click handlers, which a server component can't pass,
 * so the gallery's rows live here — and the form sheet is fed from fixtures
 * through `renderFormSheet` so nothing in this gallery reaches a database.
 */

/** Swaps the fixture detail's team for whichever side the viewer tapped. */
function detailFor(fixture: RowFixture, side: 'home' | 'away'): TeamFormDetail {
	const t = side === 'home' ? fixture.home : fixture.away
	const base = t.form?.length ? TEAM_FORM_DETAIL : TEAM_FORM_DETAIL_EMPTY
	return {
		...base,
		team: {
			id: t.id,
			name: t.name,
			shortName: t.shortName,
			badgeUrl: t.badgeUrl ?? null,
			leaguePosition: t.leaguePosition ?? null,
		},
	}
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
