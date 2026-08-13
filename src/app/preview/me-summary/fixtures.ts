import type { MeSummaryView } from '@/lib/game/me-summary-view'

/**
 * A player with a few seasons behind them, viewing their whole career: games
 * won and lost, picks that came off and picks that didn't, a couple of picks a
 * cup life absorbed, and a club they clearly can't leave alone.
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
	teamRecords: [],
}
