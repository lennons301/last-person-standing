'use client'

import { useRouter } from 'next/navigation'
import { CupPick, type CupPickFixture, type CupPickSlot } from './cup-pick'

interface CupPickFormProps {
	gameId: string
	roundId: string
	fixtures: CupPickFixture[]
	numberOfPicks: number
	livesRemaining: number
	maxLives: number
	initialSlots: CupPickSlot[]
	deadline: Date | null
	readonly?: boolean
	/** When set, the admin is picking on behalf of this player. */
	actingAs?: { gamePlayerId: string; userName: string }
}

export function CupPickForm({
	gameId,
	roundId,
	fixtures,
	numberOfPicks,
	livesRemaining,
	maxLives,
	initialSlots,
	deadline,
	readonly,
	actingAs,
}: CupPickFormProps) {
	const router = useRouter()

	async function handleSubmit(slots: CupPickSlot[]) {
		const res = await fetch(`/api/picks/${gameId}/${roundId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				picks: slots.map((s) => ({
					fixtureId: s.fixtureId,
					confidenceRank: s.confidenceRank,
					predictedResult: s.pickedSide === 'home' ? 'home_win' : 'away_win',
				})),
				...(actingAs ? { actingAs: actingAs.gamePlayerId } : {}),
			}),
		})
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: 'Failed to submit picks' }))
			// CupPick shows the thrown message in its error state. Task 8 will extend the
			// pick API to surface a typed cup error and this can become richer.
			throw new Error(body.error ?? 'Failed to submit picks')
		}
		router.refresh()
	}

	return (
		<CupPick
			fixtures={fixtures}
			numberOfPicks={numberOfPicks}
			livesRemaining={livesRemaining}
			maxLives={maxLives}
			initialSlots={initialSlots}
			onSubmit={handleSubmit}
			deadline={deadline}
			readonly={readonly}
			submitLabelOverride={actingAs ? `Submit as ${actingAs.userName}` : undefined}
		/>
	)
}
