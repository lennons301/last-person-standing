import { describe, expect, it } from 'vitest'
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
})
