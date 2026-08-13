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
	/**
	 * `pick.is_auto` — the no-pick fallback made this one. Carried so the rule is
	 * stated rather than implied: a fallback pick counts everywhere an ordinary
	 * pick does, and nothing downstream of here flags it. Deliberately unread.
	 */
	isAuto: boolean
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
	/**
	 * Picks a life absorbed. Neither a success nor a failure — the pick lost but
	 * the player didn't — so they're out of both halves of the rate and carried
	 * here on their own.
	 */
	savedByLife: number
}

/** The club the player keeps going back to. */
export interface MostPickedTeam {
	teamId: string
	name: string
	shortName: string
	badgeUrl: string | null
	/** How many of the player's picks it accounts for. */
	picks: number
}

/** The figures at the top of the page: a career in five numbers. */
export interface CareerHeadline {
	gamesPlayed: number
	gamesWon: number
	/** wins ÷ played, as a fraction. Null when nothing has been played. */
	winRate: number | null
	pickAccuracy: PickAccuracy
	/** Null until the player has a pick that counts. */
	mostPickedTeam: MostPickedTeam | null
}

/** Every mode gets a section, in the order the page reads them. */
export const SUMMARY_MODES: SummaryGameMode[] = ['classic', 'turbo', 'cup']

/**
 * One mode's record. `unplayed` is a mode the player has never entered in this
 * scope: the section says so in its own words rather than showing a row of
 * noughts, which would read as a bad record instead of no record.
 */
export type ModeSection =
	| { mode: SummaryGameMode; kind: 'unplayed' }
	| {
			mode: SummaryGameMode
			kind: 'played'
			gamesPlayed: number
			gamesWon: number
			/** wins ÷ played. Never null — a played section has at least one game. */
			winRate: number
	  }

/**
 * `empty` is a player with no games in scope — the page says so rather than
 * rendering a wall of zeros, which is why it's a variant and not a headline of
 * noughts.
 */
export type MeSummaryView =
	| { kind: 'empty'; filters: SummaryFilters }
	| {
			kind: 'summary'
			filters: SummaryFilters
			headline: CareerHeadline
			/** One per mode, always all three, in `SUMMARY_MODES` order. */
			modes: ModeSection[]
	  }

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

/**
 * Is the pick part of the player's record at all? A pending pick hasn't
 * happened yet and a void one never will, so neither says anything about how
 * the player picks.
 */
function counts(row: SummaryPickRow): boolean {
	return row.result !== 'pending' && row.result !== 'void'
}

function findMostPickedTeam(picks: SummaryPickRow[]): MostPickedTeam | null {
	const tally = new Map<string, MostPickedTeam>()
	for (const row of picks) {
		const seen = tally.get(row.teamId)
		if (seen) {
			seen.picks += 1
			continue
		}
		tally.set(row.teamId, {
			teamId: row.teamId,
			name: row.teamName,
			shortName: row.teamShortName,
			badgeUrl: row.teamBadgeUrl,
			picks: 1,
		})
	}
	// Ties fall to the alphabetically-first club — the same last-resort tiebreak
	// the opening table uses, so the headline reads the same on every render
	// rather than following row order.
	const ranked = [...tally.values()].sort(
		(a, b) => b.picks - a.picks || a.name.localeCompare(b.name),
	)
	return ranked[0] ?? null
}

function buildModeSection(mode: SummaryGameMode, games: SummaryGameRow[]): ModeSection {
	const played = games.filter((g) => g.gameMode === mode)
	if (played.length === 0) return { mode, kind: 'unplayed' }
	const gamesWon = played.filter((g) => g.playerStatus === 'winner').length
	return {
		mode,
		kind: 'played',
		gamesPlayed: played.length,
		gamesWon,
		winRate: gamesWon / played.length,
	}
}

export function buildMeSummaryView(input: BuildMeSummaryInput): MeSummaryView {
	const season = input.filters.season
	const games = season === null ? input.games : input.games.filter((g) => g.season === season)
	if (games.length === 0) return { kind: 'empty', filters: input.filters }

	const gamesWon = games.filter((g) => g.playerStatus === 'winner').length

	const modeOf = new Map(games.map((g) => [g.gameId, g.gameMode]))

	// A pick belongs to the scope its game does, so filtering the games filters
	// the picks with them.
	const countedPicks = input.picks.filter((p) => modeOf.has(p.gameId) && counts(p))
	const settledPicks = countedPicks.filter((p) => isSettled(p, modeOf.get(p.gameId)))
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
				savedByLife: countedPicks.filter((p) => p.result === 'saved_by_life').length,
			},
			mostPickedTeam: findMostPickedTeam(countedPicks),
		},
		modes: SUMMARY_MODES.map((mode) => buildModeSection(mode, games)),
	}
}
