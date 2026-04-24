import type { LiveFixture, LivePick } from './types'

const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

export function deriveMatchState(
	fixture: LiveFixture,
	now: Date = new Date(),
): 'pre' | 'live' | 'ht' | 'ft' {
	if (fixture.status === 'halftime') return 'ht'
	if (fixture.status === 'finished') return 'ft'

	if (!fixture.kickoff) return 'pre'
	const kickoffMs =
		typeof fixture.kickoff === 'string' ? Date.parse(fixture.kickoff) : fixture.kickoff.getTime()
	const nowMs = now.getTime()

	if (nowMs < kickoffMs - LIVE_WINDOW_BEFORE_MS) return 'pre'
	if (nowMs > kickoffMs + LIVE_WINDOW_AFTER_MS) return 'ft'
	return 'live'
}

export type PickOutcome =
	| 'winning'
	| 'drawing'
	| 'losing'
	| 'saved-by-life'
	| 'settled-win'
	| 'settled-loss'
	| 'pending'

export function projectPickOutcome(
	pick: LivePick,
	fixture: LiveFixture,
	_mode: 'classic' | 'turbo' | 'cup',
): PickOutcome {
	if (pick.result === 'saved_by_life') return 'saved-by-life'
	if (pick.result === 'win') return 'settled-win'
	if (pick.result === 'loss') return 'settled-loss'

	const { homeScore, awayScore, status } = fixture
	if (homeScore == null || awayScore == null) return 'pending'

	const isFinished = status === 'finished'

	if (pick.predictedResult === 'home_win') {
		if (homeScore > awayScore) return isFinished ? 'settled-win' : 'winning'
		if (homeScore < awayScore) return isFinished ? 'settled-loss' : 'losing'
		return isFinished ? 'settled-loss' : 'drawing'
	}

	if (pick.predictedResult === 'away_win') {
		if (awayScore > homeScore) return isFinished ? 'settled-win' : 'winning'
		if (awayScore < homeScore) return isFinished ? 'settled-loss' : 'losing'
		return isFinished ? 'settled-loss' : 'drawing'
	}

	if (pick.predictedResult === 'draw') {
		if (homeScore === awayScore) return isFinished ? 'settled-win' : 'drawing'
		return isFinished ? 'settled-loss' : 'losing'
	}

	return 'pending'
}
