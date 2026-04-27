import { describe, expect, it } from 'vitest'
import { classicLiveLayout } from './classic-live'

const fixture = {
	mode: 'classic' as const,
	header: {
		gameName: 'Test',
		gameMode: 'classic' as const,
		competitionName: 'WC',
		pot: '100.00',
		potTotal: '100.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	rows: [
		{
			id: 'p1',
			userId: 'u1',
			name: 'Sean',
			pickedTeamShort: 'BRA',
			homeShort: 'BRA',
			awayShort: 'SER',
			homeScore: 2,
			awayScore: 0,
			fixtureStatus: 'live' as const,
			liveState: 'winning' as const,
		},
		{
			id: 'p2',
			userId: 'u2',
			name: 'Anna',
			pickedTeamShort: 'FRA',
			homeShort: 'FRA',
			awayShort: 'AUS',
			homeScore: 0,
			awayScore: 1,
			fixtureStatus: 'live' as const,
			liveState: 'losing' as const,
		},
	],
	roundNumber: 7,
}

describe('classicLiveLayout', () => {
	it('renders the canonical fixture', () => {
		const r = classicLiveLayout(fixture)
		expect(r.jsx).toBeTruthy()
		expect(r.width).toBe(1080)
	})
})
