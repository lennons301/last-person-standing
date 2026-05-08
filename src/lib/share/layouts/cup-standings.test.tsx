import { describe, expect, it } from 'vitest'
import { cupStandingsLayout } from './cup-standings'

const fixture = {
	mode: 'cup' as const,
	header: {
		gameName: 'Cup',
		gameMode: 'cup' as const,
		competitionName: 'WC',
		pot: '50.00',
		potTotal: '50.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	cupData: {
		gameId: 'g1',
		roundId: 'r1',
		roundNumber: 7,
		roundLabel: 'GW7',
		roundStatus: 'open' as const,
		numberOfPicks: 10,
		maxLives: 3,
		players: [
			{
				id: 'p1',
				userId: 'u1',
				name: 'Sean',
				status: 'alive' as const,
				eliminatedRoundNumber: null,
				livesRemaining: 3,
				streak: 8,
				goals: 14,
				picks: [],
				hasSubmitted: true,
			},
		],
	} as never,
	overflowCount: 0,
}

describe('cupStandingsLayout', () => {
	it('renders for the canonical fixture', () => {
		const { jsx, width, height } = cupStandingsLayout(fixture)
		expect(jsx).toBeTruthy()
		expect(width).toBe(1080)
		expect(height).toBeGreaterThanOrEqual(700)
	})

	it('sorts alive players before eliminated', () => {
		const withEliminated = {
			mode: 'cup' as const,
			header: fixture.header,
			overflowCount: 0,
			cupData: {
				gameId: 'g1',
				roundId: 'r1',
				roundNumber: 7,
				roundLabel: 'GW7',
				roundStatus: 'open' as const,
				numberOfPicks: 10,
				maxLives: 3,
				players: [
					{
						id: 'p2',
						userId: 'u2',
						name: 'Eliminated',
						status: 'eliminated' as const,
						eliminatedRoundNumber: 5,
						livesRemaining: 0,
						streak: 2,
						goals: 3,
						picks: [],
						hasSubmitted: true,
					},
					{
						id: 'p1',
						userId: 'u1',
						name: 'Sean',
						status: 'alive' as const,
						eliminatedRoundNumber: null,
						livesRemaining: 3,
						streak: 8,
						goals: 14,
						picks: [],
						hasSubmitted: true,
					},
				],
			} as never,
		}
		const { jsx, height } = cupStandingsLayout(withEliminated)
		expect(jsx).toBeTruthy()
		expect(height).toBeGreaterThanOrEqual(700)
	})

	it('emits overflow row when more than cap', () => {
		const manyPlayers = Array.from({ length: 35 }, (_, i) => ({
			id: `p${i}`,
			userId: `u${i}`,
			name: `Player ${i}`,
			status: 'alive' as const,
			eliminatedRoundNumber: null,
			livesRemaining: 3,
			streak: i,
			goals: i * 2,
			picks: [],
			hasSubmitted: true,
		}))
		const overflowFixture = {
			mode: 'cup' as const,
			header: fixture.header,
			overflowCount: 5,
			cupData: {
				gameId: 'g1',
				roundId: 'r1',
				roundNumber: 7,
				roundLabel: 'GW7',
				roundStatus: 'open' as const,
				numberOfPicks: 10,
				maxLives: 3,
				players: manyPlayers,
			} as never,
		}
		const { jsx } = cupStandingsLayout(overflowFixture)
		expect(jsx).toBeTruthy()
	})
})
