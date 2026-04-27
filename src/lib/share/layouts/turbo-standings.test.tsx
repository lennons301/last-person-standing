import { describe, expect, it } from 'vitest'
import { turboStandingsLayout } from './turbo-standings'

const fixture = {
	mode: 'turbo' as const,
	header: {
		gameName: 'Turbo',
		gameMode: 'turbo' as const,
		competitionName: 'PL',
		pot: '50.00',
		potTotal: '50.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	turboData: {
		rounds: [
			{
				id: 'r1',
				number: 7,
				name: 'GW7',
				status: 'completed' as const,
				players: [{ id: 'p1', name: 'Sean', picks: [], streak: 9, goals: 12, hasSubmitted: true }],
				fixtures: [],
			},
		],
	} as never,
	overflowCount: 0,
}

describe('turboStandingsLayout', () => {
	it('renders for the canonical fixture', () => {
		const { jsx, width, height } = turboStandingsLayout(fixture)
		expect(jsx).toBeTruthy()
		expect(width).toBe(1080)
		expect(height).toBeGreaterThanOrEqual(700)
	})

	it('renders gracefully when turboData has no rounds', () => {
		const empty = { ...fixture, turboData: { rounds: [] } as never }
		const { jsx } = turboStandingsLayout(empty)
		expect(jsx).toBeTruthy()
	})

	it('picks the latest round when multiple rounds exist', () => {
		const multiRound = {
			...fixture,
			turboData: {
				rounds: [
					{
						id: 'r1',
						number: 6,
						name: 'GW6',
						status: 'completed' as const,
						players: [
							{ id: 'p1', name: 'OldRound', picks: [], streak: 3, goals: 4, hasSubmitted: true },
						],
						fixtures: [],
					},
					{
						id: 'r2',
						number: 7,
						name: 'GW7',
						status: 'completed' as const,
						players: [
							{ id: 'p1', name: 'Sean', picks: [], streak: 9, goals: 12, hasSubmitted: true },
						],
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboStandingsLayout(multiRound)
		expect(jsx).toBeTruthy()
	})

	it('caps overflow when more than 30 players', () => {
		const manyPlayers = Array.from({ length: 35 }, (_, i) => ({
			id: `p${i}`,
			name: `Player ${i}`,
			picks: [],
			streak: i,
			goals: i * 2,
			hasSubmitted: true,
		}))
		const overflowFixture = {
			...fixture,
			turboData: {
				rounds: [
					{
						id: 'r1',
						number: 7,
						name: 'GW7',
						status: 'completed' as const,
						players: manyPlayers,
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboStandingsLayout(overflowFixture)
		expect(jsx).toBeTruthy()
	})
})
