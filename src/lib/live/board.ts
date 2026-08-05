import { deriveMatchState } from './derive'
import type { LiveFixture, LivePayload, LivePick } from './types'

export type MatchState = 'pre' | 'live' | 'ht' | 'ft'

export interface BoardFixture {
	fixture: LiveFixture
	state: MatchState
}

export interface BoardGroup {
	key: 'live' | 'upcoming' | 'finished'
	label: string
	fixtures: BoardFixture[]
}

const STATE_ORDER: Record<MatchState, number> = {
	live: 0,
	ht: 0,
	pre: 1,
	ft: 2,
}

function kickoffMs(fixture: LiveFixture): number {
	if (!fixture.kickoff) return 0
	return typeof fixture.kickoff === 'string'
		? Date.parse(fixture.kickoff)
		: fixture.kickoff.getTime()
}

/**
 * Every fixture in the round, state-aware ordered so the most actionable ones
 * (live → upcoming → finished) come first. Within each state group: live and
 * upcoming by kickoff ascending (oldest live = most minutes elapsed; next
 * upcoming first), finished by kickoff descending (most recent first).
 */
export function orderBoardFixtures(
	fixtures: LiveFixture[],
	now: Date = new Date(),
): BoardFixture[] {
	const annotated = fixtures.map((fixture) => ({ fixture, state: deriveMatchState(fixture, now) }))
	annotated.sort((a, b) => {
		const orderDiff = STATE_ORDER[a.state] - STATE_ORDER[b.state]
		if (orderDiff !== 0) return orderDiff
		const aKickoff = kickoffMs(a.fixture)
		const bKickoff = kickoffMs(b.fixture)
		return a.state === 'ft' ? bKickoff - aKickoff : aKickoff - bKickoff
	})
	return annotated
}

/** The ordered fixtures split into the three sections the pop-out renders. */
export function groupBoardFixtures(fixtures: LiveFixture[], now: Date = new Date()): BoardGroup[] {
	const ordered = orderBoardFixtures(fixtures, now)
	const groups: BoardGroup[] = [
		{ key: 'live', label: 'Live', fixtures: [] },
		{ key: 'upcoming', label: 'Upcoming', fixtures: [] },
		{ key: 'finished', label: 'Finished', fixtures: [] },
	]
	for (const entry of ordered) {
		const bucket = entry.state === 'ft' ? groups[2] : entry.state === 'pre' ? groups[1] : groups[0]
		bucket.fixtures.push(entry)
	}
	return groups.filter((g) => g.fixtures.length > 0)
}

/**
 * Is there live action right now? True when at least one fixture is in play —
 * kicked off (or within the pre-kickoff live window) and not yet finished.
 * Gates the pop-out control: no live action, no control.
 */
export function hasLiveAction(fixtures: LiveFixture[], now: Date = new Date()): boolean {
	return fixtures.some((f) => {
		const state = deriveMatchState(f, now)
		return state === 'live' || state === 'ht'
	})
}

/** How many fixtures are in play — surfaced on the pop-out control. */
export function countLiveFixtures(fixtures: LiveFixture[], now: Date = new Date()): number {
	return fixtures.filter((f) => {
		const state = deriveMatchState(f, now)
		return state === 'live' || state === 'ht'
	}).length
}

/**
 * The viewer's own picks keyed by fixture, so cards can badge "My pick".
 * A user can hold more than one player row in a game (rebuys), so match on
 * every player row belonging to the viewer.
 */
export function viewerPicksByFixture(payload: LivePayload): Map<string, LivePick> {
	const byFixture = new Map<string, LivePick>()
	const viewerPlayerIds = new Set(
		payload.players.filter((p) => p.userId === payload.viewerUserId).map((p) => p.id),
	)
	for (const pick of payload.picks) {
		if (viewerPlayerIds.has(pick.gamePlayerId) && pick.fixtureId) {
			byFixture.set(pick.fixtureId, pick)
		}
	}
	return byFixture
}
