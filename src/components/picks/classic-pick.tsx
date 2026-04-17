'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
	usedTeamsByRound: Record<string, string> // teamId -> "GW18"
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
		router.refresh()
	}

	const selectedFixture = fixtures.find(
		(f) => f.home.id === selectedTeamId || f.away.id === selectedTeamId,
	)
	const selectedTeam =
		selectedFixture?.home.id === selectedTeamId ? selectedFixture?.home : selectedFixture?.away
	const selectedSide = selectedFixture?.home.id === selectedTeamId ? 'home' : 'away'

	return (
		<div className="space-y-2">
			<div className="flex justify-between items-baseline mb-3">
				<h2 className="font-display text-xl font-semibold">{roundName}</h2>
				{deadline && (
					<span className="text-xs font-medium text-[var(--draw)] bg-[var(--draw-bg)] px-2 py-0.5 rounded-md">
						⏱ {formatDeadline(deadline)}
					</span>
				)}
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
