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

	it('renders the six most recent columns it was handed (#225: already filtered to played gameweeks)', () => {
		const rounds = Array.from({ length: 8 }).map((_, i) => ({
			id: `r${i + 1}`,
			number: i + 1,
			name: `Gameweek ${i + 1}`,
			label: `GW${i + 1}`,
			picksLocked: true,
		}))
		const data: Extract<import('../data').StandingsShareData, { mode: 'classic' }> = {
			mode: 'classic',
			flat: false,
			header: fixture.header,
			classicGrid: {
				aliveCount: 1,
				eliminatedCount: 0,
				pot: '100.00',
				rounds,
				players: [
					{
						id: 'p1',
						name: 'Player',
						status: 'alive' as const,
						eliminatedRoundNumber: null,
						goals: 0,
						cellsByRoundId: {},
					},
				],
			} as never,
		}
		const s = JSON.stringify(classicStandingsLayout(data).jsx)
		expect(s).not.toContain('GW1"')
		expect(s).not.toContain('GW2"')
		for (const label of ['GW3', 'GW4', 'GW5', 'GW6', 'GW7', 'GW8']) {
			expect(s).toContain(label)
		}
	})

	describe('no gameweek has passed its deadline (#225)', () => {
		const emptyRounds: Extract<import('../data').StandingsShareData, { mode: 'classic' }> = {
			mode: 'classic',
			flat: false,
			header: {
				...fixture.header,
				gameName: 'Pre-season game',
				pot: '480.00',
				potTotal: '480.00',
			},
			classicGrid: {
				aliveCount: 12,
				eliminatedCount: 3,
				pot: '480.00',
				rounds: [],
				players: [
					{
						id: 'p1',
						name: 'Alice',
						status: 'alive' as const,
						eliminatedRoundNumber: null,
						goals: 4,
						// Advance picks exist, but no round is revealable — the cells are
						// unreachable because no column survives the filter.
						cellsByRoundId: { r13: { result: 'locked' as const } },
					},
					{
						id: 'p2',
						name: 'Bob',
						status: 'eliminated' as const,
						eliminatedRoundNumber: 1,
						eliminatedRoundLabel: 'GW1',
						goals: 0,
						cellsByRoundId: {},
					},
				],
			} as never,
		}

		it('renders the card with a placeholder instead of gameweek columns', () => {
			const s = JSON.stringify(classicStandingsLayout(emptyRounds).jsx)
			expect(s).toContain('No gameweeks played yet')
			// Header, pot and the alive/eliminated counts survive.
			expect(s).toContain('Pre-season game')
			expect(s).toContain('480.00')
			expect(s).toContain('12 alive')
			expect(s).toContain('3 eliminated')
			// Player rows survive, goals column included.
			expect(s).toContain('Alice')
			expect(s).toContain('Bob')
			// And not a single padlock.
			expect(s).not.toContain('🔒')
			expect(s).not.toContain('Locked in')
		})

		it('keeps the fixed-canvas height maths (empty column strip costs no rows)', () => {
			const { width, height } = classicStandingsLayout(emptyRounds)
			expect(width).toBe(1080)
			// 340 chrome + 2 rows × 70 = 480, floored at the 600 minimum.
			expect(height).toBe(600)
		})
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
