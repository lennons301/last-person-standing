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

	// Surface every fixture in the current round, with state-aware ordering so
	// the most actionable ones (live → upcoming → finished) appear left-to-right.
	// Within each state group, sort sensibly: live by kickoff asc (oldest first
	// = most match minutes elapsed), upcoming by kickoff asc (next first),
	// finished by kickoff desc (most recent first).
	const stateOrder: Record<'live' | 'ht' | 'pre' | 'ft', number> = {
		live: 0,
		ht: 0,
		pre: 1,
		ft: 2,
	}
	const annotated = payload.fixtures.map((f) => ({ fixture: f, state: deriveMatchState(f, now) }))
	annotated.sort((a, b) => {
		const orderDiff = stateOrder[a.state] - stateOrder[b.state]
		if (orderDiff !== 0) return orderDiff
		const aKickoff = a.fixture.kickoff
			? typeof a.fixture.kickoff === 'string'
				? Date.parse(a.fixture.kickoff)
				: a.fixture.kickoff.getTime()
			: 0
		const bKickoff = b.fixture.kickoff
			? typeof b.fixture.kickoff === 'string'
				? Date.parse(b.fixture.kickoff)
				: b.fixture.kickoff.getTime()
			: 0
		return a.state === 'ft' ? bKickoff - aKickoff : aKickoff - bKickoff
	})
	if (annotated.length === 0) return null

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
				{annotated.map(({ fixture }) => {
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
