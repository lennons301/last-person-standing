import type { GoalEvent, LivePayload, PickSettlementEvent } from './types'

export function detectGoalDeltas(previous: LivePayload, next: LivePayload): GoalEvent[] {
	const events: GoalEvent[] = []
	const observedAt = Date.now()

	for (const nextFx of next.fixtures) {
		const prevFx = previous.fixtures.find((f) => f.id === nextFx.id)
		if (!prevFx) continue

		for (const side of ['home', 'away'] as const) {
			const prevScore = side === 'home' ? prevFx.homeScore : prevFx.awayScore
			const nextScore = side === 'home' ? nextFx.homeScore : nextFx.awayScore
			if (prevScore == null || nextScore == null) continue
			if (nextScore <= prevScore) continue

			for (let s = prevScore + 1; s <= nextScore; s++) {
				events.push({
					id: `${nextFx.id}:${side}:${s}`,
					fixtureId: nextFx.id,
					side,
					newScore: s,
					previousScore: s - 1,
					observedAt,
				})
			}
		}
	}
	return events
}

const SETTLED_RESULTS = new Set(['win', 'loss', 'saved_by_life'])

export function detectPickSettlements(
	previous: LivePayload,
	next: LivePayload,
): PickSettlementEvent[] {
	const events: PickSettlementEvent[] = []
	const observedAt = Date.now()

	for (const nextPk of next.picks) {
		const prevPk = previous.picks.find(
			(p) => p.gamePlayerId === nextPk.gamePlayerId && p.fixtureId === nextPk.fixtureId,
		)
		if (!prevPk) continue
		if (prevPk.result === nextPk.result) continue
		if (SETTLED_RESULTS.has(String(prevPk.result))) continue
		if (!SETTLED_RESULTS.has(String(nextPk.result))) continue
		if (!next.roundId) continue

		const mapped =
			nextPk.result === 'win'
				? 'settled-win'
				: nextPk.result === 'loss'
					? 'settled-loss'
					: 'saved-by-life'

		events.push({
			id: `${nextPk.gamePlayerId}:${next.roundId}:${mapped}`,
			gamePlayerId: nextPk.gamePlayerId,
			roundId: next.roundId,
			result: mapped,
			observedAt,
		})
	}
	return events
}
