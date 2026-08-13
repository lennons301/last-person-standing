import { describe, expect, it } from 'vitest'
import { PREMIER_LEAGUE_FAMILY_KEY, WORLD_CUP_FAMILY_KEY } from '@/lib/game/competition-family'
import {
	type BuildMeSummaryInput,
	buildMeSummaryView,
	type MeSummaryView,
	parseTeamSeasonFilters,
	type SummaryGameMode,
	type SummaryGameRow,
	type SummaryPaymentRow,
	type SummaryPayoutRow,
	type SummaryPickResult,
	type SummaryPickRow,
	type SummaryStreakPickRow,
	teamSeasonQuery,
} from '@/lib/game/me-summary-view'

function input(overrides: Partial<BuildMeSummaryInput> = {}): BuildMeSummaryInput {
	return { games: [], picks: [], filters: { season: null }, ...overrides }
}

function game(overrides: Partial<SummaryGameRow> = {}): SummaryGameRow {
	return {
		gameId: 'game-1',
		gameName: 'Sunday League',
		gameMode: 'classic',
		gamePlayerId: 'me',
		gameStatus: 'completed',
		competitionId: 'comp-pl-2526',
		competitionName: 'Premier League 2025/26',
		season: '2025/26',
		playerStatus: 'eliminated',
		competitionFamilyKey: PREMIER_LEAGUE_FAMILY_KEY,
		...overrides,
	}
}

function pick(result: SummaryPickResult, overrides: Partial<SummaryPickRow> = {}): SummaryPickRow {
	return {
		gameId: 'game-1',
		roundId: 'round-1',
		teamId: 'team-ars',
		teamName: 'Arsenal',
		teamShortName: 'ARS',
		teamBadgeUrl: null,
		result,
		isAuto: false,
		...overrides,
	}
}

/** One payment row of the player's — an entry, or a rebuy's. */
function stake(
	gameId: string,
	amount: string,
	status: SummaryPaymentRow['status'] = 'paid',
): SummaryPaymentRow {
	return { gameId, amount, status }
}

/**
 * One payout row of the player's — what a game paid them. `pending` is the
 * status every real payout carries, since nothing ever advances one.
 */
function won(
	gameId: string,
	amount: string,
	status: SummaryPayoutRow['status'] = 'pending',
): SummaryPayoutRow {
	return { gameId, amount, status }
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

/** A club, in the fields a pick row carries it in. */
function team(shortName: string, name: string): Partial<SummaryPickRow> {
	return { teamId: `team-${shortName.toLowerCase()}`, teamName: name, teamShortName: shortName }
}

describe('buildMeSummaryView team records', () => {
	it('pools every season of one competition family into a single block', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'this-season', competitionId: 'pl-2526', season: '2025/26' }),
						game({
							gameId: 'last-season',
							competitionId: 'pl-2425',
							season: '2024/25',
							competitionName: 'Premier League 2024/25',
						}),
					],
					picks: [
						pick('win', { gameId: 'this-season', ...team('ARS', 'Arsenal') }),
						pick('loss', { gameId: 'last-season', ...team('ARS', 'Arsenal') }),
					],
				}),
			),
		)

		expect(view.teamRecords).toHaveLength(1)
		expect(view.teamRecords[0]).toMatchObject({
			familyKey: PREMIER_LEAGUE_FAMILY_KEY,
			name: 'Premier League',
		})
		expect(view.teamRecords[0].all).toEqual([
			{
				teamId: 'team-ars',
				name: 'Arsenal',
				shortName: 'ARS',
				badgeUrl: null,
				picks: 2,
				wins: 1,
				savedByLife: 0,
				rate: 0.5,
			},
		])
	})

	it('counts how many seasons a family pooled, so the page can say', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'this-season', competitionId: 'pl-2526', season: '2025/26' }),
						game({ gameId: 'also-this-season', competitionId: 'pl-2526', season: '2025/26' }),
						game({ gameId: 'last-season', competitionId: 'pl-2425', season: '2024/25' }),
						game({
							gameId: 'cup-game',
							gameMode: 'cup',
							competitionId: 'comp-wc-2026',
							competitionName: 'FIFA World Cup 2026',
							competitionFamilyKey: WORLD_CUP_FAMILY_KEY,
							season: '2026',
						}),
					],
					picks: [
						pick('win', { gameId: 'this-season', ...team('ARS', 'Arsenal') }),
						pick('win', { gameId: 'also-this-season', ...team('ARS', 'Arsenal') }),
						pick('loss', { gameId: 'last-season', ...team('EVE', 'Everton') }),
						pick('win', { gameId: 'cup-game', ...team('BRA', 'Brazil') }),
					],
				}),
			),
		)

		// Three league games but two seasons: the figure is what the block pooled,
		// not how many games went into it.
		expect(view.teamRecords.map((f) => [f.name, f.seasons])).toEqual([
			['Premier League', 2],
			['World Cup', 1],
		])
	})

	it('never pools two families together, even for the same player', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'league-game' }),
						game({
							gameId: 'cup-game',
							gameMode: 'cup',
							competitionId: 'comp-wc-2026',
							competitionName: 'FIFA World Cup 2026',
							competitionFamilyKey: WORLD_CUP_FAMILY_KEY,
							season: '2026',
						}),
					],
					picks: [
						pick('win', { gameId: 'league-game', ...team('ARS', 'Arsenal') }),
						pick('win', { gameId: 'cup-game', ...team('BRA', 'Brazil') }),
						pick('loss', { gameId: 'cup-game', ...team('BRA', 'Brazil') }),
					],
				}),
			),
		)

		const byName = new Map(view.teamRecords.map((f) => [f.name, f]))
		expect([...byName.keys()].sort()).toEqual(['Premier League', 'World Cup'])
		expect(byName.get('Premier League')?.all.map((t) => t.shortName)).toEqual(['ARS'])
		expect(byName.get('World Cup')?.all).toEqual([
			{
				teamId: 'team-bra',
				name: 'Brazil',
				shortName: 'BRA',
				badgeUrl: null,
				picks: 2,
				wins: 1,
				savedByLife: 0,
				rate: 0.5,
			},
		])
	})

	it('keeps a competition with no family out of every other family', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'league-game' }),
						game({
							gameId: 'friendly-game',
							competitionId: 'comp-friendly',
							competitionName: 'Sunday League',
							competitionFamilyKey: null,
						}),
					],
					picks: [
						pick('win', { gameId: 'league-game', ...team('ARS', 'Arsenal') }),
						pick('win', { gameId: 'friendly-game', ...team('ARS', 'Arsenal') }),
					],
				}),
			),
		)

		expect(view.teamRecords.map((f) => [f.name, f.all[0]?.picks])).toEqual([
			['Premier League', 1],
			['Sunday League', 1],
		])
	})

	it('counts a pick a life saved on the row and out of both sides of the rate', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [
						pick('win', team('BRA', 'Brazil')),
						pick('loss', team('BRA', 'Brazil')),
						pick('saved_by_life', team('BRA', 'Brazil')),
						pick('saved_by_life', team('BRA', 'Brazil')),
					],
				}),
			),
		)

		// Four picks on the row, two of them absorbed by a life: the team lost both,
		// so the rate is one win from the two that actually stood — not 1/4, and not
		// 3/4 either.
		expect(view.teamRecords[0].all[0]).toMatchObject({
			shortName: 'BRA',
			picks: 4,
			wins: 1,
			savedByLife: 2,
			rate: 0.5,
		})
	})

	it('has no rate for a team every one of whose picks a life absorbed', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [pick('saved_by_life', team('BRA', 'Brazil'))],
				}),
			),
		)

		expect(view.teamRecords[0].all[0]).toMatchObject({
			picks: 1,
			wins: 0,
			savedByLife: 1,
			rate: null,
		})
	})

	it('leads with the family the player has picked in most, whatever order the rows arrive in', () => {
		const games = [
			game({ gameId: 'league-game' }),
			game({
				gameId: 'cup-game',
				gameMode: 'cup',
				competitionId: 'comp-wc-2026',
				competitionName: 'FIFA World Cup 2026',
				competitionFamilyKey: WORLD_CUP_FAMILY_KEY,
			}),
		]
		const picks = [
			pick('win', { gameId: 'cup-game', ...team('BRA', 'Brazil') }),
			pick('win', { gameId: 'league-game', ...team('ARS', 'Arsenal') }),
			pick('loss', { gameId: 'league-game', ...team('EVE', 'Everton') }),
		]
		const view = summary(buildMeSummaryView(input({ games, picks })))
		const reversed = summary(buildMeSummaryView(input({ games, picks: [...picks].reverse() })))

		expect(view.teamRecords.map((f) => f.name)).toEqual(['Premier League', 'World Cup'])
		expect(reversed.teamRecords.map((f) => f.name)).toEqual(['Premier League', 'World Cup'])
	})

	it('ranks teams by rate, with no minimum sample', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game()],
					picks: [
						// Everton: 1 from 3. Arsenal: 2 from 3. Fulham: 1 from 1.
						pick('loss', team('EVE', 'Everton')),
						pick('loss', team('EVE', 'Everton')),
						pick('win', team('EVE', 'Everton')),
						pick('win', team('ARS', 'Arsenal')),
						pick('win', team('ARS', 'Arsenal')),
						pick('loss', team('ARS', 'Arsenal')),
						pick('win', team('FUL', 'Fulham')),
					],
				}),
			),
		)

		expect(view.teamRecords[0].all.map((t) => [t.shortName, t.rate])).toEqual([
			['FUL', 1],
			['ARS', 2 / 3],
			['EVE', 1 / 3],
		])
	})

	it('ranks the larger sample above the smaller one when two teams share a rate', () => {
		const picks = [
			pick('win', team('ARS', 'Arsenal')),
			pick('loss', team('ARS', 'Arsenal')),
			pick('win', team('EVE', 'Everton')),
			pick('win', team('EVE', 'Everton')),
			pick('loss', team('EVE', 'Everton')),
			pick('loss', team('EVE', 'Everton')),
		]
		const view = summary(buildMeSummaryView(input({ games: [game()], picks })))
		const reversed = summary(
			buildMeSummaryView(input({ games: [game()], picks: [...picks].reverse() })),
		)

		// Both are on 50%; Everton's four picks say more than Arsenal's two.
		expect(view.teamRecords[0].all.map((t) => t.shortName)).toEqual(['EVE', 'ARS'])
		expect(reversed.teamRecords[0].all.map((t) => t.shortName)).toEqual(['EVE', 'ARS'])
	})

	it('sinks a team with no rate below every team that has one', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [
						pick('saved_by_life', team('ITA', 'Italy')),
						pick('loss', team('ENG', 'England')),
						pick('win', team('BRA', 'Brazil')),
					],
				}),
			),
		)

		// A team whose only pick a life absorbed has no rate at all, so it can't be
		// ranked among the teams that do — it goes last rather than reading as the
		// worst of them.
		expect(view.teamRecords[0].all.map((t) => t.shortName)).toEqual(['BRA', 'ENG', 'ITA'])
	})

	it('surfaces the best and worst ends and keeps every team in the expansion', () => {
		// Eight clubs on eight distinct rates, 8/8 down to 1/8, so the ranking is
		// unambiguous and the ends are the top three and bottom three of it.
		const clubs = ['ARS', 'BOU', 'CHE', 'EVE', 'FUL', 'LEE', 'MCI', 'NEW']
		const picks = clubs.flatMap((shortName, index) => {
			const wins = 8 - index
			return Array.from({ length: 8 }, (_, n) =>
				pick(n < wins ? 'win' : 'loss', team(shortName, `${shortName} FC`)),
			)
		})
		const view = summary(buildMeSummaryView(input({ games: [game()], picks })))
		const block = view.teamRecords[0]

		expect(block.all.map((t) => t.shortName)).toEqual(clubs)
		expect(block.best.map((t) => t.shortName)).toEqual(['ARS', 'BOU', 'CHE'])
		expect(block.worst.map((t) => t.shortName)).toEqual(['NEW', 'MCI', 'LEE'])
	})

	it('never puts the same team in both ends of a short list', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game()],
					picks: [
						pick('win', team('ARS', 'Arsenal')), // 1 of 1
						pick('win', team('BOU', 'Bournemouth')), // 2 of 3
						pick('win', team('BOU', 'Bournemouth')),
						pick('loss', team('BOU', 'Bournemouth')),
						pick('win', team('CHE', 'Chelsea')), // 1 of 3
						pick('loss', team('CHE', 'Chelsea')),
						pick('loss', team('CHE', 'Chelsea')),
						pick('loss', team('EVE', 'Everton')), // 0 of 1
					],
				}),
			),
		)
		const block = view.teamRecords[0]

		// Four teams split two and two. Taking three from each end would have
		// claimed Bournemouth and Chelsea for both lists.
		expect(block.all.map((t) => t.shortName)).toEqual(['ARS', 'BOU', 'CHE', 'EVE'])
		expect(block.best.map((t) => t.shortName)).toEqual(['ARS', 'BOU'])
		expect(block.worst.map((t) => t.shortName)).toEqual(['EVE', 'CHE'])
	})

	it('keeps a team with no rate out of both ends while still listing it', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [
						pick('win', team('BRA', 'Brazil')),
						pick('loss', team('ENG', 'England')),
						pick('saved_by_life', team('ITA', 'Italy')),
					],
				}),
			),
		)
		const block = view.teamRecords[0]

		// Italy has no rate to rank on, so it is neither a best nor a worst — the
		// worst end is England, whose pick actually failed.
		expect(block.best.map((t) => t.shortName)).toEqual(['BRA'])
		expect(block.worst.map((t) => t.shortName)).toEqual(['ENG'])
		expect(block.all.map((t) => t.shortName)).toEqual(['BRA', 'ENG', 'ITA'])
	})

	it('never calls a team one of the worst at the same rate as the best', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameMode: 'cup' })],
					picks: [
						pick('win', team('BRA', 'Brazil')),
						pick('win', team('ARG', 'Argentina')),
						pick('win', team('ESP', 'Spain')),
						pick('win', team('FRA', 'France')),
						pick('loss', team('ENG', 'England')),
					],
				}),
			),
		)
		const block = view.teamRecords[0]

		// Four of the five are on 100%. Splitting the ranking down the middle would
		// have made Spain a worst at the very rate that makes Brazil a best; only
		// England actually let the player down.
		expect(block.worst.map((t) => t.shortName)).toEqual(['ENG'])
		// The four are level on rate and on volume, so the name tiebreak orders them.
		expect(block.best.map((t) => t.shortName)).toEqual(['ARG', 'BRA', 'FRA'])
	})

	it('has no worst end at all when every team in the family shares one rate', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game()],
					picks: [pick('win', team('ARS', 'Arsenal')), pick('win', team('EVE', 'Everton'))],
				}),
			),
		)

		expect(view.teamRecords[0].worst).toEqual([])
		expect(view.teamRecords[0].best.map((t) => t.shortName)).toEqual(['ARS'])
	})

	it('puts a family with one team in its best end and nothing in its worst', () => {
		const view = summary(
			buildMeSummaryView(input({ games: [game()], picks: [pick('win', team('ARS', 'Arsenal'))] })),
		)

		expect(view.teamRecords[0].best.map((t) => t.shortName)).toEqual(['ARS'])
		expect(view.teamRecords[0].worst).toEqual([])
	})
})

describe('buildMeSummaryView money', () => {
	it('stakes the payment rows that are paid or claimed, as the pot counts them', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameId: 'g1' })],
					payments: [
						stake('g1', '10.00', 'paid'),
						stake('g1', '10.00', 'claimed'),
						// Owed and unpaid: not in the pot, so not staked.
						stake('g1', '10.00', 'pending'),
					],
				}),
			),
		)

		expect(view.money.stake).toBe('20.00')
		expect(view.money.winnings).toBe('0.00')
		expect(view.money.net).toBe('-20.00')
	})

	it('counts a payout as winnings whatever its status says', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameId: 'g1', playerStatus: 'winner' })],
					payments: [stake('g1', '10.00')],
					// Nothing in the app advances a payout past pending, so a summary
					// that filtered on status would tell every winner they won nothing.
					payouts: [won('g1', '60.00', 'pending')],
				}),
			),
		)

		expect(view.money.winnings).toBe('60.00')
		expect(view.money.net).toBe('50.00')
	})

	it('nets a refunded game to nothing', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameId: 'wipeout', gameName: 'Everyone Went Out' })],
					// A total wipeout refunds every contributing stake — the rebuy's
					// included — and writes no payout at all.
					payments: [stake('wipeout', '10.00', 'refunded'), stake('wipeout', '10.00', 'refunded')],
				}),
			),
		)

		expect(view.money.stake).toBe('0.00')
		expect(view.money.winnings).toBe('0.00')
		expect(view.money.net).toBe('0.00')
		expect(view.money.games.map((g) => [g.gameId, g.net])).toEqual([['wipeout', '0.00']])
	})

	it('stakes a rebuy on top of the entry that came before it', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [game({ gameId: 'g1' })],
					// Buying back in is a second payment row against the same game.
					payments: [stake('g1', '10.00'), stake('g1', '10.00')],
				}),
			),
		)

		expect(view.money.stake).toBe('20.00')
		expect(view.money.net).toBe('-20.00')
		expect(view.money.games.map((g) => g.stake)).toEqual(['20.00'])
	})

	it('leaves a free game out of the money while still counting it as played', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'paid-game' }),
						game({ gameId: 'free-game', gameName: 'Just For Fun' }),
					],
					payments: [stake('paid-game', '10.00')],
				}),
			),
		)

		expect(view.headline.gamesPlayed).toBe(2)
		expect(view.money.stake).toBe('10.00')
		expect(view.money.net).toBe('-10.00')
		// No money was ever in the free game, so it has no row to show — a row of
		// noughts would read as a game that cost nothing to enter and lost.
		expect(view.money.games.map((g) => g.gameId)).toEqual(['paid-game'])
		expect(view.money.freeGames).toBe(1)
	})

	it('breaks the total down into a row per game, biggest loss first', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					games: [
						game({ gameId: 'g1', gameName: 'Pub Survivor', playerStatus: 'winner' }),
						game({ gameId: 'g2', gameName: 'The Office Pool' }),
					],
					payments: [stake('g1', '5.00'), stake('g2', '10.00')],
					payouts: [won('g1', '40.00')],
				}),
			),
		)

		expect(view.money.games).toEqual([
			{
				gameId: 'g2',
				name: 'The Office Pool',
				competitionName: 'Premier League 2025/26',
				gameMode: 'classic',
				stake: '10.00',
				winnings: '0.00',
				net: '-10.00',
			},
			{
				gameId: 'g1',
				name: 'Pub Survivor',
				competitionName: 'Premier League 2025/26',
				gameMode: 'classic',
				stake: '5.00',
				winnings: '40.00',
				net: '35.00',
			},
		])
	})
})

/** Two league seasons and a World Cup — the shape a per-family filter exists for. */
function threeSeasons(): Pick<BuildMeSummaryInput, 'games' | 'picks'> {
	return {
		games: [
			game({ gameId: 'pl-a', competitionId: 'pl-2425', season: '2024/25' }),
			game({ gameId: 'pl-b', competitionId: 'pl-2526', season: '2025/26' }),
			game({
				gameId: 'wc',
				gameMode: 'cup',
				competitionId: 'comp-wc-2026',
				competitionName: 'FIFA World Cup 2026',
				competitionFamilyKey: WORLD_CUP_FAMILY_KEY,
				season: '2026',
			}),
		],
		picks: [
			pick('win', { gameId: 'pl-a', ...team('ARS', 'Arsenal') }),
			pick('loss', { gameId: 'pl-a', ...team('EVE', 'Everton') }),
			pick('loss', { gameId: 'pl-b', ...team('ARS', 'Arsenal') }),
			pick('win', { gameId: 'pl-b', ...team('LIV', 'Liverpool') }),
			pick('win', { gameId: 'wc', ...team('BRA', 'Brazil') }),
		],
	}
}

describe('buildMeSummaryView team season filter', () => {
	it("lists a family's own seasons, most recent first, with none selected by default", () => {
		const view = summary(buildMeSummaryView(input(threeSeasons())))
		const byName = new Map(view.teamRecords.map((f) => [f.name, f]))

		expect(byName.get('Premier League')?.seasonOptions).toEqual(['2025/26', '2024/25'])
		expect(byName.get('Premier League')?.selectedSeason).toBeNull()
		// A family's seasons are its own vocabulary — the World Cup's never join them.
		expect(byName.get('World Cup')?.seasonOptions).toEqual(['2026'])
		expect(byName.get('World Cup')?.selectedSeason).toBeNull()
	})

	it('narrows one family to a season and leaves every other family whole', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					...threeSeasons(),
					filters: { season: null, teamSeasons: { [PREMIER_LEAGUE_FAMILY_KEY]: '2025/26' } },
				}),
			),
		)
		const byName = new Map(view.teamRecords.map((f) => [f.name, f]))

		const league = byName.get('Premier League')
		expect(league?.selectedSeason).toBe('2025/26')
		// Only 2025/26's two picks: Liverpool's win and Arsenal's loss. Arsenal's
		// 2024/25 win is out, so its rate is nought rather than the pooled half.
		expect(league?.all.map((t) => [t.shortName, t.picks, t.rate])).toEqual([
			['LIV', 1, 1],
			['ARS', 1, 0],
		])
		expect(league?.seasons).toBe(1)
		// Everton was only ever picked in the season filtered out.
		expect(league?.all.map((t) => t.shortName)).not.toContain('EVE')
		// The control still offers the season it narrowed away from.
		expect(league?.seasonOptions).toEqual(['2025/26', '2024/25'])

		const worldCup = byName.get('World Cup')
		expect(worldCup?.selectedSeason).toBeNull()
		expect(worldCup?.all.map((t) => t.shortName)).toEqual(['BRA'])
	})

	it('has no records for a season the player made no picks in, and still its control', () => {
		const view = summary(
			buildMeSummaryView(
				input({
					...threeSeasons(),
					filters: { season: null, teamSeasons: { [PREMIER_LEAGUE_FAMILY_KEY]: '2023/24' } },
				}),
			),
		)
		const league = view.teamRecords.find((f) => f.familyKey === PREMIER_LEAGUE_FAMILY_KEY)

		// The block stays — with nothing in it, but with every season it has ever
		// had, so the player can get back out of the season they filtered into.
		expect(league).toMatchObject({ selectedSeason: '2023/24', seasons: 0 })
		expect(league?.all).toEqual([])
		expect(league?.best).toEqual([])
		expect(league?.worst).toEqual([])
		expect(league?.seasonOptions).toEqual(['2025/26', '2024/25'])
	})

	it('leaves the career headline and the mode sections all-time', () => {
		const career = summary(buildMeSummaryView(input(threeSeasons())))
		const filtered = summary(
			buildMeSummaryView(
				input({
					...threeSeasons(),
					filters: {
						season: null,
						teamSeasons: { [PREMIER_LEAGUE_FAMILY_KEY]: '2025/26', [WORLD_CUP_FAMILY_KEY]: '2026' },
					},
				}),
			),
		)

		// A team block is a record of teams; the headline and the modes are a record
		// of games, and narrowing one team block says nothing about those.
		expect(filtered.headline).toEqual(career.headline)
		expect(filtered.modes).toEqual(career.modes)
	})
})

describe('team season search params', () => {
	it('reads one season per family out of the URL and ignores everything else', () => {
		expect(
			parseTeamSeasonFilters({
				'teams-premier-league': '2025/26',
				'teams-fifa-world-cup': '2026',
				'teams-premier-league-extra': '',
				from: '/game/g1',
			}),
		).toEqual({ 'premier-league': '2025/26', 'fifa-world-cup': '2026' })
	})

	it('changes one family and leaves the rest of the URL alone', () => {
		const selections = { 'premier-league': '2024/25', 'fifa-world-cup': '2026' }

		expect(teamSeasonQuery(selections, 'premier-league', '2025/26')).toBe(
			'?teams-premier-league=2025%2F26&teams-fifa-world-cup=2026',
		)
		// Clearing a family drops its parameter and keeps the other's.
		expect(teamSeasonQuery(selections, 'premier-league', null)).toBe('?teams-fifa-world-cup=2026')
		// Nothing selected anywhere is the bare path, not an empty parameter.
		expect(teamSeasonQuery({ 'premier-league': '2024/25' }, 'premier-league', null)).toBe('?')
	})

	it('round-trips a selection through the URL', () => {
		const selections = { 'premier-league': '2024/25' }
		const query = teamSeasonQuery(selections, 'fifa-world-cup', '2026')

		expect(parseTeamSeasonFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual({
			'premier-league': '2024/25',
			'fifa-world-cup': '2026',
		})
	})
})
