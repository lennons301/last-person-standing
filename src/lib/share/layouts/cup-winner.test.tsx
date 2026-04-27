import { describe, expect, it } from 'vitest'
import { cupWinnerLayout } from './cup-winner'

const fixture = {
	mode: 'cup' as const,
	header: {
		gameName: 'Cup',
		gameMode: 'cup' as const,
		competitionName: 'WC',
		pot: '320.00',
		potTotal: '320.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	winners: [
		{
			userId: 'u1',
			name: 'Sean',
			potShare: '320.00',
			cupMeta: { livesRemaining: 2, streak: 14, goals: 47 },
		},
	],
	runnersUp: [
		{
			userId: 'u2',
			name: 'Anna',
			livesRemaining: 1,
			streak: 12,
			goals: 42,
			eliminatedRoundNumber: null,
		},
		{
			userId: 'u3',
			name: 'Phil',
			livesRemaining: 0,
			streak: 7,
			goals: 31,
			eliminatedRoundNumber: 16,
		},
	],
	overflowCount: 0,
}

describe('cupWinnerLayout', () => {
	it('renders solo winner', () => {
		const r = cupWinnerLayout(fixture)
		expect(r.jsx).toBeTruthy()
		expect(r.width).toBe(1080)
		expect(r.height).toBeGreaterThanOrEqual(700)
	})

	it('renders split-pot scenario', () => {
		const split = {
			...fixture,
			winners: [
				fixture.winners[0],
				{
					userId: 'u2',
					name: 'Anna',
					potShare: '160.00',
					cupMeta: { livesRemaining: 1, streak: 12, goals: 42 },
				},
			],
		}
		const { jsx } = cupWinnerLayout(split)
		expect(jsx).toBeTruthy()
	})
})
