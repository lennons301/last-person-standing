import { PREMIER_LEAGUE_FAMILY_KEY, WORLD_CUP_FAMILY_KEY } from '@/lib/game/competition-family'
import {
	buildMeSummaryView,
	type MeSummaryView,
	type SummaryGameRow,
	type SummaryPickResult,
	type SummaryPickRow,
} from '@/lib/game/me-summary-view'

/**
 * The history the gallery renders: nine games over two Premier League seasons
 * and one World Cup, hand-written as the rows the page's query returns and run
 * through the real builder. Hand-built — the gallery never touches the database
 * — but never hand-*totalled*, so every figure on the page is one the builder
 * can actually produce from a history like this.
 *
 * The two league seasons are the point of the shape: they pool into one Teams
 * block (Liverpool's five picks could not come from one season — classic allows
 * a club once per game), while the World Cup stands beside them as its own
 * family and never merges into the league's ranking.
 */

const CLUBS = {
	LIV: { teamId: 'team-liv', teamName: 'Liverpool', teamShortName: 'LIV' },
	ARS: { teamId: 'team-ars', teamName: 'Arsenal', teamShortName: 'ARS' },
	MCI: { teamId: 'team-mci', teamName: 'Manchester City', teamShortName: 'MCI' },
	CHE: { teamId: 'team-che', teamName: 'Chelsea', teamShortName: 'CHE' },
	NEW: { teamId: 'team-new', teamName: 'Newcastle United', teamShortName: 'NEW' },
	EVE: { teamId: 'team-eve', teamName: 'Everton', teamShortName: 'EVE' },
	BOU: { teamId: 'team-bou', teamName: 'Bournemouth', teamShortName: 'BOU' },
	FUL: { teamId: 'team-ful', teamName: 'Fulham', teamShortName: 'FUL' },
	WOL: { teamId: 'team-wol', teamName: 'Wolves', teamShortName: 'WOL' },
	BRA: { teamId: 'team-bra', teamName: 'Brazil', teamShortName: 'BRA' },
	ARG: { teamId: 'team-arg', teamName: 'Argentina', teamShortName: 'ARG' },
	ESP: { teamId: 'team-esp', teamName: 'Spain', teamShortName: 'ESP' },
	FRA: { teamId: 'team-fra', teamName: 'France', teamShortName: 'FRA' },
	ENG: { teamId: 'team-eng', teamName: 'England', teamShortName: 'ENG' },
	ITA: { teamId: 'team-ita', teamName: 'Italy', teamShortName: 'ITA' },
} satisfies Record<string, Omit<SummaryPickRow, 'gameId' | 'result' | 'isAuto' | 'teamBadgeUrl'>>

const RESULTS = {
	W: 'win',
	L: 'loss',
	D: 'draw',
	/** A cup life absorbed it. */
	S: 'saved_by_life',
	/** Still to play. */
	P: 'pending',
} satisfies Record<string, SummaryPickResult>

const PL_2425 = {
	competitionId: 'comp-pl-2425',
	competitionName: 'Premier League 2024/25',
	competitionFamilyKey: PREMIER_LEAGUE_FAMILY_KEY,
	season: '2024/25',
}

const PL_2526 = {
	competitionId: 'comp-pl-2526',
	competitionName: 'Premier League 2025/26',
	competitionFamilyKey: PREMIER_LEAGUE_FAMILY_KEY,
	season: '2025/26',
}

const WORLD_CUP_2026 = {
	competitionId: 'comp-wc-2026',
	competitionName: 'FIFA World Cup 2026',
	competitionFamilyKey: WORLD_CUP_FAMILY_KEY,
	season: '2026',
}

const GAMES: SummaryGameRow[] = [
	{ gameId: 'g1', gameMode: 'classic', playerStatus: 'eliminated', ...PL_2425 },
	{ gameId: 'g2', gameMode: 'classic', playerStatus: 'winner', ...PL_2425 },
	{ gameId: 'g3', gameMode: 'turbo', playerStatus: 'eliminated', ...PL_2425 },
	{ gameId: 'g4', gameMode: 'classic', playerStatus: 'eliminated', ...PL_2526 },
	{ gameId: 'g5', gameMode: 'classic', playerStatus: 'alive', ...PL_2526 },
	{ gameId: 'g6', gameMode: 'turbo', playerStatus: 'winner', ...PL_2526 },
	{ gameId: 'g7', gameMode: 'turbo', playerStatus: 'eliminated', ...PL_2526 },
	{ gameId: 'g8', gameMode: 'cup', playerStatus: 'eliminated', ...WORLD_CUP_2026 },
	{ gameId: 'g9', gameMode: 'cup', playerStatus: 'winner', ...WORLD_CUP_2026 },
]

/**
 * What one game's picks came to — each club picked once, as every mode allows,
 * with how it went.
 */
function played(
	gameId: string,
	results: Partial<Record<keyof typeof CLUBS, keyof typeof RESULTS>>,
): SummaryPickRow[] {
	return Object.entries(results).map(([club, code]) => ({
		gameId,
		...CLUBS[club as keyof typeof CLUBS],
		teamBadgeUrl: null,
		result: RESULTS[code as keyof typeof RESULTS],
		isAuto: false,
	}))
}

const PICKS: SummaryPickRow[] = [
	...played('g1', { LIV: 'W', ARS: 'W', EVE: 'L' }),
	...played('g2', { MCI: 'W', LIV: 'W', CHE: 'W', NEW: 'W' }),
	...played('g3', { ARS: 'W', BOU: 'L', FUL: 'L', WOL: 'L' }),
	...played('g4', { LIV: 'W', MCI: 'L' }),
	...played('g5', { LIV: 'W', ARS: 'L', CHE: 'W', EVE: 'P' }),
	...played('g6', { MCI: 'W', NEW: 'W', LIV: 'W', BOU: 'W' }),
	...played('g7', { ARS: 'W', EVE: 'L', WOL: 'L', FUL: 'W' }),
	// The cup games: a draw counts for the player, and two picks a life absorbed
	// — Italy's only one, which leaves it with no rate at all.
	...played('g8', { BRA: 'W', ITA: 'S', ENG: 'L', ARG: 'D' }),
	...played('g9', { FRA: 'W', BRA: 'W', ESP: 'D', ENG: 'S' }),
]

/**
 * A player with a few seasons behind them, viewing their whole career: games
 * won and lost, picks that came off and picks that didn't, a couple of picks a
 * cup life absorbed, and a club they clearly can't leave alone.
 */
export const FULL_HISTORY_SUMMARY: MeSummaryView = buildMeSummaryView({
	games: GAMES,
	picks: PICKS,
	filters: { season: null },
})
