import { describe, expect, it } from 'vitest'
import { hasActiveFixture, isFixtureInLiveWindow } from './match-window'

const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const MIN = 60 * 1000

describe('isFixtureInLiveWindow', () => {
	const kickoff = new Date('2026-06-11T15:00:00Z')

	it('returns true exactly at kickoff', () => {
		expect(isFixtureInLiveWindow(kickoff, kickoff)).toBe(true)
	})

	it('returns true 10 minutes before kickoff', () => {
		const now = new Date(kickoff.getTime() - LIVE_WINDOW_BEFORE_MS)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns false 11 minutes before kickoff', () => {
		const now = new Date(kickoff.getTime() - LIVE_WINDOW_BEFORE_MS - MIN)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(false)
	})

	it('stays open through extra time + penalties (175 minutes after kickoff)', () => {
		// A knockout tie that goes the distance — 90 + stoppage + ET + a penalty
		// shootout — finishes ~3 hours after kickoff. The old 150-minute window
		// closed before the shootout ended, so the FINISHED transition (and the
		// penalty winner) were never polled.
		const now = new Date(kickoff.getTime() + 175 * MIN)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns true at 210 minutes after kickoff (window edge)', () => {
		const now = new Date(kickoff.getTime() + 210 * MIN)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns false at 211 minutes after kickoff', () => {
		const now = new Date(kickoff.getTime() + 211 * MIN)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(false)
	})

	it('returns false when kickoff is null', () => {
		expect(isFixtureInLiveWindow(null, kickoff)).toBe(false)
	})
})

describe('hasActiveFixture', () => {
	const now = new Date('2026-06-11T15:30:00Z')

	it('returns true if any fixture is in its live window', () => {
		const fixtures = [
			{ kickoff: new Date('2026-06-11T12:00:00Z') },
			{ kickoff: new Date('2026-06-11T15:00:00Z') },
			{ kickoff: new Date('2026-06-11T20:00:00Z') },
		]
		expect(hasActiveFixture(fixtures, now)).toBe(true)
	})

	it('returns false if no fixtures are in their live window', () => {
		const fixtures = [
			{ kickoff: new Date('2026-06-11T09:00:00Z') },
			{ kickoff: new Date('2026-06-11T20:00:00Z') },
		]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})

	it('returns false on empty list', () => {
		expect(hasActiveFixture([], now)).toBe(false)
	})

	it('ignores fixtures with null kickoff', () => {
		const fixtures = [{ kickoff: null }]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})

	it('keeps polling a still-in-play tie deep into extra time / penalties', () => {
		// kickoff 175 min ago, still live (shootout in progress) → must stay active
		// so the FINISHED transition gets polled.
		const fixtures = [{ kickoff: new Date(now.getTime() - 175 * MIN), status: 'live' as const }]
		expect(hasActiveFixture(fixtures, now)).toBe(true)
	})

	it('treats an already-finished fixture as inactive even within the window', () => {
		// Once a fixture is terminal, polling it again does nothing — so a regulation
		// match that finished an hour ago must not keep the chain alive (QStash quota).
		const fixtures = [{ kickoff: new Date(now.getTime() - 60 * MIN), status: 'finished' as const }]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})

	it('treats a cancelled fixture as inactive', () => {
		const fixtures = [{ kickoff: new Date(now.getTime() - 30 * MIN), status: 'cancelled' as const }]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})

	it('still active when a within-window fixture has no status supplied', () => {
		// Backward-compatible: callers that pass only kickoff get the time-based gate.
		const fixtures = [{ kickoff: new Date(now.getTime() - 30 * MIN) }]
		expect(hasActiveFixture(fixtures, now)).toBe(true)
	})
})
