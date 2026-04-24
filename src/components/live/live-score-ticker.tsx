'use client'
import { deriveMatchState } from '@/lib/live/derive'
import type { LivePick } from '@/lib/live/types'
import { GoalCelebration } from './goal-celebration'
import { LiveFixtureCard } from './live-fixture-card'
import { ReconnectingChip } from './live-indicators'
import { useLiveGame } from './use-live-game'

export function LiveScoreTicker() {
	const { payload, reconnecting } = useLiveGame()
	if (!payload) return null

	const now = new Date()
	const livish = payload.fixtures.filter((f) => {
		const state = deriveMatchState(f, now)
		return state === 'pre' || state === 'live' || state === 'ht'
	})
	if (livish.length === 0) return null

	const viewerPicksByFixture = new Map<string, LivePick>()
	const viewerPlayerIds = new Set(
		payload.players.filter((p) => p.userId === payload.viewerUserId).map((p) => p.id),
	)
	for (const pk of payload.picks) {
		if (viewerPlayerIds.has(pk.gamePlayerId) && pk.fixtureId) {
			viewerPicksByFixture.set(pk.fixtureId, pk)
		}
	}

	return (
		<div className="mb-4 flex items-start gap-2">
			<div className="flex flex-1 gap-2 overflow-x-auto pb-1">
				{livish.map((fixture) => {
					const viewerPick = viewerPicksByFixture.get(fixture.id) ?? null
					return (
						<GoalCelebration key={fixture.id} fixtureId={fixture.id} viewerPick={viewerPick}>
							<LiveFixtureCard fixture={fixture} isMyPick={Boolean(viewerPick)} now={now} />
						</GoalCelebration>
					)
				})}
			</div>
			{reconnecting && (
				<div className="shrink-0 pt-1">
					<ReconnectingChip />
				</div>
			)}
		</div>
	)
}
