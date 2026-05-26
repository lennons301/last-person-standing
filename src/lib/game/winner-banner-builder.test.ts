import { describe, expect, it } from 'vitest'
import { buildWinnerBanner } from './winner-banner-builder'

// The prop returned by buildWinnerBanner is passed from a Server Component
// (game/[id]/page.tsx) to a Client Component (GameDetailView). Next.js
// requires all values crossing that boundary to be JSON-serializable.
// `structuredClone` throws on function refs / class instances — a faithful
// proxy for the runtime serialization Next.js performs (whereas
// `JSON.stringify` silently drops functions, hiding the bug).
//
// History: PR #55 shipped a version of this function that passed lucide-react
// component refs (`icon: Flame`) as part of the prop. Production rendered a
// blank page on every completed game with "An error occurred in the Server
// Components render." This test exists so that class of bug fails here, not
// in prod.

function assertSerializable(value: unknown): void {
	// Throws DataCloneError on functions / class instances / Maps with non-
	// serializable values / etc. Throwing here means the prop would crash
	// the RSC boundary at runtime.
	structuredClone(value)
}

describe('buildWinnerBanner', () => {
	it('returns null when the game is not completed', () => {
		expect(
			buildWinnerBanner({
				gameMode: 'turbo',
				gameStatus: 'active',
				potTotal: '100.00',
				players: [],
				turboStandings: null,
				cupStandings: null,
				classicGrid: null,
			}),
		).toBeNull()
	})

	it('returns null when no players have status=winner', () => {
		expect(
			buildWinnerBanner({
				gameMode: 'turbo',
				gameStatus: 'completed',
				potTotal: '100.00',
				players: [{ id: 'gp1', userId: 'u1', status: 'eliminated' }],
				turboStandings: null,
				cupStandings: null,
				classicGrid: null,
			}),
		).toBeNull()
	})

	it('turbo: builds a JSON-serializable payload with streak + goals stats', () => {
		const banner = buildWinnerBanner({
			gameMode: 'turbo',
			gameStatus: 'completed',
			potTotal: '100.00',
			players: [{ id: 'gp1', userId: 'u1', status: 'winner' }],
			turboStandings: {
				rounds: [
					{
						id: 'r1',
						number: 1,
						name: 'GW1',
						label: 'GW1',
						status: 'completed',
						players: [
							{
								id: 'gp1',
								name: 'Alice',
								picks: [],
								streak: 6,
								goals: 4,
								hasSubmitted: true,
							},
						],
						fixtures: [],
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: shape-only fixture for the builder
			} as any,
			cupStandings: null,
			classicGrid: null,
		})
		expect(banner).not.toBeNull()
		expect(banner?.winners).toHaveLength(1)
		expect(banner?.winners[0]).toMatchObject({
			userId: 'u1',
			name: 'Alice',
			potShare: '100.00',
		})
		// String keys, not function refs — the whole point of this fix.
		expect(banner?.winners[0].stats[0].iconKey).toBe('flame')
		expect(banner?.winners[0].stats[1].iconKey).toBe('target')
		// Must survive the RSC boundary.
		assertSerializable(banner)
	})

	it('cup: builds a JSON-serializable payload with lives + streak + goals stats', () => {
		const banner = buildWinnerBanner({
			gameMode: 'cup',
			gameStatus: 'completed',
			potTotal: '480.00',
			players: [{ id: 'gp1', userId: 'u1', status: 'winner' }],
			turboStandings: null,
			cupStandings: {
				gameId: 'g1',
				roundId: 'r1',
				roundNumber: 1,
				roundLabel: 'R1',
				roundStatus: 'completed',
				maxLives: 3,
				numberOfPicks: 6,
				players: [
					{
						id: 'gp1',
						userId: 'u1',
						name: 'Bob',
						status: 'winner',
						livesRemaining: 2,
						streak: 5,
						goals: 7,
						hasSubmitted: true,
						eliminatedRoundNumber: null,
						eliminatedRoundLabel: null,
						picks: [],
					},
				],
				fixtures: [],
			},
			classicGrid: null,
		})
		expect(banner?.winners[0].stats.map((s) => s.iconKey)).toEqual(['heart', 'flame', 'target'])
		assertSerializable(banner)
	})

	it('classic: builds a JSON-serializable payload with rounds-played stat', () => {
		const banner = buildWinnerBanner({
			gameMode: 'classic',
			gameStatus: 'completed',
			potTotal: '50.00',
			players: [{ id: 'gp1', userId: 'u1', status: 'winner' }],
			turboStandings: null,
			cupStandings: null,
			classicGrid: {
				rounds: [
					{ id: 'r1', number: 1, name: 'GW1', label: 'GW1', isStartingRound: true, voidedAt: null },
					{
						id: 'r2',
						number: 2,
						name: 'GW2',
						label: 'GW2',
						isStartingRound: false,
						voidedAt: null,
					},
				],
				players: [{ id: 'gp1', name: 'Cara', status: 'winner', cellsByRoundId: {} }],
				aliveCount: 1,
				eliminatedCount: 0,
				pot: '50.00',
				// biome-ignore lint/suspicious/noExplicitAny: shape-only fixture for the builder
			} as any,
		})
		expect(banner?.winners[0].stats[0]).toMatchObject({ iconKey: 'list-checks', label: 'rounds' })
		expect(banner?.winners[0].stats[0].value).toBe(2)
		assertSerializable(banner)
	})

	it('split-pot: divides the pot across multiple winners', () => {
		const banner = buildWinnerBanner({
			gameMode: 'turbo',
			gameStatus: 'completed',
			potTotal: '100.00',
			players: [
				{ id: 'gp1', userId: 'u1', status: 'winner' },
				{ id: 'gp2', userId: 'u2', status: 'winner' },
			],
			turboStandings: {
				rounds: [
					{
						id: 'r1',
						number: 1,
						name: 'GW1',
						label: 'GW1',
						status: 'completed',
						players: [
							{ id: 'gp1', name: 'A', picks: [], streak: 4, goals: 3, hasSubmitted: true },
							{ id: 'gp2', name: 'B', picks: [], streak: 4, goals: 3, hasSubmitted: true },
						],
						fixtures: [],
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: shape-only fixture for the builder
			} as any,
			cupStandings: null,
			classicGrid: null,
		})
		expect(banner?.winners).toHaveLength(2)
		expect(banner?.winners[0].potShare).toBe('50.00')
		expect(banner?.winners[1].potShare).toBe('50.00')
		assertSerializable(banner)
	})
})
