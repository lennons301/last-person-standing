import type { MeSummaryView } from '@/lib/game/me-summary-view'

/**
 * A player with a few seasons behind them, viewing their whole career: games
 * won and lost, picks that came off and picks that didn't, a couple of picks a
 * cup life absorbed, and a club they clearly can't leave alone. Every mode has
 * been played, so all three sections are populated — classic with its depth,
 * turbo and cup with their streaks.
 *
 * Hand-built — the gallery never touches the database.
 */
export const FULL_HISTORY_SUMMARY: MeSummaryView = {
	kind: 'summary',
	filters: { season: null },
	headline: {
		gamesPlayed: 14,
		gamesWon: 3,
		winRate: 3 / 14,
		pickAccuracy: {
			successful: 61,
			settled: 82,
			rate: 61 / 82,
			savedByLife: 4,
		},
		mostPickedTeam: {
			teamId: 'team-liv',
			name: 'Liverpool',
			shortName: 'LIV',
			badgeUrl: null,
			picks: 17,
		},
	},
	modes: [
		{
			mode: 'classic',
			kind: 'played',
			gamesPlayed: 9,
			gamesWon: 2,
			winRate: 2 / 9,
			competitions: [
				{
					competitionId: 'comp-pl-2526',
					name: 'Premier League 2025/26',
					gamesPlayed: 5,
					gamesWon: 1,
					winRate: 1 / 5,
				},
				{
					competitionId: 'comp-pl-2425',
					name: 'Premier League 2024/25',
					gamesPlayed: 4,
					gamesWon: 1,
					winRate: 1 / 4,
				},
			],
			depth: { best: 12, average: 47 / 9, games: 9 },
		},
		{
			mode: 'turbo',
			kind: 'played',
			gamesPlayed: 3,
			gamesWon: 1,
			winRate: 1 / 3,
			competitions: [
				{
					competitionId: 'comp-pl-2526',
					name: 'Premier League 2025/26',
					gamesPlayed: 3,
					gamesWon: 1,
					winRate: 1 / 3,
				},
			],
			streak: { longest: 6, average: 11 / 3, games: 3 },
		},
		{
			mode: 'cup',
			kind: 'played',
			gamesPlayed: 2,
			gamesWon: 0,
			winRate: 0,
			competitions: [
				{
					competitionId: 'comp-wc-2026',
					name: 'World Cup 2026',
					gamesPlayed: 2,
					gamesWon: 0,
					winRate: 0,
				},
			],
			streak: { longest: 4, average: 2.5, games: 2 },
		},
	],
}

/**
 * A classic-only player, one game in and still alive in it. The two modes they
 * have never touched state their own absence, and the one turbo game that is
 * still being played contributes no streak — the state that shows a section can
 * have games behind it and still have nothing to average.
 */
export const CLASSIC_ONLY_SUMMARY: MeSummaryView = {
	kind: 'summary',
	filters: { season: null },
	headline: {
		gamesPlayed: 3,
		gamesWon: 0,
		winRate: 0,
		pickAccuracy: { successful: 7, settled: 9, rate: 7 / 9, savedByLife: 0 },
		mostPickedTeam: {
			teamId: 'team-ars',
			name: 'Arsenal',
			shortName: 'ARS',
			badgeUrl: null,
			picks: 4,
		},
	},
	modes: [
		{
			mode: 'classic',
			kind: 'played',
			gamesPlayed: 2,
			gamesWon: 0,
			winRate: 0,
			competitions: [
				{
					competitionId: 'comp-pl-2526',
					name: 'Premier League 2025/26',
					gamesPlayed: 2,
					gamesWon: 0,
					winRate: 0,
				},
			],
			depth: { best: 5, average: 4, games: 2 },
		},
		{
			mode: 'turbo',
			kind: 'played',
			gamesPlayed: 1,
			gamesWon: 0,
			winRate: 0,
			competitions: [
				{
					competitionId: 'comp-pl-2526',
					name: 'Premier League 2025/26',
					gamesPlayed: 1,
					gamesWon: 0,
					winRate: 0,
				},
			],
			streak: { longest: null, average: null, games: 0 },
		},
		{ mode: 'cup', kind: 'unplayed' },
	],
}
