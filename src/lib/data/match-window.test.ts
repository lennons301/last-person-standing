import { describe, expect, it } from 'vitest'
import { hasActiveFixture, isFixtureInLiveWindow } from './match-window'

const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

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
		const now = new Date(kickoff.getTime() - LIVE_WINDOW_BEFORE_MS - 60_000)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(false)
	})

	it('returns true 2.5 hours after kickoff', () => {
		const now = new Date(kickoff.getTime() + LIVE_WINDOW_AFTER_MS)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns false 2.5 hours and 1 minute after kickoff', () => {
		const now = new Date(kickoff.getTime() + LIVE_WINDOW_AFTER_MS + 60_000)
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
})
