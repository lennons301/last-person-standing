import { describe, expect, it } from 'vitest'
import {
	countLiveFixtures,
	groupBoardFixtures,
	hasLiveAction,
	orderBoardFixtures,
	viewerPicksByFixture,
} from './board'
import type { LiveFixture, LivePayload, LivePick } from './types'

const NOW = new Date('2026-08-05T15:00:00.000Z')

function fixture(overrides: Partial<LiveFixture> & { id: string }): LiveFixture {
	return {
		kickoff: NOW,
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		homeShort: 'HOM',
		awayShort: 'AWY',
		...overrides,
	}
}

function minutesFromNow(mins: number): Date {
	return new Date(NOW.getTime() + mins * 60_000)
}

describe('orderBoardFixtures', () => {
	it('orders live → upcoming → finished', () => {
		const finished = fixture({ id: 'ft', status: 'finished', kickoff: minutesFromNow(-200) })
		const upcoming = fixture({ id: 'pre', kickoff: minutesFromNow(120) })
		const live = fixture({ id: 'live', status: 'live', kickoff: minutesFromNow(-30) })

		const ordered = orderBoardFixtures([finished, upcoming, live], NOW)

		expect(ordered.map((f) => f.fixture.id)).toEqual(['live', 'pre', 'ft'])
		expect(ordered.map((f) => f.state)).toEqual(['live', 'pre', 'ft'])
	})

	it('sorts live by kickoff ascending and finished by kickoff descending', () => {
		const earlyLive = fixture({ id: 'live-early', status: 'live', kickoff: minutesFromNow(-60) })
		const lateLive = fixture({ id: 'live-late', status: 'halftime', kickoff: minutesFromNow(-20) })
		const oldFt = fixture({ id: 'ft-old', status: 'finished', kickoff: minutesFromNow(-600) })
		const newFt = fixture({ id: 'ft-new', status: 'finished', kickoff: minutesFromNow(-300) })

		const ordered = orderBoardFixtures([oldFt, lateLive, newFt, earlyLive], NOW)

		expect(ordered.map((f) => f.fixture.id)).toEqual([
			'live-early',
			'live-late',
			'ft-new',
			'ft-old',
		])
	})

	it('sorts upcoming by next kickoff first and tolerates missing kickoffs', () => {
		const tbc = fixture({ id: 'tbc', kickoff: null })
		const later = fixture({ id: 'later', kickoff: minutesFromNow(600) })
		const sooner = fixture({ id: 'sooner', kickoff: minutesFromNow(120) })

		const ordered = orderBoardFixtures([later, sooner, tbc], NOW)

		expect(ordered.map((f) => f.fixture.id)).toEqual(['tbc', 'sooner', 'later'])
	})
})

describe('groupBoardFixtures', () => {
	it('buckets fixtures into live / upcoming / finished, dropping empty groups', () => {
		const groups = groupBoardFixtures(
			[
				fixture({ id: 'ft', status: 'finished', kickoff: minutesFromNow(-300) }),
				fixture({ id: 'live', status: 'live', kickoff: minutesFromNow(-30) }),
				fixture({ id: 'ht', status: 'halftime', kickoff: minutesFromNow(-25) }),
			],
			NOW,
		)

		expect(groups.map((g) => g.key)).toEqual(['live', 'finished'])
		expect(groups[0].fixtures.map((f) => f.fixture.id)).toEqual(['live', 'ht'])
		expect(groups[1].fixtures.map((f) => f.fixture.id)).toEqual(['ft'])
	})

	it('returns no groups for an empty round', () => {
		expect(groupBoardFixtures([], NOW)).toEqual([])
	})
})

describe('hasLiveAction', () => {
	it('is true while a fixture is in play', () => {
		expect(
			hasLiveAction([fixture({ id: 'a', status: 'live', kickoff: minutesFromNow(-10) })], NOW),
		).toBe(true)
	})

	it('is true inside the pre-kickoff live window', () => {
		expect(hasLiveAction([fixture({ id: 'a', kickoff: minutesFromNow(5) })], NOW)).toBe(true)
	})

	it('is false when everything is finished or far from kickoff', () => {
		const fixtures = [
			fixture({ id: 'ft', status: 'finished', kickoff: minutesFromNow(-300) }),
			fixture({ id: 'pre', kickoff: minutesFromNow(600) }),
		]
		expect(hasLiveAction(fixtures, NOW)).toBe(false)
	})

	it('is false for an empty round', () => {
		expect(hasLiveAction([], NOW)).toBe(false)
	})
})

describe('countLiveFixtures', () => {
	it('counts live and half-time fixtures only', () => {
		const fixtures = [
			fixture({ id: 'live', status: 'live', kickoff: minutesFromNow(-30) }),
			fixture({ id: 'ht', status: 'halftime', kickoff: minutesFromNow(-25) }),
			fixture({ id: 'ft', status: 'finished', kickoff: minutesFromNow(-300) }),
			fixture({ id: 'pre', kickoff: minutesFromNow(600) }),
		]
		expect(countLiveFixtures(fixtures, NOW)).toBe(2)
	})
})

describe('viewerPicksByFixture', () => {
	function pick(overrides: Partial<LivePick> & { gamePlayerId: string }): LivePick {
		return {
			fixtureId: 'f1',
			teamId: 't1',
			confidenceRank: null,
			predictedResult: 'home_win',
			result: null,
			...overrides,
		}
	}

	const payload: LivePayload = {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures: [],
		picks: [
			pick({ gamePlayerId: 'mine', fixtureId: 'f1' }),
			pick({ gamePlayerId: 'my-rebuy', fixtureId: 'f2' }),
			pick({ gamePlayerId: 'theirs', fixtureId: 'f3' }),
			pick({ gamePlayerId: 'mine', fixtureId: null }),
		],
		players: [
			{ id: 'mine', userId: 'u1', status: 'active', livesRemaining: 0 },
			{ id: 'my-rebuy', userId: 'u1', status: 'eliminated', livesRemaining: 0 },
			{ id: 'theirs', userId: 'u2', status: 'active', livesRemaining: 0 },
		],
		viewerUserId: 'u1',
		updatedAt: NOW.toISOString(),
	}

	it('keys every pick belonging to the viewer by fixture', () => {
		const byFixture = viewerPicksByFixture(payload)

		expect([...byFixture.keys()].sort()).toEqual(['f1', 'f2'])
		expect(byFixture.get('f1')?.gamePlayerId).toBe('mine')
	})

	it('ignores other players and picks without a fixture', () => {
		const byFixture = viewerPicksByFixture(payload)

		expect(byFixture.has('f3')).toBe(false)
		expect(byFixture.size).toBe(2)
	})
})
