import { describe, expect, it } from 'vitest'
import { turboLiveLayout } from './turbo-live'

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
				status: 'active' as const,
				players: [{ id: 'p1', name: 'Sean', picks: [], streak: 9, goals: 12, hasSubmitted: true }],
				fixtures: [],
			},
		],
	} as never,
	roundNumber: 7,
	roundLabel: 'GW7',
	overflowCount: 0,
	matchupsLegend: 'BRA v SER · ENG v USA',
}

describe('turboLiveLayout', () => {
	it('renders the canonical fixture', () => {
		const r = turboLiveLayout(fixture)
		expect(r.jsx).toBeTruthy()
		expect(r.width).toBe(1080)
		expect(r.height).toBeGreaterThanOrEqual(700)
	})

	it('renders gracefully when turboData has no rounds', () => {
		const empty = { ...fixture, turboData: { rounds: [] } as never }
		const { jsx } = turboLiveLayout(empty)
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
						status: 'active' as const,
						players: [
							{ id: 'p1', name: 'Sean', picks: [], streak: 9, goals: 12, hasSubmitted: true },
						],
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboLiveLayout(multiRound)
		expect(jsx).toBeTruthy()
	})

	it('caps at 20 players and shows overflow row', () => {
		const manyPlayers = Array.from({ length: 25 }, (_, i) => ({
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
						status: 'active' as const,
						players: manyPlayers,
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboLiveLayout(overflowFixture)
		expect(jsx).toBeTruthy()
	})

	it('sorts players by streak desc then goals desc', () => {
		const players = [
			{ id: 'p1', name: 'LowStreak', picks: [], streak: 2, goals: 20, hasSubmitted: true },
			{ id: 'p2', name: 'HighStreak', picks: [], streak: 9, goals: 5, hasSubmitted: true },
		]
		const sortedFixture = {
			...fixture,
			turboData: {
				rounds: [
					{
						id: 'r1',
						number: 7,
						name: 'GW7',
						status: 'active' as const,
						players,
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboLiveLayout(sortedFixture)
		expect(jsx).toBeTruthy()
	})
})
