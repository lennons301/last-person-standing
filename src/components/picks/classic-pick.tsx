'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TeamBadge } from '@/components/picks/team-badge'
import { formatDeadline } from '@/lib/format'
import { FixtureRow, type FixtureTeamInfo } from './fixture-row'
import { PickConfirmBar } from './pick-confirm-bar'

export interface ClassicPickFixture {
	id: string
	home: FixtureTeamInfo
	away: FixtureTeamInfo
	kickoff: string | null
}

interface ClassicPickProps {
	gameId: string
	roundId: string
	roundName: string
	deadline: Date | null
	fixtures: ClassicPickFixture[]
	usedTeamsByRound: Record<string, string>
	existingPickTeamId: string | null
}

export function ClassicPick({
	gameId,
	roundId,
	roundName,
	deadline,
	fixtures,
	usedTeamsByRound,
	existingPickTeamId,
}: ClassicPickProps) {
	const router = useRouter()
	const [selectedTeamId, setSelectedTeamId] = useState<string | null>(existingPickTeamId)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Collapse fixtures by default if a pick is already locked in
	const [expanded, setExpanded] = useState(!existingPickTeamId)

	function handlePick(fixture: ClassicPickFixture, side: 'home' | 'away') {
		const teamId = side === 'home' ? fixture.home.id : fixture.away.id
		if (usedTeamsByRound[teamId]) return
		setSelectedTeamId(teamId === selectedTeamId ? null : teamId)
		setError(null)
	}

	async function handleSubmit() {
		if (!selectedTeamId) return
		setLoading(true)
		setError(null)
		const res = await fetch(`/api/picks/${gameId}/${roundId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ teamId: selectedTeamId }),
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

	const selectedFixture = fixtures.find(
		(f) => f.home.id === selectedTeamId || f.away.id === selectedTeamId,
	)
	const selectedTeam =
		selectedFixture?.home.id === selectedTeamId ? selectedFixture?.home : selectedFixture?.away
	const selectedSide = selectedFixture?.home.id === selectedTeamId ? 'home' : 'away'

	// Find the fixture for the existing (locked) pick
	const lockedFixture = existingPickTeamId
		? fixtures.find((f) => f.home.id === existingPickTeamId || f.away.id === existingPickTeamId)
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

	// Collapsed mode: show a summary with toggle to expand
	if (!expanded && existingPickTeamId && lockedTeam && lockedOpponent) {
		return (
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
							className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted flex items-center gap-1"
						>
							Change pick <ChevronDown className="h-3 w-3" />
						</button>
					</div>
				</div>
			</div>
		)
	}

	return (
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
							className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted flex items-center gap-1"
						>
							Collapse <ChevronUp className="h-3 w-3" />
						</button>
					)}
				</div>
			</div>

			{fixtures.map((fixture) => {
				const homeUsed = usedTeamsByRound[fixture.home.id]
				const awayUsed = usedTeamsByRound[fixture.away.id]
				let usedSide: 'home' | 'away' | 'both' | null = null
				if (homeUsed && awayUsed) usedSide = 'both'
				else if (homeUsed) usedSide = 'home'
				else if (awayUsed) usedSide = 'away'

				const selected =
					fixture.home.id === selectedTeamId
						? 'home'
						: fixture.away.id === selectedTeamId
							? 'away'
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
					/>
				)
			})}

			{error && <p className="text-sm text-[var(--eliminated)] px-2">{error}</p>}

			{selectedTeam && selectedFixture && (
				<PickConfirmBar
					message={`Picking ${selectedTeam.name} vs ${
						selectedSide === 'home' ? selectedFixture.away.name : selectedFixture.home.name
					} (${selectedSide === 'home' ? 'H' : 'A'})`}
					actionLabel={existingPickTeamId === selectedTeamId ? 'Already locked' : 'Lock in pick'}
					onConfirm={handleSubmit}
					disabled={existingPickTeamId === selectedTeamId}
					loading={loading}
				/>
			)}
		</div>
	)
}
