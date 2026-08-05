import { describe, expect, it } from 'vitest'
import {
	type BuildGameViewInput,
	buildGameView,
	type GameMode,
	type GameViewPickInput,
} from '@/lib/game/game-view'

const NOW = new Date('2026-08-04T12:00:00.000Z')
const FUTURE_DEADLINE = new Date('2026-08-08T17:30:00.000Z')
const PAST_DEADLINE = new Date('2026-08-01T17:30:00.000Z')

const ROUND_ID = 'round-7'

function baseInput(overrides: Partial<BuildGameViewInput> = {}): BuildGameViewInput {
	return {
		gameMode: 'classic',
		gameStatus: 'active',
		round: {
			id: ROUND_ID,
			number: 7,
			status: 'open',
			deadline: FUTURE_DEADLINE,
			label: 'GW7',
			longLabel: 'Gameweek 7',
		},
		game: { currentRoundId: ROUND_ID, currentRoundNumber: 7 },
		isAlive: true,
		actingAsName: null,
		pick: null,
		picksRequired: 1,
		rebuyAvailable: false,
		pot: { confirmed: '60.00', total: '80.00' },
		aliveCount: 5,
		playerCount: 8,
		now: NOW,
		...overrides,
	}
}

const classicPick: GameViewPickInput = {
	picksMade: 1,
	isAuto: false,
	team: {
		shortName: 'ARS',
		name: 'Arsenal',
		opponentName: 'Everton',
		side: 'home',
		kickoffIso: '2026-08-08T14:00:00.000Z',
	},
}

function rankedPick(picksMade: number, isAuto = false): GameViewPickInput {
	return { picksMade, isAuto, team: null }
}

/** Per-mode pre-deadline inputs: how many slots a complete entry needs. */
const MODES: Array<{ mode: GameMode; picksRequired: number; complete: GameViewPickInput }> = [
	{ mode: 'classic', picksRequired: 1, complete: classicPick },
	{ mode: 'turbo', picksRequired: 10, complete: rankedPick(10) },
	{ mode: 'cup', picksRequired: 6, complete: rankedPick(6) },
]

describe('buildGameView — pre-deadline pick states', () => {
	for (const { mode, picksRequired, complete } of MODES) {
		describe(mode, () => {
			it('returns pick-open when the player has no pick', () => {
				const view = buildGameView(baseInput({ gameMode: mode, picksRequired, pick: null }))
				expect(view.hero).toMatchObject({
					kind: 'pick-open',
					mode,
					picksMade: 0,
					picksRequired,
					actingAsName: null,
				})
				expect(view.hero.kind === 'pick-open' && view.hero.round).toMatchObject({
					number: 7,
					label: 'GW7',
					longLabel: 'Gameweek 7',
					deadlineIso: FUTURE_DEADLINE.toISOString(),
				})
			})

			it('returns pick-made when the entry is complete', () => {
				const view = buildGameView(baseInput({ gameMode: mode, picksRequired, pick: complete }))
				expect(view.hero.kind).toBe('pick-made')
			})

			it('demotes the header round strip and stats while a hero renders', () => {
				const view = buildGameView(baseInput({ gameMode: mode, picksRequired, pick: complete }))
				expect(view.demote).toEqual({ headerRoundStrip: true, headerStats: true })
			})

			it('leaves the pre-redesign header alone once the deadline passes', () => {
				const view = buildGameView(
					baseInput({
						gameMode: mode,
						picksRequired,
						pick: complete,
						round: {
							id: ROUND_ID,
							number: 7,
							status: 'open',
							deadline: PAST_DEADLINE,
							label: 'GW7',
							longLabel: 'Gameweek 7',
						},
					}),
				)
				expect(view.hero).toMatchObject({ kind: 'none', reason: 'round-locked' })
				expect(view.demote).toEqual({ headerRoundStrip: false, headerStats: false })
			})
		})
	}

	it('summarises the classic pick as a team confirmation', () => {
		const view = buildGameView(baseInput({ pick: classicPick }))
		expect(view.hero).toMatchObject({
			kind: 'pick-made',
			mode: 'classic',
			pick: {
				type: 'team',
				shortName: 'ARS',
				name: 'Arsenal',
				opponentName: 'Everton',
				side: 'home',
				kickoffIso: '2026-08-08T14:00:00.000Z',
				isAuto: false,
			},
		})
	})

	it('falls back to a ranked summary if a classic pick has no team detail', () => {
		const view = buildGameView(baseInput({ pick: rankedPick(1) }))
		expect(view.hero).toMatchObject({
			kind: 'pick-made',
			pick: { type: 'ranked', picksMade: 1, picksRequired: 1 },
		})
	})

	it('summarises a complete ranked entry with its slot counts', () => {
		const view = buildGameView(
			baseInput({ gameMode: 'turbo', picksRequired: 10, pick: rankedPick(10) }),
		)
		expect(view.hero).toMatchObject({
			kind: 'pick-made',
			mode: 'turbo',
			pick: { type: 'ranked', picksMade: 10, picksRequired: 10, isAuto: false },
		})
	})

	it('treats a partial ranked entry as still open, carrying the progress', () => {
		const view = buildGameView(
			baseInput({ gameMode: 'cup', picksRequired: 6, pick: rankedPick(3) }),
		)
		expect(view.hero).toMatchObject({
			kind: 'pick-open',
			mode: 'cup',
			picksMade: 3,
			picksRequired: 6,
		})
	})

	it('marks an auto-submitted pick so the hero can carry the notice', () => {
		const view = buildGameView(baseInput({ pick: { ...classicPick, isAuto: true } }))
		expect(view.hero).toMatchObject({ kind: 'pick-made', pick: { isAuto: true } })
	})

	it('carries the acting-as name onto both pre-deadline variants', () => {
		const open = buildGameView(baseInput({ actingAsName: 'Dave' }))
		const made = buildGameView(baseInput({ actingAsName: 'Dave', pick: classicPick }))
		expect(open.hero).toMatchObject({ kind: 'pick-open', actingAsName: 'Dave' })
		expect(made.hero).toMatchObject({ kind: 'pick-made', actingAsName: 'Dave' })
	})

	it('treats picksRequired < 1 as a single required pick', () => {
		const view = buildGameView(baseInput({ picksRequired: 0, pick: null }))
		expect(view.hero).toMatchObject({ kind: 'pick-open', picksRequired: 1 })
	})

	it('passes the stat line through untouched', () => {
		const view = buildGameView(
			baseInput({
				pot: { confirmed: '120.00', total: '150.00' },
				aliveCount: 3,
				playerCount: 12,
				rebuyAvailable: true,
			}),
		)
		expect(view.stats).toEqual({
			potConfirmed: '120.00',
			potTotal: '150.00',
			aliveCount: 3,
			playerCount: 12,
			rebuyAvailable: true,
		})
	})
})

describe('buildGameView — no hero yet', () => {
	it('has no hero without a current round', () => {
		const view = buildGameView(
			baseInput({ round: null, game: { currentRoundId: null, currentRoundNumber: null } }),
		)
		expect(view.hero).toEqual({ kind: 'none', mode: 'classic', round: null, reason: 'no-round' })
	})

	it('has no hero on a completed game', () => {
		const view = buildGameView(baseInput({ gameStatus: 'completed', pick: classicPick }))
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'game-completed' })
	})

	it('has no hero once the round itself is processed', () => {
		const view = buildGameView(
			baseInput({
				round: {
					id: ROUND_ID,
					number: 7,
					status: 'completed',
					deadline: PAST_DEADLINE,
					label: 'GW7',
					longLabel: 'Gameweek 7',
				},
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'round-completed' })
	})

	it('has no hero for a round the game has not reached', () => {
		const view = buildGameView(
			baseInput({ game: { currentRoundId: 'round-9', currentRoundNumber: 9 } }),
		)
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'round-completed' })
	})

	it('has no hero for an eliminated player', () => {
		const view = buildGameView(baseInput({ isAlive: false }))
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'not-playing' })
	})
})

describe('buildGameView — purity', () => {
	it('pivots on the `now` argument alone', () => {
		const justBefore = buildGameView(
			baseInput({ now: new Date(FUTURE_DEADLINE.getTime() - 1), pick: classicPick }),
		)
		const exactlyOn = buildGameView(
			baseInput({ now: new Date(FUTURE_DEADLINE.getTime()), pick: classicPick }),
		)
		expect(justBefore.hero.kind).toBe('pick-made')
		expect(exactlyOn.hero).toMatchObject({ kind: 'none', reason: 'round-locked' })
	})

	it('does not mutate its input', () => {
		const input = baseInput({ pick: classicPick })
		const snapshot = structuredClone(input)
		buildGameView(input)
		expect(input).toEqual(snapshot)
	})

	// Mirrors the buildWinnerBanner serializability guard: the descriptor crosses
	// the Server → Client Component boundary, and structuredClone throws on
	// function refs where JSON.stringify silently drops them.
	it('returns a structuredClone-safe descriptor for every variant', () => {
		const variants: BuildGameViewInput[] = [
			...MODES.flatMap(({ mode, picksRequired, complete }) => [
				baseInput({ gameMode: mode, picksRequired, pick: null }),
				baseInput({ gameMode: mode, picksRequired, pick: complete }),
				baseInput({ gameMode: mode, picksRequired, pick: rankedPick(1, true) }),
			]),
			baseInput({ round: null, game: { currentRoundId: null, currentRoundNumber: null } }),
			baseInput({ gameStatus: 'completed' }),
			baseInput({ isAlive: false }),
			baseInput({ now: FUTURE_DEADLINE }),
		]
		for (const variant of variants) {
			const view = buildGameView(variant)
			expect(structuredClone(view)).toEqual(view)
			// Dates must already be ISO strings — no Date instances in the payload.
			expect(JSON.parse(JSON.stringify(view))).toEqual(view)
		}
	})
})
