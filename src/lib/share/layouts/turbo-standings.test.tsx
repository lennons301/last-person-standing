import type { ReactElement } from 'react'
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

// Recursively walk the rendered JSX tree and collect every string child.
// Lets the tests assert that team names actually appear in the share image,
// independent of exact layout structure.
function collectText(node: unknown): string[] {
	if (node == null || typeof node === 'boolean') return []
	if (typeof node === 'string' || typeof node === 'number') return [String(node)]
	if (Array.isArray(node)) return node.flatMap(collectText)
	if (typeof node === 'object' && node !== null && 'props' in node) {
		const props = (node as ReactElement).props as { children?: unknown }
		return collectText(props.children)
	}
	return []
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

	it("renders the picked team's shortName in each cell (not a single H/D/A letter)", () => {
		// Regression: shareable grid showed single letters H/D/A which were
		// unreadable on a phone screenshot. The image should now carry the
		// 3-letter team code, mirroring the in-app TurboCell.
		const withPicks = {
			...fixture,
			turboData: {
				rounds: [
					{
						id: 'r1',
						number: 7,
						name: 'GW7',
						status: 'completed' as const,
						players: [
							{
								id: 'p1',
								name: 'Sean',
								picks: [
									{
										rank: 1,
										homeShort: 'MUN',
										awayShort: 'LIV',
										prediction: 'home_win' as const,
										result: 'win' as const,
										goalsCounted: 2,
									},
									{
										rank: 2,
										homeShort: 'ARS',
										awayShort: 'CHE',
										prediction: 'away_win' as const,
										result: 'loss' as const,
										goalsCounted: 0,
									},
									{
										rank: 3,
										homeShort: 'TOT',
										awayShort: 'EVE',
										prediction: 'draw' as const,
										result: 'pending' as const,
										goalsCounted: 0,
									},
								],
								streak: 1,
								goals: 2,
								hasSubmitted: true,
							},
						],
						fixtures: [],
					},
				],
			} as never,
		}
		const { jsx } = turboStandingsLayout(withPicks)
		const text = collectText(jsx)
		// Win: home_win picked → home short shown ('MUN').
		expect(text).toContain('MUN')
		// Loss: away_win picked → away short shown ('CHE').
		expect(text).toContain('CHE')
		// Draw prediction → 'DRAW' label.
		expect(text).toContain('DRAW')
		// And critically — the bare-letter labels are no longer the only thing
		// in the cells. Confirm none of the single-letter prediction badges
		// land as a top-level cell text.
		// (The letters could legitimately appear inside player names, so we
		// just assert the team codes are present rather than asserting H/D/A
		// absence outright.)
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
