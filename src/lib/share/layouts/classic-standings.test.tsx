import { describe, expect, it } from 'vitest'
import { classicStandingsLayout } from './classic-standings'

const fixture = {
	mode: 'classic' as const,
	flat: false,
	header: {
		gameName: 'Test',
		gameMode: 'classic' as const,
		competitionName: 'WC',
		pot: '100.00',
		potTotal: '100.00',
		generatedAt: new Date('2026-04-27T12:00:00Z'),
	},
	classicGrid: {
		aliveCount: 2,
		eliminatedCount: 1,
		pot: '100.00',
		rounds: [
			{ id: 'r1', number: 1, name: 'GW1' },
			{ id: 'r2', number: 2, name: 'GW2' },
		],
		players: [
			{
				id: 'p1',
				name: 'Sean',
				status: 'alive' as const,
				eliminatedRoundNumber: null,
				cellsByRoundId: {
					r1: { result: 'win' as const, teamShortName: 'BRA' },
					r2: { result: 'pending' as const, teamShortName: 'FRA' },
				},
			},
			{
				id: 'p2',
				name: 'Anna',
				status: 'eliminated' as const,
				eliminatedRoundNumber: 2,
				cellsByRoundId: {
					r1: { result: 'win' as const, teamShortName: 'GER' },
					r2: { result: 'skull' as const },
				},
			},
		],
	} as never,
}

describe('classicStandingsLayout', () => {
	it('renders without throwing for the canonical fixture', () => {
		const { jsx, width, height } = classicStandingsLayout(fixture)
		expect(jsx).toBeTruthy()
		expect(width).toBe(1080)
		expect(height).toBeGreaterThanOrEqual(600)
	})

	it('canvas height fits every visible row (regression: rows were clipping ~half the field)', () => {
		// 16 alive players, no cap/overflow. @vercel/og clips to this fixed height,
		// so it must leave room for all 16 rows. The old `260 + n*52` gave 1092 and
		// clipped past ~row 11; the corrected `340 + n*70` gives 1460.
		const players = Array.from({ length: 16 }).map((_, i) => ({
			id: `p${i}`,
			name: `Player ${i + 1}`,
			status: 'alive' as const,
			eliminatedRoundNumber: null,
			cellsByRoundId: {
				r1: { result: 'win' as const, teamShortName: 'ARS' },
			},
		}))
		const data: Extract<import('../data').StandingsShareData, { mode: 'classic' }> = {
			mode: 'classic',
			flat: false,
			header: fixture.header,
			classicGrid: {
				aliveCount: 16,
				eliminatedCount: 0,
				pot: '100.00',
				rounds: [{ id: 'r1', number: 1, name: 'GW1' }],
				players,
			} as never,
		}
		const { height } = classicStandingsLayout(data)
		// Enough vertical room for all 16 rows (≥ 70px each) plus header chrome.
		expect(height).toBeGreaterThanOrEqual(16 * 70)
		expect(height).toBe(1460)
	})

	it('caps at 30 visible (20 alive + 10 eliminated) and emits an overflow tail when needed', () => {
		const bigPlayers = Array.from({ length: 35 }).map((_, i) => ({
			id: `p${i}`,
			name: `Player${i}`,
			status: i < 25 ? ('alive' as const) : ('eliminated' as const),
			eliminatedRoundNumber: i < 25 ? null : 1,
			cellsByRoundId: {} as Record<string, never>,
		}))
		const big: Extract<import('../data').StandingsShareData, { mode: 'classic' }> = {
			mode: 'classic',
			flat: false,
			header: fixture.header,
			classicGrid: {
				aliveCount: 25,
				eliminatedCount: 10,
				pot: '100.00',
				rounds: [{ id: 'r1', number: 1, name: 'GW1' }],
				players: bigPlayers,
			} as never,
		}
		const { jsx } = classicStandingsLayout(big)
		expect(jsx).toBeTruthy()
	})
})
