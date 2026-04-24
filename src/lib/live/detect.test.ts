import { describe, expect, it } from 'vitest'
import { detectGoalDeltas, detectPickSettlements } from './detect'
import type { LiveFixture, LivePayload, LivePick, LivePlayer } from './types'

function payload(overrides: Partial<LivePayload> = {}): LivePayload {
	return {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures: [],
		picks: [],
		players: [],
		viewerUserId: 'u1',
		updatedAt: new Date().toISOString(),
		...overrides,
	}
}

function fx(overrides: Partial<LiveFixture> = {}): LiveFixture {
	return {
		id: 'fx1',
		kickoff: new Date('2026-06-11T19:00:00Z'),
		homeScore: 0,
		awayScore: 0,
		status: 'live',
		homeShort: 'ENG',
		awayShort: 'FRA',
		...overrides,
	}
}

describe('detectGoalDeltas', () => {
	it('returns empty when no fixtures changed', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('emits one event when home score increments', () => {
		const a = payload({ fixtures: [fx({ homeScore: 0, awayScore: 0 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1, awayScore: 0 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].id).toBe('fx1:home:1')
		expect(events[0].side).toBe('home')
		expect(events[0].newScore).toBe(1)
		expect(events[0].previousScore).toBe(0)
	})

	it('emits one event per increment when score jumps by two', () => {
		const a = payload({ fixtures: [fx({ homeScore: 0 })] })
		const b = payload({ fixtures: [fx({ homeScore: 2 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(2)
		expect(events.map((e) => e.id)).toEqual(['fx1:home:1', 'fx1:home:2'])
	})

	it('never emits events for score decrements', () => {
		const a = payload({ fixtures: [fx({ homeScore: 2 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores transition from null to non-null (treated as initial load)', () => {
		const a = payload({ fixtures: [fx({ homeScore: null, awayScore: null })] })
		const b = payload({ fixtures: [fx({ homeScore: 1, awayScore: 0 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores non-null to null transition', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [fx({ homeScore: null })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores fixture removed between polls', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('emits for away-side increments', () => {
		const a = payload({ fixtures: [fx({ awayScore: 0 })] })
		const b = payload({ fixtures: [fx({ awayScore: 1 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].side).toBe('away')
		expect(events[0].id).toBe('fx1:away:1')
	})
})

function pk(overrides: Partial<LivePick> = {}): LivePick {
	return {
		gamePlayerId: 'gp1',
		fixtureId: 'fx1',
		teamId: 't-home',
		confidenceRank: 1,
		predictedResult: 'home_win',
		result: 'pending',
		...overrides,
	}
}

function pl(overrides: Partial<LivePlayer> = {}): LivePlayer {
	return { id: 'gp1', userId: 'u1', status: 'active', livesRemaining: 1, ...overrides }
}

describe('detectPickSettlements', () => {
	it('emits settled-loss when a pending pick transitions to loss', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].id).toBe('gp1:r1:settled-loss')
		expect(events[0].result).toBe('settled-loss')
	})

	it('emits settled-win on pending to win', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'win' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].result).toBe('settled-win')
	})

	it('emits saved-by-life on pending to saved_by_life', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'saved_by_life' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].result).toBe('saved-by-life')
	})

	it('does not re-emit on already-settled pick', () => {
		const a = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})

	it('does not emit for still-pending pick', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})

	it('ignores pick removed between polls', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})
})
