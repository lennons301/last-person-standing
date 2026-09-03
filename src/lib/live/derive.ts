import { resolveClassicPickResult } from '@/lib/game/classic-survival'
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
	mode: 'classic' | 'turbo' | 'cup',
): PickOutcome {
	if (pick.result === 'saved_by_life') return 'saved-by-life'
	if (pick.result === 'win') return 'settled-win'
	if (pick.result === 'loss') return 'settled-loss'

	const { homeScore, awayScore, status } = fixture
	if (homeScore == null || awayScore == null) return 'pending'

	const isFinished = status === 'finished'

	// Classic backs a team to win, and one shared module decides whether it did
	// — the same one settlement calls, so the live view can't contradict the
	// result it is about to show (#242). Deciding here on the score alone showed
	// a penalty-decided tie as a loss. A classic pick carries no
	// `predictedResult`: the team it is stored against IS the call.
	if (mode === 'classic') {
		const { result, defer } = resolveClassicPickResult(pick, fixture)
		if (defer || result == null) return 'pending'
		if (result === 'win') return isFinished ? 'settled-win' : 'winning'
		if (result === 'draw') return isFinished ? 'settled-loss' : 'drawing'
		return isFinished ? 'settled-loss' : 'losing'
	}

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
