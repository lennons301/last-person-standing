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

const classicTeam = {
	shortName: 'ARS',
	name: 'Arsenal',
	opponentName: 'Everton',
	side: 'home' as const,
	kickoffIso: '2026-08-08T14:00:00.000Z',
}

const classicPick: GameViewPickInput = {
	picksMade: 1,
	isAuto: false,
	team: classicTeam,
}

function rankedPick(picksMade: number, isAuto = false): GameViewPickInput {
	return { picksMade, isAuto, team: null }
}

/** The current round, deadline gone and matches in flight. */
const ACTIVE_ROUND: BuildGameViewInput['round'] = {
	id: ROUND_ID,
	number: 7,
	status: 'active',
	deadline: PAST_DEADLINE,
	label: 'GW7',
	longLabel: 'Gameweek 7',
}

/** The current round, settled — the game hasn't advanced off it yet. */
const COMPLETED_ROUND: BuildGameViewInput['round'] = { ...ACTIVE_ROUND, status: 'completed' }

function liveFixture(
	overrides: Partial<NonNullable<GameViewPickInput['fixture']>> = {},
): NonNullable<GameViewPickInput['fixture']> {
	return {
		id: 'fixture-1',
		status: 'live',
		homeShort: 'ARS',
		awayShort: 'EVE',
		homeScore: 1,
		awayScore: 0,
		kickoffIso: '2026-08-01T14:00:00.000Z',
		...overrides,
	}
}

const WINNER: BuildGameViewInput['winner'] = {
	winners: [
		{
			userId: 'user-1',
			name: 'Sean',
			potShare: '80.00',
			stats: [{ iconKey: 'list-checks', value: 7, label: 'rounds' }],
		},
	],
	runnerUpName: 'Dave',
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

			it('flips to the live hero once the deadline passes', () => {
				const view = buildGameView(
					baseInput({ gameMode: mode, picksRequired, pick: complete, round: ACTIVE_ROUND }),
				)
				expect(view.hero.kind).toBe('live')
				expect(view.demote).toEqual({ headerRoundStrip: true, headerStats: true })
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

describe('buildGameView — live hero', () => {
	it('reads the classic pick off its scoreboard while the match runs', () => {
		const view = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: { ...classicPick, fixture: liveFixture() },
			}),
		)
		expect(view.hero).toMatchObject({
			kind: 'live',
			mode: 'classic',
			survival: 'surviving',
			entry: {
				type: 'team',
				name: 'Arsenal',
				opponentName: 'Everton',
				side: 'home',
				fixture: { homeScore: 1, awayScore: 0, status: 'live' },
			},
		})
	})

	it('calls a level or losing classic pick at risk, not out', () => {
		const level = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: { ...classicPick, fixture: liveFixture({ homeScore: 1, awayScore: 1 }) },
			}),
		)
		const behind = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: { ...classicPick, fixture: liveFixture({ homeScore: 0, awayScore: 2 }) },
			}),
		)
		expect(level.hero).toMatchObject({ kind: 'live', survival: 'at-risk' })
		expect(behind.hero).toMatchObject({ kind: 'live', survival: 'at-risk' })
	})

	it('reads the away side of the fixture from the pick, not the home score', () => {
		const view = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: {
					...classicPick,
					team: { ...classicTeam, side: 'away' },
					fixture: liveFixture({ homeScore: 0, awayScore: 1 }),
				},
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'live', survival: 'surviving' })
	})

	it('trusts a settled result over the scoreboard', () => {
		const view = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: {
					...classicPick,
					results: ['loss'],
					fixture: liveFixture({ status: 'finished', homeScore: 3, awayScore: 0 }),
				},
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'live', survival: 'out' })
	})

	it('says nothing about a pick whose match has not kicked off', () => {
		const view = buildGameView(
			baseInput({
				round: ACTIVE_ROUND,
				pick: {
					...classicPick,
					fixture: liveFixture({ status: 'scheduled', homeScore: null, awayScore: null }),
				},
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'live', survival: 'unknown' })
	})

	it('calls a missed classic deadline out, with an empty entry', () => {
		const view = buildGameView(baseInput({ round: ACTIVE_ROUND, pick: null }))
		expect(view.hero).toMatchObject({
			kind: 'live',
			survival: 'out',
			entry: { type: 'none' },
		})
	})

	it('breaks a ranked slate into correct, wrong and still-to-play', () => {
		const view = buildGameView(
			baseInput({
				gameMode: 'turbo',
				picksRequired: 5,
				round: ACTIVE_ROUND,
				pick: {
					picksMade: 5,
					isAuto: false,
					team: null,
					results: ['win', 'win', 'loss', 'pending', 'void'],
				},
			}),
		)
		expect(view.hero).toMatchObject({
			kind: 'live',
			mode: 'turbo',
			// Turbo has no mid-round elimination — the standings tell that story.
			survival: 'unknown',
			entry: {
				type: 'ranked',
				picksMade: 5,
				picksRequired: 5,
				correct: 2,
				wrong: 1,
				pending: 1,
				livesRemaining: null,
			},
		})
	})

	it('carries cup lives and flags the last-life player as at risk', () => {
		const safe = buildGameView(
			baseInput({
				gameMode: 'cup',
				picksRequired: 6,
				livesRemaining: 2,
				round: ACTIVE_ROUND,
				pick: { picksMade: 6, isAuto: false, team: null, results: ['win', 'saved_by_life'] },
			}),
		)
		const spent = buildGameView(
			baseInput({
				gameMode: 'cup',
				picksRequired: 6,
				livesRemaining: 0,
				round: ACTIVE_ROUND,
				pick: { picksMade: 6, isAuto: false, team: null, results: ['loss'] },
			}),
		)
		expect(safe.hero).toMatchObject({
			kind: 'live',
			survival: 'surviving',
			entry: { correct: 2, livesRemaining: 2 },
		})
		expect(spent.hero).toMatchObject({ kind: 'live', survival: 'at-risk' })
	})
})

describe('buildGameView — round result', () => {
	it('reports survival and the next round for classic', () => {
		const view = buildGameView(
			baseInput({
				round: COMPLETED_ROUND,
				pick: { ...classicPick, results: ['win'] },
				nextRound: {
					number: 8,
					label: 'GW8',
					longLabel: 'Gameweek 8',
					deadline: FUTURE_DEADLINE,
				},
			}),
		)
		expect(view.hero).toMatchObject({
			kind: 'round-result',
			mode: 'classic',
			result: 'survived',
			nextRound: { number: 8, label: 'GW8', deadlineIso: FUTURE_DEADLINE.toISOString() },
		})
	})

	it('reports elimination on the round the player went out in', () => {
		const view = buildGameView(
			baseInput({
				round: COMPLETED_ROUND,
				isAlive: false,
				eliminatedRoundLabel: 'GW7',
				pick: { ...classicPick, results: ['loss'] },
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'round-result', result: 'eliminated' })
	})

	it('has no survival verdict for the single-round modes', () => {
		for (const mode of ['turbo', 'cup'] as const) {
			const view = buildGameView(
				baseInput({
					gameMode: mode,
					picksRequired: 6,
					round: COMPLETED_ROUND,
					pick: { picksMade: 6, isAuto: false, team: null, results: ['win', 'win', 'loss'] },
				}),
			)
			expect(view.hero).toMatchObject({
				kind: 'round-result',
				mode,
				result: 'played',
				entry: { type: 'ranked', correct: 2, wrong: 1 },
			})
		}
	})

	it('never points a single-round mode at a next round', () => {
		// Turbo and cup play one gameweek and stop — an N+1 round exists in the
		// competition, but the game never advances to it.
		for (const mode of ['turbo', 'cup'] as const) {
			const view = buildGameView(
				baseInput({
					gameMode: mode,
					picksRequired: 6,
					round: COMPLETED_ROUND,
					pick: { picksMade: 6, isAuto: false, team: null, results: ['win'] },
					nextRound: {
						number: 8,
						label: 'GW8',
						longLabel: 'Gameweek 8',
						deadline: FUTURE_DEADLINE,
					},
				}),
			)
			expect(view.hero).toMatchObject({ kind: 'round-result', nextRound: null })
		}
	})

	it('leaves the next round null when there is nothing after this one', () => {
		const view = buildGameView(baseInput({ round: COMPLETED_ROUND, pick: classicPick }))
		expect(view.hero).toMatchObject({ kind: 'round-result', nextRound: null })
	})

	it('reports the result for a round the game has already moved past', () => {
		const view = buildGameView(
			baseInput({ game: { currentRoundId: 'round-9', currentRoundNumber: 9 } }),
		)
		expect(view.hero).toMatchObject({ kind: 'round-result', result: 'survived' })
	})
})

describe('buildGameView — winner', () => {
	for (const mode of ['classic', 'turbo', 'cup'] as const) {
		it(`leads a completed ${mode} game with its outcome`, () => {
			const view = buildGameView(
				baseInput({
					gameMode: mode,
					gameStatus: 'completed',
					winner: WINNER,
					viewerUserId: 'user-1',
				}),
			)
			expect(view.hero).toMatchObject({
				kind: 'winner',
				mode,
				viewerOutcome: 'won',
				viewerPotShare: '80.00',
				runnerUpName: 'Dave',
				winners: [{ name: 'Sean', potShare: '80.00' }],
			})
		})

		// The shape every game that has really finished arrives in:
		// `applyAutoCompletion` nulls out `game.currentRoundId` when it crowns a
		// winner, so `page.tsx` has no round to hand the deriver. The outcome must
		// still lead the page — this is the only place the winner is shown now that
		// the standalone banner is gone.
		it(`leads a completed ${mode} game with no current round`, () => {
			const view = buildGameView(
				baseInput({
					gameMode: mode,
					gameStatus: 'completed',
					round: null,
					game: { currentRoundId: null, currentRoundNumber: null },
					winner: WINNER,
					viewerUserId: 'user-1',
				}),
			)
			expect(view.hero).toMatchObject({ kind: 'winner', mode, round: null, viewerOutcome: 'won' })
			// The hero owns the header's pot block even without a round to name.
			expect(view.demote).toEqual({ headerRoundStrip: true, headerStats: true })
		})
	}

	it('reads as a shared win when the pot splits', () => {
		const view = buildGameView(
			baseInput({
				gameStatus: 'completed',
				viewerUserId: 'user-2',
				winner: {
					winners: [
						{ userId: 'user-1', name: 'Sean', potShare: '40.00', stats: [] },
						{ userId: 'user-2', name: 'Dave', potShare: '40.00', stats: [] },
					],
				},
			}),
		)
		expect(view.hero).toMatchObject({ kind: 'winner', viewerOutcome: 'shared', runnerUpName: null })
	})

	// `calculatePayouts` gives the rounding remainder to the earliest winners, so
	// an odd pot splits unevenly. The hero must quote the viewer their own cut.
	it('quotes the viewer their own share of an unevenly split pot', () => {
		const view = buildGameView(
			baseInput({
				gameStatus: 'completed',
				viewerUserId: 'user-2',
				winner: {
					winners: [
						{ userId: 'user-1', name: 'Sean', potShare: '16.67', stats: [] },
						{ userId: 'user-2', name: 'Dave', potShare: '16.66', stats: [] },
						{ userId: 'user-3', name: 'Rich', potShare: '16.66', stats: [] },
					],
				},
			}),
		)
		expect(view.hero).toMatchObject({ viewerOutcome: 'shared', viewerPotShare: '16.66' })
	})

	it('reads as a loss for everyone else', () => {
		const view = buildGameView(
			baseInput({ gameStatus: 'completed', winner: WINNER, viewerUserId: 'user-9' }),
		)
		expect(view.hero).toMatchObject({ kind: 'winner', viewerOutcome: 'lost', viewerPotShare: null })
	})

	it('falls back to no hero on a completed game with no winner recorded', () => {
		const view = buildGameView(baseInput({ gameStatus: 'completed', pick: classicPick }))
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'game-completed' })
	})

	it('has no hero on a completed game with neither a winner nor a round', () => {
		const view = buildGameView(
			baseInput({
				gameStatus: 'completed',
				round: null,
				game: { currentRoundId: null, currentRoundNumber: null },
			}),
		)
		expect(view.hero).toEqual({
			kind: 'none',
			mode: 'classic',
			round: null,
			reason: 'game-completed',
		})
	})
})

describe('buildGameView — eliminated classic players', () => {
	const rebuy = { entryFee: '10.00', closesAt: FUTURE_DEADLINE, pendingPayment: null }

	it('puts the rebuy call to action in the hero slot', () => {
		const view = buildGameView(
			baseInput({ isAlive: false, rebuyAvailable: true, rebuy, eliminatedRoundLabel: 'GW1' }),
		)
		expect(view.hero).toMatchObject({
			kind: 'rebuy',
			entryFee: '10.00',
			closesAtIso: FUTURE_DEADLINE.toISOString(),
			pendingPayment: null,
			eliminatedRoundLabel: 'GW1',
		})
	})

	it('carries a started rebuy that is waiting on payment', () => {
		const view = buildGameView(
			baseInput({
				isAlive: false,
				rebuyAvailable: true,
				rebuy: { ...rebuy, pendingPayment: { id: 'pay-1', amount: '10.00' } },
			}),
		)
		expect(view.hero).toMatchObject({
			kind: 'rebuy',
			pendingPayment: { id: 'pay-1', amount: '10.00' },
		})
	})

	it('goes quiet with no rebuy on offer — allowRebuys off, or the window closed', () => {
		const view = buildGameView(
			baseInput({ isAlive: false, rebuy: null, eliminatedRoundLabel: 'GW34' }),
		)
		expect(view.hero).toMatchObject({
			kind: 'spectator',
			mode: 'classic',
			eliminatedRoundLabel: 'GW34',
		})
	})

	it('keeps spectating through a live round', () => {
		const view = buildGameView(
			baseInput({ isAlive: false, round: ACTIVE_ROUND, eliminatedRoundLabel: 'GW6' }),
		)
		expect(view.hero).toMatchObject({ kind: 'spectator' })
	})

	it('still shows the rebuy offer while the round it missed is in play', () => {
		const view = buildGameView(
			baseInput({ isAlive: false, round: ACTIVE_ROUND, rebuyAvailable: true, rebuy }),
		)
		expect(view.hero).toMatchObject({ kind: 'rebuy' })
	})

	it('keeps the pick hero for an admin acting as an eliminated player', () => {
		// Acting-as passes isAlive=true so the admin can rebuy-via-pick.
		const view = buildGameView(baseInput({ actingAsName: 'Dave', rebuyAvailable: true, rebuy }))
		expect(view.hero).toMatchObject({ kind: 'pick-open', actingAsName: 'Dave' })
	})
})

describe('buildGameView — no hero', () => {
	it('has no hero without a current round', () => {
		const view = buildGameView(
			baseInput({ round: null, game: { currentRoundId: null, currentRoundNumber: null } }),
		)
		expect(view.hero).toEqual({ kind: 'none', mode: 'classic', round: null, reason: 'no-round' })
	})

	it('has no hero for a round the game has not reached yet', () => {
		const view = buildGameView(
			baseInput({ game: { currentRoundId: 'round-5', currentRoundNumber: 5 } }),
		)
		expect(view.hero).toMatchObject({ kind: 'none', reason: 'round-locked' })
		expect(view.demote).toEqual({ headerRoundStrip: false, headerStats: false })
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
		// One millisecond later the deadline owns the page: pick-focus → spectate-focus.
		expect(exactlyOn.hero.kind).toBe('live')
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
				// Post-deadline: live, round result and the completed-game outcome.
				baseInput({
					gameMode: mode,
					picksRequired,
					round: ACTIVE_ROUND,
					livesRemaining: 1,
					pick: { ...complete, fixture: liveFixture(), results: ['pending'] },
				}),
				baseInput({
					gameMode: mode,
					picksRequired,
					round: COMPLETED_ROUND,
					pick: { ...complete, results: ['win'] },
					nextRound: {
						number: 8,
						label: 'GW8',
						longLabel: 'Gameweek 8',
						deadline: FUTURE_DEADLINE,
					},
				}),
				baseInput({
					gameMode: mode,
					gameStatus: 'completed',
					winner: WINNER,
					viewerUserId: 'user-1',
				}),
				// The real completed-game shape: no current round left to name.
				baseInput({
					gameMode: mode,
					gameStatus: 'completed',
					round: null,
					game: { currentRoundId: null, currentRoundNumber: null },
					winner: WINNER,
					viewerUserId: 'user-1',
				}),
			]),
			baseInput({ round: null, game: { currentRoundId: null, currentRoundNumber: null } }),
			baseInput({ gameStatus: 'completed' }),
			baseInput({ isAlive: false }),
			baseInput({ isAlive: false, eliminatedRoundLabel: 'GW3' }),
			baseInput({
				isAlive: false,
				rebuyAvailable: true,
				rebuy: {
					entryFee: '10.00',
					closesAt: FUTURE_DEADLINE,
					pendingPayment: { id: 'pay-1', amount: '10.00' },
				},
			}),
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
