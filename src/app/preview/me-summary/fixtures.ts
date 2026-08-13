import type { MeSummaryView } from '@/lib/game/me-summary-view'

/**
 * A player with a few seasons behind them, viewing their whole career: games
 * won and lost, picks that came off and picks that didn't, a couple of picks a
 * cup life absorbed, and a club they clearly can't leave alone. Every mode has
 * been played, so all three sections are populated — classic with its depth and
 * its round-one block, turbo and cup with their streaks.
 *
 * Classic's round one is the rebought state: four of their nine opening picks
 * went down, three of those games were offering a rebuy, and they took two of
 * them — so the rebuy figure is read against three of those four, not all four.
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
			roundOne: {
				games: 9,
				settled: 9,
				survived: 5,
				survivalRate: 5 / 9,
				exits: 4,
				rebuyable: 3,
				rebought: 2,
			},
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
 *
 * Both their opening picks came off, so round one has no exit and no rebuy to
 * report: the rebuy figure states that none was ever on offer rather than
 * showing a nought that reads as a chance passed up.
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
			roundOne: {
				games: 2,
				settled: 2,
				survived: 2,
				survivalRate: 1,
				exits: 0,
				rebuyable: 0,
				rebought: 0,
			},
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

/**
 * A player one round into their only classic game — a game created mid-season,
 * so its round one is gameweek 12 rather than gameweek 1, and that round hasn't
 * kicked off yet.
 *
 * The state proves the round-one block says what it doesn't know: the survival
 * rate is a dash over the game it has nothing to say about yet, rather than a
 * nought for a hurdle the player hasn't been put to. A round one a cancelled
 * fixture voided renders identically.
 */
export const UNSETTLED_ROUND_ONE_SUMMARY: MeSummaryView = {
	kind: 'summary',
	filters: { season: null },
	headline: {
		gamesPlayed: 1,
		gamesWon: 0,
		winRate: 0,
		// The one pick they hold is still pending, so it counts in neither half of
		// the accuracy rate and there is no most-picked club to name.
		pickAccuracy: { successful: 0, settled: 0, rate: null, savedByLife: 0 },
		mostPickedTeam: null,
	},
	modes: [
		{
			mode: 'classic',
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
			// A round held is a fact the moment it's picked, so the pending pick still
			// counts as a round.
			depth: { best: 1, average: 1, games: 1 },
			roundOne: {
				games: 1,
				settled: 0,
				survived: 0,
				survivalRate: null,
				exits: 0,
				rebuyable: 0,
				rebought: 0,
			},
		},
		{ mode: 'turbo', kind: 'unplayed' },
		{ mode: 'cup', kind: 'unplayed' },
	],
}
