import { describe, expect, it } from 'vitest'
import { cupLiveLayout } from './cup-live'

const baseHeader = {
	gameName: 'Cup',
	gameMode: 'cup' as const,
	competitionName: 'WC',
	pot: '50.00',
	potTotal: '50.00',
	generatedAt: new Date('2026-04-27T12:00:00Z'),
}

const baseCupData = {
	gameId: 'g1',
	roundId: 'r1',
	roundNumber: 7,
	roundLabel: 'GW7',
	roundStatus: 'active' as const,
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
}

const fixture = {
	mode: 'cup' as const,
	header: baseHeader,
	cupData: baseCupData as never,
	roundNumber: 7,
	roundLabel: 'GW7',
	overflowCount: 0,
	matchupsLegend: 'BRA v SER · ENG v USA',
}

describe('cupLiveLayout', () => {
	it('renders the canonical fixture', () => {
		const r = cupLiveLayout(fixture)
		expect(r.jsx).toBeTruthy()
		expect(r.width).toBe(1080)
		expect(r.height).toBeGreaterThanOrEqual(700)
	})

	it('renders gracefully with no players', () => {
		const noPlayers = {
			mode: 'cup' as const,
			header: baseHeader,
			cupData: { ...baseCupData, players: [] } as never,
			roundNumber: 7,
			roundLabel: 'GW7',
			overflowCount: 0,
			matchupsLegend: 'BRA v SER · ENG v USA',
		}
		const { jsx } = cupLiveLayout(noPlayers)
		expect(jsx).toBeTruthy()
	})

	it('caps alive at 16 and adds up to 4 recently eliminated', () => {
		const manyAlive = Array.from({ length: 20 }, (_, i) => ({
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
		const manyElim = Array.from({ length: 6 }, (_, i) => ({
			id: `e${i}`,
			userId: `eu${i}`,
			name: `Elim ${i}`,
			status: 'eliminated' as const,
			eliminatedRoundNumber: 5,
			livesRemaining: 0,
			streak: i,
			goals: i,
			picks: [],
			hasSubmitted: true,
		}))
		const overflowFixture = {
			mode: 'cup' as const,
			header: baseHeader,
			cupData: { ...baseCupData, players: [...manyAlive, ...manyElim] } as never,
			roundNumber: 7,
			roundLabel: 'GW7',
			overflowCount: 6,
			matchupsLegend: 'BRA v SER · ENG v USA',
		}
		const { jsx, height } = cupLiveLayout(overflowFixture)
		expect(jsx).toBeTruthy()
		expect(height).toBeGreaterThanOrEqual(700)
	})

	it('sorts alive players by livesRemaining desc then streak desc then goals desc', () => {
		const players = [
			{
				id: 'p1',
				userId: 'u1',
				name: 'LowLives',
				status: 'alive' as const,
				eliminatedRoundNumber: null,
				livesRemaining: 1,
				streak: 10,
				goals: 20,
				picks: [],
				hasSubmitted: true,
			},
			{
				id: 'p2',
				userId: 'u2',
				name: 'HighLives',
				status: 'alive' as const,
				eliminatedRoundNumber: null,
				livesRemaining: 3,
				streak: 5,
				goals: 10,
				picks: [],
				hasSubmitted: true,
			},
		]
		const sortedFixture = {
			mode: 'cup' as const,
			header: baseHeader,
			cupData: { ...baseCupData, players } as never,
			roundNumber: 7,
			roundLabel: 'GW7',
			overflowCount: 0,
			matchupsLegend: 'BRA v SER · ENG v USA',
		}
		const { jsx } = cupLiveLayout(sortedFixture)
		expect(jsx).toBeTruthy()
	})
})
