import { describe, expect, it } from 'vitest'
import { classicWinnerLayout } from './classic-winner'

const fixture = {
	mode: 'classic' as const,
	header: {
		gameName: 'Test',
		gameMode: 'classic' as const,
		competitionName: 'WC',
		pot: '480.00',
		potTotal: '480.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	winners: [
		{
			userId: 'u1',
			name: 'Sean',
			potShare: '480.00',
			classicMeta: { roundsSurvived: 18, finalPickLabel: '' },
		},
	],
	runnersUp: [
		{ userId: 'u2', name: 'Anna', eliminatedRoundNumber: 17, eliminatedRoundLabel: 'GW17' },
		{ userId: 'u3', name: 'Dave', eliminatedRoundNumber: 14, eliminatedRoundLabel: 'GW14' },
	],
	overflowCount: 0,
}

describe('classicWinnerLayout', () => {
	it('renders solo winner', () => {
		const { jsx, width, height } = classicWinnerLayout(fixture)
		expect(jsx).toBeTruthy()
		expect(width).toBe(1080)
		expect(height).toBeGreaterThanOrEqual(700)
	})

	it('renders split-pot scenario with 3 winners', () => {
		const split = {
			...fixture,
			winners: [
				fixture.winners[0],
				{
					userId: 'u2',
					name: 'Anna',
					potShare: '160.00',
					classicMeta: { roundsSurvived: 18, finalPickLabel: '' },
				},
				{
					userId: 'u3',
					name: 'Jamie',
					potShare: '160.00',
					classicMeta: { roundsSurvived: 18, finalPickLabel: '' },
				},
			],
		}
		const { jsx } = classicWinnerLayout(split)
		expect(jsx).toBeTruthy()
	})
})
