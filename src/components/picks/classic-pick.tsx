'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChainRibbon, type ChainSlot } from '@/components/picks/chain-ribbon'
import { PlannerRound } from '@/components/picks/planner-round'
import { TeamBadge } from '@/components/picks/team-badge'
import { formatDeadline } from '@/lib/format'
import type { ChainSummary, PlannerRoundInput } from '@/lib/game/classic-planner-view'
import { FixtureRow, type FixtureTeamInfo } from './fixture-row'
import { PickConfirmBar } from './pick-confirm-bar'

export interface ClassicPickFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoff: string | null
}

export interface ClassicPickPlanHandlers {
	onPlan: (roundId: string, teamId: string, autoSubmit: boolean) => Promise<void>
	onRemove: (roundId: string) => Promise<void>
	onToggleAuto: (roundId: string, autoSubmit: boolean) => Promise<void>
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
	/** When set, the admin is picking on behalf of this player. */
	actingAs?: { gamePlayerId: string; userName: string }
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
	actingAs,
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

	const currentRoundCard =
		!expanded && existingPickTeamId && lockedTeam && lockedOpponent ? (
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
		) : (
			<div className="space-y-2">
				<div className="flex justify-between items-baseline mb-3">
					<h2 className="font-display text-xl font-semibold">{roundName}</h2>
					<div className="flex items-center gap-2">
						{deadline && (
							<span className="text-xs font-medium text-[var(--draw)] bg-[var(--draw-bg)] px-2 py-0.5 rounded-md">
								⏱ {formatDeadline(deadline)}
							</span>
						)}
						{existingPickTeamId && (
							<button
								type="button"
								onClick={() => setExpanded(false)}
								className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								Collapse <ChevronUp className="h-3 w-3" />
							</button>
						)}
					</div>
				</div>

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

	// Default handlers perform the standard REST calls against the planned-picks
	// endpoints. Callers can override via `planHandlers` for tests/storybook.
	const resolvedHandlers: ClassicPickPlanHandlers = planHandlers ?? {
		onPlan: async (rid, tid, auto) => {
			const res = await fetch(`/api/games/${gameId}/planned-picks`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ roundId: rid, teamId: tid, autoSubmit: auto }),
			})
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed to save plan' }))
				throw new Error(body.error ?? 'Failed to save plan')
			}
			router.refresh()
		},
		onRemove: async (rid) => {
			const res = await fetch(`/api/games/${gameId}/planned-picks/${rid}`, { method: 'DELETE' })
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed to clear plan' }))
				throw new Error(body.error ?? 'Failed to clear plan')
			}
			router.refresh()
		},
		onToggleAuto: async (rid, auto) => {
			// To toggle auto-submit we re-post the existing plan (upsert) with the new flag.
			// The server-side POST handler does a delete+insert so this is idempotent.
			const existing = futureRounds?.find((r) => r.roundId === rid)
			if (!existing?.plannedTeamId) return
			const res = await fetch(`/api/games/${gameId}/planned-picks`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					roundId: rid,
					teamId: existing.plannedTeamId,
					autoSubmit: auto,
				}),
			})
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed to toggle auto-submit' }))
				throw new Error(body.error ?? 'Failed to toggle auto-submit')
			}
			router.refresh()
		},
	}

	return (
		<div className="space-y-4">
			{chain && <ChainRibbon slots={chain.slots} summary={chain.summary} />}
			<div>{currentRoundCard}</div>
			{futureRounds && futureRounds.length > 0 && (
				<PlannerSection gameId={gameId} rounds={futureRounds} handlers={resolvedHandlers} />
			)}
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
	rounds,
	handlers,
}: {
	gameId: string
	rounds: PlannerRoundInput[]
	handlers: ClassicPickPlanHandlers
}) {
	const storageKey = `lps.planner-open.${gameId}`
	// Default closed — the planner is an optional power-user feature.
	const [open, setOpen] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Hydrate the open/closed preference from localStorage after mount to avoid
	// SSR/client markup mismatches.
	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (saved === 'open') setOpen(true)
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

	const plannedCount = rounds.filter((r) => r.plannedTeamId).length

	return (
		<div className="rounded-xl border border-border bg-card">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<div>
					<div className="font-semibold text-sm">Plan ahead</div>
					<div className="text-xs text-muted-foreground">
						{rounds.length} upcoming {rounds.length === 1 ? 'gameweek' : 'gameweeks'} ·{' '}
						{plannedCount} planned
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
							plannedTeamId={r.plannedTeamId}
							plannedAutoSubmit={r.plannedAutoSubmit}
							onPlan={(rid, tid, auto) => guard(() => handlers.onPlan(rid, tid, auto))}
							onRemove={(rid) => guard(() => handlers.onRemove(rid))}
							onToggleAuto={(rid, auto) => guard(() => handlers.onToggleAuto(rid, auto))}
						/>
					))}
				</div>
			)}
		</div>
	)
}
