'use client'

import { useState } from 'react'
import type {
	CupCardFixtureRow,
	RankedListFixture,
	RowFixture,
	TurboScenario,
} from '@/app/preview/picks/fixtures'
import { TEAM_FORM_DETAIL, TEAM_FORM_DETAIL_EMPTY } from '@/app/preview/picks/fixtures'
import { ClassicPick, type ClassicPickFixture } from '@/components/picks/classic-pick'
import { CupPick, type CupPickSlot } from '@/components/picks/cup-pick'
import type { FixtureTeamInfo, RowFormSheetRenderer } from '@/components/picks/fixture-row'
import { FixtureRow } from '@/components/picks/fixture-row'
import { PickTable } from '@/components/picks/pick-table'
import { type PlannerFixture, PlannerRound, type UsedInfo } from '@/components/picks/planner-round'
import type { RankedTeam } from '@/components/picks/ranked-item'
import { RankingList } from '@/components/picks/ranking-list'
import { TeamFormSheetView } from '@/components/picks/team-form-panel'
import { TurboPick } from '@/components/picks/turbo-pick'
import type { PlannerRoundInput } from '@/lib/game/classic-planner-view'
import { buildPickTableRows, type PickTableFixture } from '@/lib/game/pick-table-view'
import type { TeamFormDetail } from '@/lib/game/team-form-detail'

/**
 * Interactive halves of the pick-selector gallery. `FixtureRow`, `PlannerRound`,
 * `ClassicPick` and `TurboPick` all take click handlers, which a server
 * component can't pass, so the gallery's rows live here — and every write seam
 * is stubbed (`renderFormSheet`, `onSubmitPick`, `planHandlers.onLock`) so
 * nothing in this gallery reaches a database or the picks API.
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

/** The one form-sheet renderer every row in this gallery shares. */
const previewFormSheet: RowFormSheetRenderer = ({ home, away, side, open, onClose, market }) => {
	const team = side === 'home' ? home : away
	const opponent = side === 'home' ? away : home
	return (
		<TeamFormSheetView
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose()
			}}
			detail={detailForTeam(team)}
			// Comes down from the row, exactly as it does on the real page — so a
			// priced row taps through to a sheet with the full 1X2, and an unpriced
			// one to a sheet with no market block at all.
			market={market}
			teamPreview={team}
			opponentPreview={{ shortName: opponent.shortName }}
		/>
	)
}

export function PreviewFixtureRow({
	fixture,
	kickoff,
	oddsAsOf,
}: {
	fixture: RowFixture
	/** Pre-resolved on the server so the fixture stays a plain serialisable object. */
	kickoff: string | null
	/** Same, for the odds' "as of" stamp. Null when the fixture carries no odds. */
	oddsAsOf?: string | null
}) {
	const [selected, setSelected] = useState<'home' | 'away' | null>(fixture.selectedSide ?? null)
	const readonly = !!fixture.readonly

	return (
		<FixtureRow
			home={fixture.home}
			away={fixture.away}
			kickoff={kickoff}
			odds={
				fixture.odds && oddsAsOf
					? {
							home: fixture.odds.home,
							draw: fixture.odds.draw,
							away: fixture.odds.away,
							asOf: oddsAsOf,
						}
					: null
			}
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
			renderFormSheet={({ fixtureId, side, open, onClose, market }) => {
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
						market={market ?? null}
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
	competitionType?: 'league' | 'knockout' | 'group_knockout'
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
			competitionType={card.competitionType}
			currentRoundClosed={card.currentRoundClosed}
			summaryInHero={card.summaryInHero}
			startExpanded={card.startExpanded}
			onSubmitPick={async (next) => setPick(next)}
			planHandlers={{ onLock: async () => {} }}
			renderFormSheet={previewFormSheet}
		/>
	)
}

/** A Table-view scenario with its clocks already resolved to ISO strings. */
export interface PreviewPickTableInput {
	fixtures: PickTableFixture[]
	usedTeamsByRound?: Record<string, string>
	restrictedTeams?: Record<string, string>
	currentTeamId?: string | null
	readonly?: boolean
}

/**
 * The real `PickTable`, driven from fixtures. Sorting is the component's own
 * state, so every column is live here; picking is stubbed to a local "this is
 * now your pick" so a row commit is reviewable without the picks API.
 */
export function PreviewPickTable({
	fixtures,
	usedTeamsByRound,
	restrictedTeams,
	currentTeamId,
	readonly,
}: PreviewPickTableInput) {
	const [picked, setPicked] = useState<string | null>(currentTeamId ?? null)
	const rows = buildPickTableRows({ fixtures, usedTeamsByRound, restrictedTeams })
	return (
		<PickTable
			rows={rows}
			currentTeamId={picked}
			readonly={readonly}
			onPick={(row) => setPicked(row.team.id)}
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
