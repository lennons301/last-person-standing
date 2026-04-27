import { describe, expect, it } from 'vitest'
import { turboWinnerLayout } from './turbo-winner'

const fixture = {
	mode: 'turbo' as const,
	header: {
		gameName: 'Turbo',
		gameMode: 'turbo' as const,
		competitionName: 'PL',
		pot: '200.00',
		potTotal: '200.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	winners: [
		{
			userId: 'u1',
			name: 'Sean',
			potShare: '200.00',
			turboMeta: { streak: 14, goals: 38 },
		},
	],
	runnersUp: [
		{ userId: 'u2', name: 'Anna', streak: 12, goals: 31 },
		{ userId: 'u3', name: 'Dave', streak: 9, goals: 22 },
	],
	overflowCount: 0,
}

describe('turboWinnerLayout', () => {
	it('renders solo winner', () => {
		const r = turboWinnerLayout(fixture)
		expect(r.jsx).toBeTruthy()
		expect(r.width).toBe(1080)
		expect(r.height).toBeGreaterThanOrEqual(700)
	})

	it('renders split-pot scenario', () => {
		const split = {
			...fixture,
			winners: [
				fixture.winners[0],
				{ userId: 'u2', name: 'Anna', potShare: '100.00', turboMeta: { streak: 12, goals: 31 } },
			],
		}
		const { jsx } = turboWinnerLayout(split)
		expect(jsx).toBeTruthy()
	})
})
