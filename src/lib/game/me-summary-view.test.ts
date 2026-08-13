import { describe, expect, it } from 'vitest'
import {
	type BuildMeSummaryInput,
	buildMeSummaryView,
	type MeSummaryView,
	type SummaryGameMode,
	type SummaryGameRow,
	type SummaryPickResult,
	type SummaryPickRow,
	type SummaryStreakPickRow,
} from '@/lib/game/me-summary-view'

function input(overrides: Partial<BuildMeSummaryInput> = {}): BuildMeSummaryInput {
	return { games: [], picks: [], filters: { season: null }, ...overrides }
}

function game(overrides: Partial<SummaryGameRow> = {}): SummaryGameRow {
	return {
		gameId: 'game-1',
		gameMode: 'classic',
		gamePlayerId: 'me',
		gameStatus: 'completed',
		competitionId: 'comp-pl',
		competitionName: 'Premier League 2025/26',
		season: '2025/26',
		playerStatus: 'eliminated',
		allowRebuys: false,
		...overrides,
	}
}

function pick(result: SummaryPickResult, overrides: Partial<SummaryPickRow> = {}): SummaryPickRow {
	return {
		gameId: 'game-1',
		roundId: 'round-1',
		roundNumber: 1,
		teamId: 'team-ars',
		teamName: 'Arsenal',
		teamShortName: 'ARS',
		teamBadgeUrl: null,
		result,
		isAuto: false,
		...overrides,
	}
}

/**
 * One player's picks in a single-round game, listed in confidence-rank order:
 * `ranks('t1', 'me', ['loss', 'win'])` is rank 1 lost, rank 2 won.
 */
function ranks(
	gameId: string,
	gamePlayerId: string,
	results: SummaryPickResult[],
	playerStatus: SummaryStreakPickRow['playerStatus'] = 'alive',
): SummaryStreakPickRow[] {
	return results.map((result, index) => ({
		gameId,
		gamePlayerId,
		confidenceRank: index + 1,
		result,
		playerStatus,
	}))
}

/** Narrows away the empty variant so a test can read the headline. */
function summary(view: MeSummaryView) {
	if (view.kind !== 'summary') throw new Error(`expected a populated summary, got ${view.kind}`)
	return view
}

/** The section for one mode, narrowed to the variant with games behind it. */
function played(view: MeSummaryView, mode: SummaryGameMode) {
	const section = summary(view).modes.find((m) => m.mode === mode)
	if (!section) throw new Error(`no ${mode} section`)
	if (section.kind !== 'played') throw new Error(`expected ${mode} to have been played`)
	return section
}

/** The classic section, narrowed so its rounds-survived figures are readable. */
function depthOf(view: MeSummaryView) {
	const section = played(view, 'classic')
	if (section.mode !== 'classic') throw new Error('unreachable')
	return section.depth
}

/** The classic section, narrowed to its round-one block. */
function roundOneOf(view: MeSummaryView) {
	const section = played(view, 'classic')
	if (section.mode !== 'classic') throw new Error('unreachable')
	return section.roundOne
}

/** The same, narrowed to a single-round mode so its streak is readable. */
function streakOf(view: MeSummaryView, mode: 'turbo' | 'cup') {
	const section = played(view, mode)
	if (section.mode === 'classic') throw new Error('unreachable')
	return section.streak
}

describe('buildMeSummaryView', () => {
	it('reports nothing to show for a player who has never entered a game', () => {
		const view = buildMeSummaryView(input())

		expect(view.kind).toBe('empty')
	})

	it('counts games played, games won and the win rate across them', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'g1', playerStatus: 'winner' }),
						game({ gameId: 'g2', playerStatus: 'eliminated' }),
						game({ gameId: 'g3', playerStatus: 'eliminated' }),
						game({ gameId: 'g4', playerStatus: 'alive' }),
					],
				}),
			),
		)

		expect(view.headline.gamesPlayed).toBe(4)
		expect(view.headline.gamesWon).toBe(1)
		expect(view.headline.winRate).toBe(0.25)
	})

	it('scores pick accuracy as wins over every settled pick', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game()],
					picks: [pick('win'), pick('win'), pick('win'), pick('loss')],
				}),
			),
		)

		expect(view.headline.pickAccuracy).toMatchObject({
			successful: 3,
			settled: 4,
			rate: 0.75,
		})
	})

	it('counts a draw as a success in cup and a failure everywhere else', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'cup-game', gameMode: 'cup' }),
						game({ gameId: 'classic-game', gameMode: 'classic' }),
						game({ gameId: 'turbo-game', gameMode: 'turbo' }),
					],
					picks: [
						pick('draw', { gameId: 'cup-game' }),
						pick('draw', { gameId: 'classic-game' }),
						pick('draw', { gameId: 'turbo-game' }),
					],
				}),
			),
		)

		expect(view.headline.pickAccuracy).toMatchObject({
			successful: 1,
			settled: 3,
		})
	})

	it('keeps picks saved by a life out of accuracy and counts them separately', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameId: 'cup-game', gameMode: 'cup' })],
					picks: [
						pick('win', { gameId: 'cup-game' }),
						pick('loss', { gameId: 'cup-game' }),
						pick('saved_by_life', { gameId: 'cup-game' }),
						pick('saved_by_life', { gameId: 'cup-game' }),
					],
				}),
			),
		)

		expect(view.headline.pickAccuracy).toEqual({
			successful: 1,
			settled: 2,
			rate: 0.5,
			savedByLife: 2,
		})
	})

	it('leaves pending and void picks out of every count', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game()],
					picks: [pick('win'), pick('pending'), pick('void'), pick('void')],
				}),
			),
		)

		expect(view.headline.pickAccuracy).toEqual({
			successful: 1,
			settled: 1,
			rate: 1,
			savedByLife: 0,
		})
	})

	it('counts a no-pick fallback pick exactly as if the player had made it', () => {
		const games = [game()]
		const byHand = buildMeSummaryView(input({ games, picks: [pick('win'), pick('loss')] }))
		const byFallback = buildMeSummaryView(
			input({
				games,
				picks: [pick('win', { isAuto: true }), pick('loss', { isAuto: true })],
			}),
		)

		expect(byFallback).toEqual(byHand)
	})

	it('names the most-picked team, counting every pick that resolved into something', () => {
		const arsenal = { teamId: 'team-ars', teamName: 'Arsenal', teamShortName: 'ARS' }
		const everton = {
			teamId: 'team-eve',
			teamName: 'Everton',
			teamShortName: 'EVE',
			teamBadgeUrl: 'https://example.test/eve.png',
		}
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [
						pick('win', arsenal),
						pick('pending', arsenal),
						pick('void', arsenal),
						pick('win', everton),
						pick('saved_by_life', everton),
					],
				}),
			),
		)

		expect(view.headline.mostPickedTeam).toEqual({
			teamId: 'team-eve',
			name: 'Everton',
			shortName: 'EVE',
			badgeUrl: 'https://example.test/eve.png',
			picks: 2,
		})
	})

	it('breaks a most-picked tie on club name, not on row order', () => {
		const picks = [
			pick('win', { teamId: 'team-eve', teamName: 'Everton', teamShortName: 'EVE' }),
			pick('loss', { teamId: 'team-ars', teamName: 'Arsenal', teamShortName: 'ARS' }),
		]
		const view = summary(buildMeSummaryView(input({ games: [game()], picks })))
		const reversed = summary(
			buildMeSummaryView(input({ games: [game()], picks: [...picks].reverse() })),
		)

		expect(view.headline.mostPickedTeam?.name).toBe('Arsenal')
		expect(reversed.headline.mostPickedTeam?.name).toBe('Arsenal')
	})

	it('has no most-picked team and no rates while every pick is still pending', () => {
		const view = summary(
			buildMeSummaryView(
				input({ games: [game({ playerStatus: 'alive' })], picks: [pick('pending')] }),
			),
		)

		expect(view.headline.mostPickedTeam).toBeNull()
		expect(view.headline.pickAccuracy.rate).toBeNull()
		expect(view.headline.winRate).toBe(0)
	})

	it('scopes the headline to one season when the filter names one', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					filters: { season: '2025/26' },
					games: [
						game({ gameId: 'this-season', season: '2025/26', playerStatus: 'winner' }),
						game({ gameId: 'last-season', season: '2024/25', playerStatus: 'winner' }),
					],
					picks: [
						pick('win', { gameId: 'this-season' }),
						pick('loss', { gameId: 'last-season' }),
						pick('loss', { gameId: 'last-season' }),
					],
				}),
			),
		)

		expect(view.headline.gamesPlayed).toBe(1)
		expect(view.headline.gamesWon).toBe(1)
		expect(view.headline.pickAccuracy).toMatchObject({ successful: 1, settled: 1 })
	})

	it('splits played, won and the win rate out by mode', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gameMode: 'classic', playerStatus: 'winner' }),
					game({ gameId: 'c2', gameMode: 'classic', playerStatus: 'eliminated' }),
					game({ gameId: 'c3', gameMode: 'classic', playerStatus: 'eliminated' }),
					game({ gameId: 't1', gameMode: 'turbo', playerStatus: 'winner' }),
					game({ gameId: 'k1', gameMode: 'cup', playerStatus: 'eliminated' }),
					game({ gameId: 'k2', gameMode: 'cup', playerStatus: 'winner' }),
				],
			}),
		)

		expect(played(view, 'classic')).toMatchObject({ gamesPlayed: 3, gamesWon: 1, winRate: 1 / 3 })
		expect(played(view, 'turbo')).toMatchObject({ gamesPlayed: 1, gamesWon: 1, winRate: 1 })
		expect(played(view, 'cup')).toMatchObject({ gamesPlayed: 2, gamesWon: 1, winRate: 0.5 })
	})

	it('breaks each mode down by competition, deepest record first', () => {
		const pl = { competitionId: 'comp-pl', competitionName: 'Premier League 2025/26' }
		const wc = { competitionId: 'comp-wc', competitionName: 'World Cup 2026' }
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gameMode: 'classic', playerStatus: 'winner', ...pl }),
					game({ gameId: 'c2', gameMode: 'classic', playerStatus: 'eliminated', ...pl }),
					game({ gameId: 'c3', gameMode: 'classic', playerStatus: 'eliminated', ...wc }),
					game({ gameId: 't1', gameMode: 'turbo', playerStatus: 'eliminated', ...pl }),
				],
			}),
		)

		expect(played(view, 'classic').competitions).toEqual([
			{
				competitionId: 'comp-pl',
				name: 'Premier League 2025/26',
				gamesPlayed: 2,
				gamesWon: 1,
				winRate: 0.5,
			},
			{ competitionId: 'comp-wc', name: 'World Cup 2026', gamesPlayed: 1, gamesWon: 0, winRate: 0 },
		])
		expect(played(view, 'turbo').competitions).toHaveLength(1)
	})

	it('gives every mode a section, and says so where the player has no history', () => {
		const view = summary(
			buildMeSummaryView(input({ games: [game({ gameMode: 'classic' })], picks: [pick('win')] })),
		)

		expect(view.modes.map((m) => m.mode)).toEqual(['classic', 'turbo', 'cup'])
		expect(view.modes.filter((m) => m.kind === 'unplayed').map((m) => m.mode)).toEqual([
			'turbo',
			'cup',
		])
	})

	it('counts a turbo streak from the rank the game restarted at, not from rank 1', () => {
		// Rank 1 was a universal loss, so the game itself restarted at rank 2 —
		// the player's streak is the two ranks they then got right (2 and 3).
		const view = buildMeSummaryView(
			input({
				games: [game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' })],
				streakPicks: [
					...ranks('t1', 'me-t1', ['loss', 'win', 'win', 'loss']),
					...ranks('t1', 'rival', ['loss', 'win', 'loss', 'win']),
				],
			}),
		)

		expect(streakOf(view, 'turbo')).toEqual({ longest: 2, average: 2, games: 1 })
	})

	it('averages a turbo streak over every completed game', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' }),
					game({ gameId: 't2', gameMode: 'turbo', gamePlayerId: 'me-t2' }),
				],
				streakPicks: [
					...ranks('t1', 'me-t1', ['win', 'loss', 'win']),
					...ranks('t2', 'me-t2', ['win', 'win', 'win', 'loss']),
				],
			}),
		)

		expect(streakOf(view, 'turbo')).toEqual({ longest: 3, average: 2, games: 2 })
	})

	it('leaves a game still being played out of the streak figures', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' }),
					game({
						gameId: 't2',
						gameMode: 'turbo',
						gamePlayerId: 'me-t2',
						gameStatus: 'active',
						playerStatus: 'alive',
					}),
				],
				streakPicks: [
					...ranks('t1', 'me-t1', ['win', 'win', 'loss']),
					...ranks('t2', 'me-t2', ['win', 'win', 'win', 'win']),
				],
			}),
		)

		expect(played(view, 'turbo').gamesPlayed).toBe(2)
		expect(streakOf(view, 'turbo')).toEqual({ longest: 2, average: 2, games: 1 })
	})

	it('has no streak yet where every single-round game is still in play', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({
						gameId: 't1',
						gameMode: 'turbo',
						gamePlayerId: 'me-t1',
						gameStatus: 'active',
						playerStatus: 'alive',
					}),
				],
				streakPicks: ranks('t1', 'me-t1', ['win', 'pending']),
			}),
		)

		expect(streakOf(view, 'turbo')).toEqual({ longest: null, average: null, games: 0 })
	})

	it('counts a total wipeout as a streak of nothing rather than leaving the game out', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' }),
					game({ gameId: 't2', gameMode: 'turbo', gamePlayerId: 'me-t2' }),
				],
				streakPicks: [
					// Nobody in t1 got a single pick right — the game refunded.
					...ranks('t1', 'me-t1', ['loss', 'loss']),
					...ranks('t1', 'rival', ['loss', 'loss']),
					...ranks('t2', 'me-t2', ['win', 'win', 'win', 'loss']),
				],
			}),
		)

		expect(streakOf(view, 'turbo')).toEqual({ longest: 3, average: 1.5, games: 2 })
	})

	it('keeps a cup streak alive through a handicapped draw and a pick a life absorbed', () => {
		const results: SummaryPickResult[] = ['win', 'draw', 'saved_by_life', 'loss']
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'k1', gameMode: 'cup', gamePlayerId: 'me-k1' }),
					game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' }),
				],
				streakPicks: [...ranks('k1', 'me-k1', results), ...ranks('t1', 'me-t1', results)],
			}),
		)

		expect(streakOf(view, 'cup').longest).toBe(3)
		// Turbo has neither handicap nor lives: the prediction either came in or it didn't.
		expect(streakOf(view, 'turbo').longest).toBe(1)
	})

	it('measures classic depth in rounds the player held a pick in', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gamePlayerId: 'me-c1' }),
					game({ gameId: 'c2', gamePlayerId: 'me-c2' }),
				],
				picks: [
					pick('win', { gameId: 'c1', roundId: 'c1-r1' }),
					pick('loss', { gameId: 'c1', roundId: 'c1-r2' }),
					pick('win', { gameId: 'c2', roundId: 'c2-r1' }),
					pick('win', { gameId: 'c2', roundId: 'c2-r2' }),
					pick('win', { gameId: 'c2', roundId: 'c2-r3' }),
					pick('loss', { gameId: 'c2', roundId: 'c2-r4' }),
				],
			}),
		)

		expect(depthOf(view)).toEqual({ best: 4, average: 3, games: 2 })
	})

	it('counts every round a rebought player held a pick in, not the rounds before their first loss', () => {
		const view = buildMeSummaryView(
			input({
				games: [game({ gameId: 'c1', gamePlayerId: 'me-c1' })],
				picks: [
					// Out in round 1, bought back in, then went three more rounds. The
					// elimination round a rebuy clears would say one round; the rounds
					// they actually held a pick in say four.
					pick('loss', { gameId: 'c1', roundId: 'c1-r1' }),
					pick('win', { gameId: 'c1', roundId: 'c1-r2' }),
					pick('win', { gameId: 'c1', roundId: 'c1-r3' }),
					pick('loss', { gameId: 'c1', roundId: 'c1-r4' }),
				],
			}),
		)

		expect(depthOf(view)).toMatchObject({ best: 4, average: 4 })
	})

	it('scores round-one survival over every classic game played', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gamePlayerId: 'me-c1' }),
					game({ gameId: 'c2', gamePlayerId: 'me-c2' }),
					game({ gameId: 'c3', gamePlayerId: 'me-c3' }),
					game({ gameId: 'c4', gamePlayerId: 'me-c4' }),
				],
				picks: [
					pick('win', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					// Round 2 says nothing about the first hurdle.
					pick('loss', { gameId: 'c1', roundId: 'c1-r2', roundNumber: 2 }),
					pick('win', { gameId: 'c2', roundId: 'c2-r1', roundNumber: 1 }),
					pick('loss', { gameId: 'c3', roundId: 'c3-r1', roundNumber: 1 }),
					// Classic has no handicap: a draw is a failed pick like any other.
					pick('draw', { gameId: 'c4', roundId: 'c4-r1', roundNumber: 1 }),
				],
			}),
		)

		expect(roundOneOf(view)).toMatchObject({ games: 4, survived: 2, survivalRate: 0.5 })
	})

	it('leaves a round one that has not settled out of the survival rate', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gamePlayerId: 'me-c1' }),
					game({
						gameId: 'c2',
						gamePlayerId: 'me-c2',
						gameStatus: 'active',
						playerStatus: 'alive',
					}),
				],
				picks: [
					pick('win', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					// Still waiting on kick-off — it can't be held against the player
					// any more than a pending pick counts in the accuracy rate.
					pick('pending', { gameId: 'c2', roundId: 'c2-r1', roundNumber: 1 }),
				],
			}),
		)

		expect(roundOneOf(view)).toMatchObject({ games: 2, settled: 1, survived: 1, survivalRate: 1 })
	})

	it('has no round-one record for a game that started after gameweek one', () => {
		const view = buildMeSummaryView(
			input({
				games: [game({ gameId: 'c1', gamePlayerId: 'me-c1', playerStatus: 'winner' })],
				picks: [
					// Created mid-season, so the game started at the competition's
					// earliest still-pickable round and has no round one to survive.
					pick('win', { gameId: 'c1', roundId: 'c1-r12', roundNumber: 12 }),
					pick('win', { gameId: 'c1', roundId: 'c1-r13', roundNumber: 13 }),
				],
			}),
		)

		expect(roundOneOf(view)).toEqual({
			games: 1,
			settled: 0,
			survived: 0,
			survivalRate: null,
			exits: 0,
			rebuyable: 0,
			rebought: 0,
		})
	})

	it('counts a round-one exit for each opening pick that failed, and none for one still pending', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gamePlayerId: 'me-c1' }),
					game({ gameId: 'c2', gamePlayerId: 'me-c2' }),
					game({
						gameId: 'c3',
						gamePlayerId: 'me-c3',
						gameStatus: 'active',
						playerStatus: 'alive',
					}),
					game({ gameId: 'c4', gamePlayerId: 'me-c4' }),
				],
				picks: [
					pick('loss', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					pick('draw', { gameId: 'c2', roundId: 'c2-r1', roundNumber: 1 }),
					// Round one hasn't kicked off in c3, and c4's was voided by a
					// cancelled fixture — neither is a hurdle the player has failed.
					pick('pending', { gameId: 'c3', roundId: 'c3-r1', roundNumber: 1 }),
					pick('void', { gameId: 'c4', roundId: 'c4-r1', roundNumber: 1 }),
				],
			}),
		)

		expect(roundOneOf(view)).toMatchObject({ games: 4, survived: 0, exits: 2 })
	})

	it('counts a game bought back into as a round-one failure the player played on from', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					// The rebuy cleared this game's elimination round and reason, so the
					// player row says nothing: they read as alive and never eliminated.
					// Only the picks remember round one going down.
					game({
						gameId: 'c1',
						gamePlayerId: 'me-c1',
						playerStatus: 'alive',
						allowRebuys: true,
					}),
					// Out in round one of a game that offered a rebuy, and didn't take it.
					game({ gameId: 'c2', gamePlayerId: 'me-c2', allowRebuys: true }),
				],
				picks: [
					pick('loss', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					pick('win', { gameId: 'c1', roundId: 'c1-r2', roundNumber: 2 }),
					pick('win', { gameId: 'c1', roundId: 'c1-r3', roundNumber: 3 }),
					pick('loss', { gameId: 'c2', roundId: 'c2-r1', roundNumber: 1 }),
				],
			}),
		)

		expect(roundOneOf(view)).toMatchObject({ exits: 2, rebuyable: 2, rebought: 1 })
	})

	it('holds no rebuy against a game that had rebuys switched off', () => {
		const view = buildMeSummaryView(
			input({
				games: [game({ gameId: 'c1', gamePlayerId: 'me-c1', allowRebuys: false })],
				picks: [
					// No rebuys means round one can't eliminate — the starting-round
					// exemption carried the player on. Playing round two was never a
					// rebuy, so the game is out of the denominator as well as the count.
					pick('loss', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					pick('win', { gameId: 'c1', roundId: 'c1-r2', roundNumber: 2 }),
					pick('loss', { gameId: 'c1', roundId: 'c1-r3', roundNumber: 3 }),
				],
			}),
		)

		expect(roundOneOf(view)).toMatchObject({ exits: 1, rebuyable: 0, rebought: 0 })
	})

	it('has nothing to report at the first hurdle for a player who has never gone out in it', () => {
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 'c1', gamePlayerId: 'me-c1', allowRebuys: true }),
					game({ gameId: 'c2', gamePlayerId: 'me-c2', allowRebuys: true }),
				],
				picks: [
					pick('win', { gameId: 'c1', roundId: 'c1-r1', roundNumber: 1 }),
					pick('loss', { gameId: 'c1', roundId: 'c1-r2', roundNumber: 2 }),
					pick('win', { gameId: 'c2', roundId: 'c2-r1', roundNumber: 1 }),
				],
			}),
		)

		expect(roundOneOf(view)).toEqual({
			games: 2,
			settled: 2,
			survived: 2,
			survivalRate: 1,
			exits: 0,
			rebuyable: 0,
			rebought: 0,
		})
	})

	it('resolves a turbo streak over the players still standing, and a cup streak over everyone', () => {
		// Rank 1 was right for one player only — a player turbo's engine never saw,
		// because they were out of the game by the time it ran. Turbo restarts at
		// rank 2 without them; cup counts every player it ever had, so it starts at
		// rank 1 and the same rank-1 loss ends the streak before it begins.
		const rows = (gameId: string, own: string) => [
			...ranks(gameId, own, ['loss', 'win', 'win']),
			...ranks(gameId, 'removed-rival', ['win', 'loss', 'loss'], 'eliminated'),
			...ranks(gameId, 'rival', ['loss', 'win', 'loss']),
		]
		const view = buildMeSummaryView(
			input({
				games: [
					game({ gameId: 't1', gameMode: 'turbo', gamePlayerId: 'me-t1' }),
					game({ gameId: 'k1', gameMode: 'cup', gamePlayerId: 'me-k1' }),
				],
				streakPicks: [...rows('t1', 'me-t1'), ...rows('k1', 'me-k1')],
			}),
		)

		expect(streakOf(view, 'turbo').longest).toBe(2)
		expect(streakOf(view, 'cup').longest).toBe(0)
	})

	it('has nothing to show for a season the player did not play', () => {
		const view = buildMeSummaryView(
			input({
				filters: { season: '2024/25' },
				games: [game({ season: '2025/26' })],
				picks: [pick('win')],
			}),
		)

		expect(view.kind).toBe('empty')
	})
})
