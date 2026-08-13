import { describe, expect, it } from 'vitest'
import { PREMIER_LEAGUE_FAMILY_KEY, WORLD_CUP_FAMILY_KEY } from '@/lib/game/competition-family'
import {
	type BuildMeSummaryInput,
	buildMeSummaryView,
	type MeSummaryView,
	type SummaryGameRow,
	type SummaryPickResult,
	type SummaryPickRow,
} from '@/lib/game/me-summary-view'

function input(overrides: Partial<BuildMeSummaryInput> = {}): BuildMeSummaryInput {
	return { games: [], picks: [], filters: { season: null }, ...overrides }
}

function game(overrides: Partial<SummaryGameRow> = {}): SummaryGameRow {
	return {
		gameId: 'game-1',
		gameMode: 'classic',
		season: '2025/26',
		playerStatus: 'eliminated',
		competitionId: 'comp-pl-2526',
		competitionName: 'Premier League 2025/26',
		competitionFamilyKey: PREMIER_LEAGUE_FAMILY_KEY,
		...overrides,
	}
}

function pick(result: SummaryPickResult, overrides: Partial<SummaryPickRow> = {}): SummaryPickRow {
	return {
		gameId: 'game-1',
		teamId: 'team-ars',
		teamName: 'Arsenal',
		teamShortName: 'ARS',
		teamBadgeUrl: null,
		result,
		isAuto: false,
		...overrides,
	}
}

/** Narrows away the empty variant so a test can read the headline. */
function summary(view: MeSummaryView) {
	if (view.kind !== 'summary') throw new Error(`expected a populated summary, got ${view.kind}`)
	return view
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
