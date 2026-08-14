import { PREMIER_LEAGUE_FAMILY_KEY, WORLD_CUP_FAMILY_KEY } from '@/lib/game/competition-family'
import {
	buildMeSummaryView,
	type MeSummaryView,
	type MoneySummary,
	type SummaryGameRow,
	type SummaryPaymentRow,
	type SummaryPayoutRow,
	type SummaryPickResult,
	type SummaryPickRow,
	type SummaryStreakPickRow,
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
} satisfies Record<
	string,
	Omit<SummaryPickRow, 'gameId' | 'roundId' | 'roundNumber' | 'result' | 'isAuto' | 'teamBadgeUrl'>
>

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

/**
 * Every row is this one player's: the page reads its player from the session, so
 * there is only ever one `game_player` behind a summary.
 */
const ME = { gamePlayerId: 'gp-me' }

/**
 * The round-one bookkeeping every game row carries, and which only classic
 * reads. The default is the ordinary game: it opened at the competition's own
 * first round and never offered a way back in, so a lost opening round is an
 * exit with no rebuy to pass up. The games that tell a round-one story override
 * what they need.
 */
const OPENED_AT_ROUND_ONE = {
	allowRebuys: false,
	eliminatedRoundId: null,
	firstRoundNumber: 1,
}

/**
 * A turbo or cup game the player didn't win still stands them at `alive` — a
 * single-round mode has no eliminations to advance, so `eliminated` there means
 * the game went on without them (an admin removal), which reads as no streak at
 * all. The two ordinary turbo losses below are the states worth reviewing, so
 * they carry the status a real losing turbo player carries.
 */
const GAMES: SummaryGameRow[] = [
	{
		gameId: 'g1',
		gameName: 'The Office Pool 24/25',
		gameMode: 'classic',
		gameStatus: 'completed',
		playerStatus: 'eliminated',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2425,
		// Their opening pick went down with a rebuy there for the taking, and they
		// left it. The picks they hold in later rounds were locked in before they
		// went out — classic accepts advance picks and doesn't delete them — so it
		// is the elimination round, not the later picks, that tells a rebuy from a
		// leftover.
		allowRebuys: true,
		eliminatedRoundId: 'g1-r1',
	},
	{
		gameId: 'g2',
		gameName: 'Sunday Sweepstake',
		gameMode: 'classic',
		gameStatus: 'completed',
		playerStatus: 'winner',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2425,
	},
	{
		gameId: 'g3',
		gameName: 'Turbo Tuesday',
		gameMode: 'turbo',
		gameStatus: 'completed',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2425,
	},
	{
		gameId: 'g4',
		gameName: 'The Office Pool 25/26',
		gameMode: 'classic',
		gameStatus: 'completed',
		// Alive in a completed game, which the rounds-exhausted tiebreak reaches:
		// more than one player is still standing at the last round and goals settle
		// it, so everybody who didn't win keeps the status they had. It is also the
		// only status coherent with the rest of this row — buying back in cleared
		// the elimination, and nothing put them out again.
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
		// The rebuy, and the second payment row below is the same event. Buying
		// back in clears the elimination round, which is what marks this apart from
		// g1 — still pointing at its opening round: the same lost opening round,
		// the other decision.
		allowRebuys: true,
	},
	{
		gameId: 'g5',
		gameName: 'Five-a-side Survivors',
		gameMode: 'classic',
		gameStatus: 'active',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
	{
		gameId: 'g6',
		gameName: 'Gameweek Blitz',
		gameMode: 'turbo',
		gameStatus: 'completed',
		playerStatus: 'winner',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
	{
		gameId: 'g7',
		gameName: 'Turbo Rematch',
		gameMode: 'turbo',
		gameStatus: 'completed',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
	{
		gameId: 'g8',
		gameName: 'World Cup Knockout',
		gameMode: 'cup',
		gameStatus: 'completed',
		playerStatus: 'eliminated',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...WORLD_CUP_2026,
	},
	{
		gameId: 'g9',
		gameName: 'World Cup Redemption',
		gameMode: 'cup',
		gameStatus: 'completed',
		playerStatus: 'winner',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...WORLD_CUP_2026,
	},
]

/**
 * What one game's picks came to — each club picked once, as every mode allows,
 * with how it went.
 *
 * A pick lands in its own round, in the order written, which is what classic
 * reads its depth from: a game with four picks is four rounds held. A
 * single-round mode's picks nominally share a round, but nothing reads a round
 * there, so one round each costs nothing and keeps the helper to one rule.
 */
function played(
	gameId: string,
	results: Partial<Record<keyof typeof CLUBS, keyof typeof RESULTS>>,
	firstRound = 1,
): SummaryPickRow[] {
	return Object.entries(results).map(([club, code], index) => ({
		gameId,
		roundId: `${gameId}-r${index + 1}`,
		// Counted from the round the game itself opened at, not the season's first:
		// a game created in November opens at gameweek 12, and gameweek 12 is the
		// first hurdle its players were put to.
		roundNumber: firstRound + index,
		...CLUBS[club as keyof typeof CLUBS],
		teamBadgeUrl: null,
		result: RESULTS[code as keyof typeof RESULTS],
		isAuto: false,
	}))
}

const PICKS: SummaryPickRow[] = [
	// The opening pick is the one that went down in both g1 and g4 — the round-one
	// block reads the game's first round, and each club's own result is unchanged
	// by which round it fell in, so the team records read the same either way.
	...played('g1', { EVE: 'L', LIV: 'W', ARS: 'W' }),
	...played('g2', { MCI: 'W', LIV: 'W', CHE: 'W', NEW: 'W' }),
	...played('g3', { ARS: 'W', BOU: 'L', FUL: 'L', WOL: 'L' }),
	...played('g4', { MCI: 'L', LIV: 'W' }),
	...played('g5', { LIV: 'W', ARS: 'L', CHE: 'W', EVE: 'P' }),
	...played('g6', { MCI: 'W', NEW: 'W', LIV: 'W', BOU: 'W' }),
	...played('g7', { ARS: 'W', EVE: 'L', WOL: 'L', FUL: 'W' }),
	// The cup games: a draw counts for the player, and two picks a life absorbed
	// — Italy's only one, which leaves it with no rate at all.
	...played('g8', { BRA: 'W', ITA: 'S', ENG: 'L', ARG: 'D' }),
	...played('g9', { FRA: 'W', BRA: 'W', ESP: 'D', ENG: 'S' }),
]

/**
 * The player's own ranked picks in one single-round game, rank 1 first in the
 * order they were written. Void and pending picks are left out here exactly as
 * the query leaves them out.
 *
 * These exist so the streaks come from `resolveWipeout` — the same function that
 * decided the game — rather than from numbers chosen in this file. Only this
 * player's rows are here, which is the ordinary case for a gallery: the rank a
 * streak counts from is the lowest rank anybody got right, and with one player
 * that is their own.
 */
function ranked(gameId: string): SummaryStreakPickRow[] {
	const game = GAMES.find((g) => g.gameId === gameId)
	return PICKS.filter((p) => p.gameId === gameId)
		.filter((p) => p.result !== 'pending' && p.result !== 'void')
		.map((p, index) => ({
			gameId,
			gamePlayerId: ME.gamePlayerId,
			confidenceRank: index + 1,
			result: p.result,
			playerStatus: game?.playerStatus ?? 'alive',
		}))
}

const STREAK_PICKS: SummaryStreakPickRow[] = GAMES.filter((g) => g.gameMode !== 'classic').flatMap(
	(g) => ranked(g.gameId),
)

/**
 * What each game cost the player, and what two of them paid back.
 *
 * The states the money fold has to survive are all here: an entry paid, an entry
 * only marked paid (claimed — in the pot all the same), a rebuy as a second row
 * against one game, a game whose stakes were refunded when everybody went out
 * (it nets to nothing), and a game with no money in it at all, which contributes
 * nothing while still counting as played.
 */
const PAYMENTS: SummaryPaymentRow[] = [
	{ gameId: 'g1', amount: '10.00', status: 'paid' },
	{ gameId: 'g2', amount: '10.00', status: 'paid' },
	{ gameId: 'g3', amount: '5.00', status: 'paid' },
	// The rebuy: a second entry against the same game, staked on top of the first.
	{ gameId: 'g4', amount: '10.00', status: 'paid' },
	{ gameId: 'g4', amount: '10.00', status: 'paid' },
	// Marked paid, not yet confirmed by the admin — in the pot, so staked.
	{ gameId: 'g5', amount: '10.00', status: 'claimed' },
	{ gameId: 'g6', amount: '5.00', status: 'paid' },
	// A total wipeout: every stake handed back, so the game nets to nothing.
	{ gameId: 'g7', amount: '5.00', status: 'refunded' },
	// g8 has no rows at all — the free game.
	{ gameId: 'g9', amount: '20.00', status: 'paid' },
]

/**
 * The two games that paid out. Both rows are `pending`, which is the only status
 * a real payout ever carries — nothing in the app advances one — so a summary
 * that filtered on status would show these winners nothing.
 */
const PAYOUTS: SummaryPayoutRow[] = [
	{ gameId: 'g2', amount: '30.00', status: 'pending' },
	// Two shared pots: a split payout is the winner's share, not the pot.
	{ gameId: 'g6', amount: '12.50', status: 'pending' },
	{ gameId: 'g9', amount: '24.00', status: 'pending' },
]

/**
 * A player with a few seasons behind them, viewing their whole career: games
 * won and lost, picks that came off and picks that didn't, a couple of picks a
 * cup life absorbed, and a club they clearly can't leave alone. Every mode has
 * been played, so all three sections are populated — classic with its depth and
 * its round one, turbo and cup with their streaks.
 *
 * Classic's round one is the state worth reviewing: two of the four opening
 * picks came off, both of the two that went down were in games offering a rebuy,
 * and only one was bought back into — so the rebuy figure reads against those
 * two rather than against all four games. The one that wasn't is g1, which holds
 * picks in later rounds all the same: advance picks locked in before the player
 * went out, which the elimination round is what tells apart from a rebuy.
 *
 * Then the Teams section, one block per
 * competition family — the two league seasons pooled into one ranking
 * (Liverpool's five picks can't come from a single season) and the World Cup
 * standing separately, never merged into it. England carries a pick a life
 * absorbed alongside its rate; Italy, whose only pick a life absorbed, has no
 * rate at all and so appears in neither end while still being listed in the
 * expansion.
 */
export const FULL_HISTORY_SUMMARY: MeSummaryView = buildMeSummaryView({
	games: GAMES,
	picks: PICKS,
	streakPicks: STREAK_PICKS,
	payments: PAYMENTS,
	payouts: PAYOUTS,
	filters: { season: null },
})

/**
 * The money out of a built summary — what the fold hides. Pulled out so the
 * gallery can render the *opened* state without a click: the fold's own half
 * owns whether the panel is on screen, and this is everything it hides.
 */
function moneyOf(view: MeSummaryView): MoneySummary {
	if (view.kind !== 'summary') throw new Error('fixture built no summary to read money from')
	return view.money
}

export const FULL_HISTORY_MONEY = moneyOf(FULL_HISTORY_SUMMARY)

/**
 * The same history with two of its team blocks narrowed by their own season
 * controls — the state a link into the page arrives in.
 *
 * The league block is narrowed to 2025/26, so its ranking is the one season's
 * picks (Liverpool's five drop to three) while its control still offers the
 * season it narrowed away from. The World Cup block is narrowed to an edition
 * this player never played — a season absent from its own control, which is
 * exactly what a link shared by a player with a different history does — so it
 * states the empty season rather than a record of noughts. Everything above the
 * Teams section is unmoved: the headline and the mode sections are all-time.
 */
export const FILTERED_SEASON_SUMMARY: MeSummaryView = buildMeSummaryView({
	games: GAMES,
	picks: PICKS,
	streakPicks: STREAK_PICKS,
	filters: {
		season: null,
		teamSeasons: { [PREMIER_LEAGUE_FAMILY_KEY]: '2025/26', [WORLD_CUP_FAMILY_KEY]: '2022' },
	},
})

/**
 * A classic-only player, one game in and still alive in it. The two modes they
 * have never touched state their own absence, and the one turbo game that is
 * still being played contributes no streak — the state that shows a section can
 * have games behind it and still have nothing to average.
 *
 * Built from rows through the real builder like the history above, so the empty
 * streak is one the builder actually produces from a game that hasn't completed
 * rather than a null written in by hand.
 */
const CLASSIC_ONLY_GAMES: SummaryGameRow[] = [
	{
		gameId: 'c1',
		gameName: 'Work League',
		gameMode: 'classic',
		gameStatus: 'completed',
		playerStatus: 'eliminated',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
	{
		gameId: 'c2',
		gameName: 'Family Survivor',
		gameMode: 'classic',
		gameStatus: 'active',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
	// The turbo game is still being played, so it has a record and no streak.
	{
		gameId: 'c3',
		gameName: 'First Turbo',
		gameMode: 'turbo',
		gameStatus: 'active',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
	},
]

const CLASSIC_ONLY_PICKS: SummaryPickRow[] = [
	...played('c1', { ARS: 'W', LIV: 'W', CHE: 'L' }),
	...played('c2', { ARS: 'W', MCI: 'W', NEW: 'W', EVE: 'P' }),
	...played('c3', { ARS: 'W', BOU: 'P' }),
]

export const CLASSIC_ONLY_SUMMARY: MeSummaryView = buildMeSummaryView({
	games: CLASSIC_ONLY_GAMES,
	picks: CLASSIC_ONLY_PICKS,
	// No payment or payout rows anywhere: three free games, so the fold opens onto
	// noughts and no breakdown at all rather than a list of games that cost
	// nothing and lost.
	filters: { season: null },
})

/** The money of a player who has only ever played for nothing. */
export const FREE_GAMES_ONLY_MONEY = moneyOf(CLASSIC_ONLY_SUMMARY)

/**
 * One game, created after gameweek one's deadline, with its opening round still
 * to come.
 *
 * A game opens at the competition's earliest still-pickable round, so this one's
 * round one is gameweek 12 — a first hurdle all the same, and one nobody has
 * been put to yet. The pick sitting on it hasn't settled, so the game is neither
 * a survival nor an exit and drops out of the rate's denominator: the rate says
 * it has nothing to divide rather than showing a nought the player never earned.
 * A round one a cancelled fixture voided reads exactly the same way.
 *
 * Built from rows through the real builder, like every fixture above, so the
 * empty rate is one the builder actually produces.
 */
const UNSETTLED_ROUND_ONE_GAMES: SummaryGameRow[] = [
	{
		gameId: 'u1',
		gameName: 'Late Starters',
		gameMode: 'classic',
		gameStatus: 'active',
		playerStatus: 'alive',
		...ME,
		...OPENED_AT_ROUND_ONE,
		...PL_2526,
		firstRoundNumber: 12,
	},
]

const UNSETTLED_ROUND_ONE_PICKS: SummaryPickRow[] = played('u1', { ARS: 'P' }, 12)

export const UNSETTLED_ROUND_ONE_SUMMARY: MeSummaryView = buildMeSummaryView({
	games: UNSETTLED_ROUND_ONE_GAMES,
	picks: UNSETTLED_ROUND_ONE_PICKS,
	filters: { season: null },
})
