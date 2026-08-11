'use client'

import { useState } from 'react'
import type { CupCardFixtureRow, RowFixture } from '@/app/preview/picks/fixtures'
import { TEAM_FORM_DETAIL, TEAM_FORM_DETAIL_EMPTY } from '@/app/preview/picks/fixtures'
import { ClassicPick, type ClassicPickFixture } from '@/components/picks/classic-pick'
import { CupPick, type CupPickSlot } from '@/components/picks/cup-pick'
import type { FixtureTeamInfo, RowFormSheetRenderer } from '@/components/picks/fixture-row'
import { FixtureRow } from '@/components/picks/fixture-row'
import { type PlannerFixture, PlannerRound, type UsedInfo } from '@/components/picks/planner-round'
import { TeamFormSheetView } from '@/components/picks/team-form-panel'
import type { PlannerRoundInput } from '@/lib/game/classic-planner-view'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'

/**
 * Interactive halves of the pick-selector gallery. `FixtureRow`, `PlannerRound`
 * and `ClassicPick` all take click handlers, which a server component can't
 * pass, so the gallery's rows live here — and every write seam is stubbed
 * (`renderFormSheet`, `onSubmitPick`, `planHandlers.onLock`) so nothing in this
 * gallery reaches a database or the picks API.
 */

/** Swaps the fixture detail's team for whichever side the viewer tapped. */
function detailFor(t: FixtureTeamInfo): TeamFormDetail {
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

/** The one form-sheet renderer every row in this gallery shares. */
const previewFormSheet: RowFormSheetRenderer = ({ home, away, side, open, onClose }) => {
	const team = side === 'home' ? home : away
	const opponent = side === 'home' ? away : home
	return (
		<TeamFormSheetView
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose()
			}}
			detail={detailFor(team)}
			teamPreview={team}
			opponentPreview={{ shortName: opponent.shortName }}
		/>
	)
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
			renderFormSheet={(args) =>
				previewFormSheet({ ...args, home: fixture.home, away: fixture.away })
			}
		/>
	)
}

/** A planner round with its dates still in transit as ISO strings. */
export interface PreviewPlannerRoundInput {
	roundId: string
	roundNumber: number
	roundName: string
	roundLabel: string
	deadline: string | null
	fixturesTbc: boolean
	fixtures: Array<Omit<PlannerFixture, 'kickoff'> & { kickoff: string | null }>
	usedTeams: UsedInfo[]
	lockedTeamId: string | null
}

function hydrate(round: PreviewPlannerRoundInput): PlannerRoundInput {
	return {
		...round,
		deadline: round.deadline ? new Date(round.deadline) : null,
		fixtures: round.fixtures.map((f) => ({
			...f,
			kickoff: f.kickoff ? new Date(f.kickoff) : null,
		})),
	}
}

export function PreviewPlannerRound(props: PreviewPlannerRoundInput) {
	const [locked, setLocked] = useState(props.lockedTeamId)
	const round = hydrate(props)
	return (
		<PlannerRound
			roundId={round.roundId}
			roundNumber={round.roundNumber}
			roundName={round.roundName}
			roundLabel={round.roundLabel}
			deadline={round.deadline}
			fixturesTbc={round.fixturesTbc}
			fixtures={round.fixtures}
			usedTeams={round.usedTeams}
			lockedTeamId={locked}
			onLock={async (_roundId, teamId) => setLocked(teamId)}
			renderFormSheet={previewFormSheet}
		/>
	)
}

export interface PreviewClassicCard {
	roundName: string
	roundNumber: number
	deadline: string | null
	fixtures: ClassicPickFixture[]
	usedTeamsByRound: Record<string, string>
	existingPickTeamId: string | null
	existingPickFixtureId: string | null
	currentRoundClosed?: boolean
	summaryInHero?: boolean
	startExpanded?: boolean
	planner?: PreviewPlannerRoundInput[]
}

export function PreviewClassicPick({ card }: { card: PreviewClassicCard }) {
	// The gallery's stand-in for the picks API: keep the selection the viewer made
	// and let the card collapse as it would after a real submit.
	const [pick, setPick] = useState<{ teamId: string; fixtureId: string } | null>(
		card.existingPickTeamId && card.existingPickFixtureId
			? { teamId: card.existingPickTeamId, fixtureId: card.existingPickFixtureId }
			: null,
	)

	return (
		<ClassicPick
			// Never used: every write seam below is stubbed, so no request is built
			// from these.
			gameId="preview-game"
			roundId="preview-round"
			competitionId="preview-competition"
			roundName={card.roundName}
			roundNumber={card.roundNumber}
			deadline={card.deadline ? new Date(card.deadline) : null}
			fixtures={card.fixtures}
			usedTeamsByRound={card.usedTeamsByRound}
			existingPickTeamId={pick?.teamId ?? null}
			existingPickFixtureId={pick?.fixtureId ?? null}
			futureRounds={card.planner?.map(hydrate)}
			currentRoundClosed={card.currentRoundClosed}
			summaryInHero={card.summaryInHero}
			startExpanded={card.startExpanded}
			onSubmitPick={async (next) => setPick(next)}
			planHandlers={{ onLock: async () => {} }}
			renderFormSheet={previewFormSheet}
		/>
	)
}

export interface PreviewCupCard {
	numberOfPicks: number
	livesRemaining: number
	maxLives: number
	fixtures: Array<Omit<CupCardFixtureRow, 'kickoffInMinutes'> & { kickoff: string | null }>
	initialSlots: CupPickSlot[]
	readonly?: boolean
}

export function PreviewCupPick({ card }: { card: PreviewCupCard }) {
	return (
		<CupPick
			fixtures={card.fixtures.map((f) => ({
				id: f.id,
				homeTeamId: f.home.id,
				homeShort: f.home.shortName,
				homeName: f.home.name,
				homeColor: null,
				homeBadgeUrl: f.home.badgeUrl ?? null,
				awayTeamId: f.away.id,
				awayShort: f.away.shortName,
				awayName: f.away.name,
				awayColor: null,
				awayBadgeUrl: f.away.badgeUrl ?? null,
				kickoff: f.kickoff ? new Date(f.kickoff) : null,
				tierDifference: f.tierDifference,
			}))}
			numberOfPicks={card.numberOfPicks}
			livesRemaining={card.livesRemaining}
			maxLives={card.maxLives}
			initialSlots={card.initialSlots}
			readonly={card.readonly}
			// The gallery's stand-in for the picks API: the ranking is `CupPick`'s own
			// state, so the card stays fully interactive with the submit going nowhere.
			onSubmit={async () => {}}
			// No `competitionId` on purpose. Cup passes the row neither form nor league
			// position, so there's no form bar and nothing to tap through — and leaving
			// it off keeps the sheet's database-backed server action out of reach of a
			// gallery that must never touch a database.
		/>
	)
}
