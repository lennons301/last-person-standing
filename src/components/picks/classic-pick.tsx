'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChainRibbon, type ChainSlot } from '@/components/picks/chain-ribbon'
import { useOnPickEditRequest } from '@/components/picks/edit-pick-event'
import { PlannerRound } from '@/components/picks/planner-round'
import { TeamBadge } from '@/components/picks/team-badge'
import { formatDeadline } from '@/lib/format'
import type { ChainSummary, PlannerRoundInput } from '@/lib/game/classic-planner-view'
import { FixtureRow, type FixtureTeamInfo, type RowFormSheetRenderer } from './fixture-row'
import { PickConfirmBar } from './pick-confirm-bar'

export interface ClassicPickFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoff: string | null
}

export interface ClassicPickPlanHandlers {
	/** Commit/replace a locked real pick for a future round. */
	onLock: (roundId: string, teamId: string) => Promise<void>
}

interface ClassicPickProps {
	gameId: string
	roundId: string
	roundName: string
	roundNumber: number
	competitionId: string
	deadline: Date | null
	fixtures: ClassicPickFixture[]
	usedTeamsByRound: Record<string, string>
	existingPickTeamId: string | null
	existingPickFixtureId: string | null
	chain?: { slots: ChainSlot[]; summary: ChainSummary }
	futureRounds?: PlannerRoundInput[]
	planHandlers?: ClassicPickPlanHandlers
	/**
	 * True when the current round's deadline has passed (and the game hasn't yet
	 * advanced). The current-round fixtures lock, but the player can still lock
	 * in real picks for upcoming rounds via the planner below.
	 */
	currentRoundClosed?: boolean
	/** When set, the admin is picking on behalf of this player. */
	actingAs?: { gamePlayerId: string; userName: string }
	/**
	 * True when the hero above already shows the locked-in pick. The collapsed
	 * state then shrinks to a single "change your pick" bar instead of repeating
	 * the same team, opponent and deadline a second time.
	 */
	summaryInHero?: boolean
	/**
	 * Fixture-driven override for the form-detail sheet, applied to the
	 * current-round rows and the planner's rows alike. Only `/preview/picks`
	 * passes it; in the app the rows resolve the sheet from `competitionId`
	 * through its server action.
	 */
	renderFormSheet?: RowFormSheetRenderer
}

interface PickSelection {
	fixtureId: string
	teamId: string
}

export function ClassicPick({
	gameId,
	roundId,
	roundName,
	roundNumber,
	competitionId,
	deadline,
	fixtures,
	usedTeamsByRound,
	existingPickTeamId,
	existingPickFixtureId,
	chain,
	futureRounds,
	planHandlers,
	currentRoundClosed = false,
	actingAs,
	summaryInHero = false,
	renderFormSheet,
}: ClassicPickProps) {
	const router = useRouter()
	const initialSelection: PickSelection | null =
		existingPickTeamId && existingPickFixtureId
			? { fixtureId: existingPickFixtureId, teamId: existingPickTeamId }
			: null
	const [selection, setSelection] = useState<PickSelection | null>(initialSelection)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Collapse fixtures by default if a pick is already locked in
	const [expanded, setExpanded] = useState(!existingPickTeamId)

	// The hero above owns the pick confirmation; its "Change pick" button expands
	// the fixtures here so changing a pick stays a one-click action.
	useOnPickEditRequest(() => setExpanded(true))

	function handlePick(fixture: ClassicPickFixture, side: 'home' | 'away') {
		const teamId = side === 'home' ? fixture.home.id : fixture.away.id
		if (usedTeamsByRound[teamId]) return
		// Toggle off if clicking the same team in the same fixture; otherwise move
		// the selection to (this fixture, this team). Picking a different fixture
		// for the same team still moves the selection — the team isn't "used"
		// against itself, just relocated.
		if (selection?.fixtureId === fixture.id && selection?.teamId === teamId) {
			setSelection(null)
		} else {
			setSelection({ fixtureId: fixture.id, teamId })
		}
		setError(null)
	}

	async function handleSubmit() {
		if (!selection) return
		setLoading(true)
		setError(null)
		const res = await fetch(`/api/picks/${gameId}/${roundId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				teamId: selection.teamId,
				fixtureId: selection.fixtureId,
				...(actingAs ? { actingAs: actingAs.gamePlayerId } : {}),
			}),
		})
		setLoading(false)
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: 'Failed to submit pick' }))
			setError(body.error ?? 'Failed to submit pick')
			return
		}
		// After submission, collapse the fixtures view
		setExpanded(false)
		router.refresh()
	}

	const selectedFixture = selection ? fixtures.find((f) => f.id === selection.fixtureId) : null
	const selectedTeam = selectedFixture
		? selectedFixture.home.id === selection?.teamId
			? selectedFixture.home
			: selectedFixture.away
		: null
	const selectedSide: 'home' | 'away' | undefined = selectedFixture
		? selectedFixture.home.id === selection?.teamId
			? 'home'
			: 'away'
		: undefined

	// Find the fixture for the existing (locked) pick
	const lockedFixture = existingPickFixtureId
		? fixtures.find((f) => f.id === existingPickFixtureId)
		: null
	const lockedTeam = lockedFixture
		? lockedFixture.home.id === existingPickTeamId
			? lockedFixture.home
			: lockedFixture.away
		: null
	const lockedOpponent = lockedFixture
		? lockedFixture.home.id === existingPickTeamId
			? lockedFixture.away
			: lockedFixture.home
		: null
	const lockedSide = lockedFixture && lockedFixture.home.id === existingPickTeamId ? 'H' : 'A'

	const collapsedSummary = !expanded && existingPickTeamId && lockedTeam && lockedOpponent

	const currentRoundCard = collapsedSummary ? (
		summaryInHero ? (
			// The hero above carries the pick confirmation; all this needs to be is
			// the way back into the fixtures.
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<span className="text-sm font-semibold">Change your {roundName} pick</span>
				<ChevronDown className="h-4 w-4" />
			</button>
		) : (
			<div className="rounded-lg border border-[var(--alive)]/40 bg-[var(--alive-bg)] p-4">
				<div className="flex items-center justify-between flex-wrap gap-3">
					<div className="flex items-center gap-3">
						<TeamBadge shortName={lockedTeam.shortName} size="lg" />
						<div>
							<div className="text-xs uppercase tracking-wide text-[var(--alive)] font-semibold">
								{roundName} · picks locked
							</div>
							<div className="font-display text-lg font-semibold">
								{lockedTeam.name}{' '}
								<span className="text-sm text-muted-foreground font-normal">
									vs {lockedOpponent.name} ({lockedSide})
								</span>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{deadline && (
							<span className="text-xs font-medium text-muted-foreground">
								⏱ {formatDeadline(deadline)}
							</span>
						)}
						<button
							type="button"
							onClick={() => setExpanded(true)}
							className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							Change pick <ChevronDown className="h-3 w-3" />
						</button>
					</div>
				</div>
			</div>
		)
	) : (
		<div className="space-y-2">
			{/* No round heading and no deadline chip: the hero above names the round
			    and counts the deadline down in every state that renders this picker.
			    Expanded, the selector's job is narrowly "choose your team" — so the
			    only chrome it keeps is the way back to the collapsed summary. */}
			{existingPickTeamId && (
				<div className="flex justify-end mb-3">
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						Collapse <ChevronUp className="h-3 w-3" />
					</button>
				</div>
			)}

			{fixtures.map((fixture) => {
				const isSelectedFixture = fixture.id === selection?.fixtureId
				// "Used in another fixture this round": the team has been clicked in a
				// DIFFERENT fixture in this round. Treats Man City vs Brentford and Man
				// City vs Crystal Palace as alternate slots for the same team, with one
				// pick burning the team for the round (Option B + grey-out per UX call).
				const homeUsedThisRound = !isSelectedFixture && selection?.teamId === fixture.home.id
				const awayUsedThisRound = !isSelectedFixture && selection?.teamId === fixture.away.id
				const homeUsedPriorRound = !!usedTeamsByRound[fixture.home.id]
				const awayUsedPriorRound = !!usedTeamsByRound[fixture.away.id]

				const homeUsed = homeUsedThisRound || homeUsedPriorRound
				const awayUsed = awayUsedThisRound || awayUsedPriorRound

				let usedSide: 'home' | 'away' | 'both' | null = null
				if (homeUsed && awayUsed) usedSide = 'both'
				else if (homeUsed) usedSide = 'home'
				else if (awayUsed) usedSide = 'away'

				const selected = isSelectedFixture
					? fixture.home.id === selection?.teamId
						? 'home'
						: 'away'
					: null

				return (
					<FixtureRow
						key={fixture.id}
						home={fixture.home}
						away={fixture.away}
						kickoff={fixture.kickoff ?? undefined}
						selectedSide={selected}
						usedSide={usedSide}
						usedLabel={usedSide === 'both' ? `Both used` : undefined}
						onPickHome={() => handlePick(fixture, 'home')}
						onPickAway={() => handlePick(fixture, 'away')}
						competitionId={competitionId}
						roundNumber={roundNumber}
						renderFormSheet={
							renderFormSheet
								? (args) => renderFormSheet({ ...args, home: fixture.home, away: fixture.away })
								: undefined
						}
					/>
				)
			})}

			{error && <p className="text-sm text-[var(--eliminated)] px-2">{error}</p>}

			{selectedTeam && selectedFixture && (
				<PickConfirmBar
					message={`Picking ${selectedTeam.name} vs ${
						selectedSide === 'home' ? selectedFixture.away.name : selectedFixture.home.name
					} (${selectedSide === 'home' ? 'H' : 'A'})`}
					actionLabel={
						existingPickFixtureId === selection?.fixtureId &&
						existingPickTeamId === selection?.teamId
							? 'Already locked'
							: actingAs
								? `Submit as ${actingAs.userName}`
								: 'Lock in pick'
					}
					onConfirm={handleSubmit}
					disabled={
						existingPickFixtureId === selection?.fixtureId &&
						existingPickTeamId === selection?.teamId
					}
					loading={loading}
				/>
			)}
		</div>
	)

	// Locking an upcoming pick commits a REAL pick against that round (editable
	// by re-picking until that round's own deadline) — the same endpoint the
	// current round uses. Callers can override via `planHandlers` for tests.
	const resolvedHandlers: ClassicPickPlanHandlers = planHandlers ?? {
		onLock: async (rid, tid) => {
			const res = await fetch(`/api/picks/${gameId}/${rid}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					teamId: tid,
					...(actingAs ? { actingAs: actingAs.gamePlayerId } : {}),
				}),
			})
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed to lock in pick' }))
				throw new Error(body.error ?? 'Failed to lock in pick')
			}
			router.refresh()
		},
	}

	// When the current round's deadline has passed (game not yet advanced) the
	// current-round fixtures lock — show a read-only summary, not the editable
	// picker. Upcoming-round locking below stays available. With the hero above
	// carrying the locked pick (and its live score), this card would be a second
	// copy of it, so it stands down entirely and the planner becomes the section.
	const closedRoundCard = summaryInHero ? null : (
		<div className="rounded-lg border border-border bg-card p-4">
			{existingPickTeamId && lockedTeam && lockedOpponent ? (
				<div className="flex items-center gap-3">
					<TeamBadge shortName={lockedTeam.shortName} size="lg" />
					<div>
						<div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
							{roundName} · picks locked
						</div>
						<div className="font-display text-lg font-semibold">
							{lockedTeam.name}{' '}
							<span className="text-sm text-muted-foreground font-normal">
								vs {lockedOpponent.name} ({lockedSide})
							</span>
						</div>
					</div>
				</div>
			) : (
				<div className="text-sm text-muted-foreground text-center">
					{roundName} closed — picks locked. Live scores and standings update below.
				</div>
			)}
		</div>
	)

	const planner = futureRounds && futureRounds.length > 0 && (
		<PlannerSection
			gameId={gameId}
			competitionId={competitionId}
			rounds={futureRounds}
			handlers={resolvedHandlers}
			defaultOpen={currentRoundClosed}
			renderFormSheet={renderFormSheet}
		/>
	)

	// A closed round whose card has stood down, with no chain and nothing to plan,
	// has nothing left to render — and an empty wrapper would still take the
	// section's bottom margin.
	if (currentRoundClosed && !closedRoundCard && !chain && !planner) return null

	return (
		<div className="space-y-4">
			{chain && <ChainRibbon slots={chain.slots} summary={chain.summary} />}
			{currentRoundClosed ? closedRoundCard : <div>{currentRoundCard}</div>}
			{planner}
		</div>
	)
}

/**
 * Collapsible wrapper around the planner rounds. Open/closed state is
 * persisted in localStorage, scoped by gameId so each game remembers its
 * own preference.
 */
function PlannerSection({
	gameId,
	competitionId,
	rounds,
	handlers,
	defaultOpen = false,
	renderFormSheet,
}: {
	gameId: string
	competitionId: string
	rounds: PlannerRoundInput[]
	handlers: ClassicPickPlanHandlers
	defaultOpen?: boolean
	renderFormSheet?: RowFormSheetRenderer
}) {
	const storageKey = `lps.planner-open.${gameId}`
	const [open, setOpen] = useState(defaultOpen)
	const [error, setError] = useState<string | null>(null)

	// Hydrate the open/closed preference from localStorage after mount to avoid
	// SSR/client markup mismatches. An explicit saved preference wins over the
	// default in both directions.
	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (saved === 'open') setOpen(true)
			else if (saved === 'closed') setOpen(false)
		} catch {
			// ignore — localStorage access can throw in some browsers
		}
	}, [storageKey])

	function toggle() {
		const next = !open
		setOpen(next)
		try {
			window.localStorage.setItem(storageKey, next ? 'open' : 'closed')
		} catch {
			// ignore
		}
	}

	async function guard<T>(fn: () => Promise<T>): Promise<void> {
		setError(null)
		try {
			await fn()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Something went wrong')
		}
	}

	const lockedCount = rounds.filter((r) => r.lockedTeamId).length

	return (
		<div className="rounded-xl border border-border bg-card">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<div>
					<div className="font-semibold text-sm">Lock in upcoming picks</div>
					<div className="text-xs text-muted-foreground">
						{rounds.length} upcoming {rounds.length === 1 ? 'gameweek' : 'gameweeks'} ·{' '}
						{lockedCount} locked
					</div>
				</div>
				{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
			</button>
			{open && (
				<div className="border-t border-border p-3 space-y-3">
					{error && (
						<p className="text-sm text-[var(--eliminated)] px-1" role="alert">
							{error}
						</p>
					)}
					{rounds.map((r) => (
						<PlannerRound
							key={r.roundId}
							roundId={r.roundId}
							roundNumber={r.roundNumber}
							roundName={r.roundName}
							roundLabel={r.roundLabel}
							deadline={r.deadline}
							fixturesTbc={r.fixturesTbc}
							fixtures={r.fixtures}
							usedTeams={r.usedTeams}
							lockedTeamId={r.lockedTeamId}
							onLock={(rid, tid) => guard(() => handlers.onLock(rid, tid))}
							competitionId={competitionId}
							renderFormSheet={renderFormSheet}
						/>
					))}
				</div>
			)}
		</div>
	)
}
