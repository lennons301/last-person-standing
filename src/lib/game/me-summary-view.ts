/**
 * The player's own summary page (`/me`) as one pure view model.
 *
 * Every figure the page shows is derived here from plain rows, so the page is a
 * renderer with no branching of its own — the same split as `buildGameView`.
 * The rows are deliberately dumb: ids, names, enum values. No Drizzle types, no
 * dates that only make sense against a live competition.
 */

export type SummaryGameMode = 'classic' | 'turbo' | 'cup'

export type SummaryPickResult = 'pending' | 'win' | 'loss' | 'draw' | 'saved_by_life' | 'void'

/** One game the player has entered. */
export interface SummaryGameRow {
	gameId: string
	gameMode: SummaryGameMode
	/** `competition.season` — null for a competition that records none. */
	season: string | null
	/** `game_player.status` for this player. */
	playerStatus: 'alive' | 'eliminated' | 'winner'
}

/** One pick the player made, in whichever game and round. */
export interface SummaryPickRow {
	gameId: string
	teamId: string
	teamName: string
	teamShortName: string
	teamBadgeUrl: string | null
	result: SummaryPickResult
}

/**
 * What the page is scoped to. `season: null` is the career — every game the
 * player has ever entered.
 */
export interface SummaryFilters {
	season: string | null
}

export interface BuildMeSummaryInput {
	games: SummaryGameRow[]
	picks: SummaryPickRow[]
	filters: SummaryFilters
}

/**
 * How the player's picks have gone. `settled` is the denominator, so it counts
 * only picks that resolved into a success or a failure.
 */
export interface PickAccuracy {
	/** Picks that came off. */
	successful: number
	/** Picks that resolved either way — the denominator. */
	settled: number
	/** successful ÷ settled, as a fraction. Null when nothing has settled. */
	rate: number | null
}

/** The figures at the top of the page: a career in five numbers. */
export interface CareerHeadline {
	gamesPlayed: number
	gamesWon: number
	/** wins ÷ played, as a fraction. Null when nothing has been played. */
	winRate: number | null
	pickAccuracy: PickAccuracy
}

/**
 * `empty` is a player with no games in scope — the page says so rather than
 * rendering a wall of zeros, which is why it's a variant and not a headline of
 * noughts.
 */
export type MeSummaryView =
	| { kind: 'empty'; filters: SummaryFilters }
	| { kind: 'summary'; filters: SummaryFilters; headline: CareerHeadline }

/**
 * Did the pick come off? A win everywhere, plus cup's draw — cup scores a draw
 * against a higher tier as a result worth having, so the accuracy figure has to
 * agree with the mode the pick was made in.
 */
function isSuccess(row: SummaryPickRow, mode: SummaryGameMode | undefined): boolean {
	if (row.result === 'win') return true
	return row.result === 'draw' && mode === 'cup'
}

/** Did the pick resolve either way? Successes plus outright failures. */
function isSettled(row: SummaryPickRow, mode: SummaryGameMode | undefined): boolean {
	return isSuccess(row, mode) || row.result === 'loss' || row.result === 'draw'
}

export function buildMeSummaryView(input: BuildMeSummaryInput): MeSummaryView {
	const games = input.games
	if (games.length === 0) return { kind: 'empty', filters: input.filters }

	const gamesWon = games.filter((g) => g.playerStatus === 'winner').length

	const modeOf = new Map(games.map((g) => [g.gameId, g.gameMode]))

	const settledPicks = input.picks.filter((p) => isSettled(p, modeOf.get(p.gameId)))
	const successful = settledPicks.filter((p) => isSuccess(p, modeOf.get(p.gameId))).length

	return {
		kind: 'summary',
		filters: input.filters,
		headline: {
			gamesPlayed: games.length,
			gamesWon,
			winRate: gamesWon / games.length,
			pickAccuracy: {
				successful,
				settled: settledPicks.length,
				rate: settledPicks.length === 0 ? null : successful / settledPicks.length,
			},
		},
	}
}
