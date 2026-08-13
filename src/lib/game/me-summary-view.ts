/**
 * The player's own summary page (`/me`) as one pure view model.
 *
 * Every figure the page shows is derived here from plain rows, so the page is a
 * renderer with no branching of its own — the same split as `buildGameView`.
 * The rows are deliberately dumb: ids, names, enum values. No Drizzle types, no
 * dates that only make sense against a live competition.
 *
 * The one thing this file does not work out for itself is a single-round
 * streak: that comes from `resolveWipeout`, the same function that decides who
 * won a turbo or cup game. A summary that computed its own streak could
 * disagree with the result screen, so it doesn't compute one.
 */

import { resolveWipeout } from '@/lib/game-logic/auto-complete-tiebreakers'

export type SummaryGameMode = 'classic' | 'turbo' | 'cup'

export type SummaryPickResult = 'pending' | 'win' | 'loss' | 'draw' | 'saved_by_life' | 'void'

/** One game the player has entered. */
export interface SummaryGameRow {
	gameId: string
	gameMode: SummaryGameMode
	/** The player's own `game_player` row — which of a game's players is them. */
	gamePlayerId: string
	/** `game.status`. Only a completed game has a streak worth counting. */
	gameStatus: 'active' | 'completed'
	/** The competition season this game was played in — one mode sub-row per one of these. */
	competitionId: string
	competitionName: string
	/** `competition.season` — null for a competition that records none. */
	season: string | null
	/** `game_player.status` for this player. */
	playerStatus: 'alive' | 'eliminated' | 'winner'
	/**
	 * `game_player.eliminated_round_id` — the round the player went out in, or
	 * null while they're still in it. Read for one purpose only: a rebuy clears
	 * it, so a row still pointing at round one is a player who *didn't* buy back
	 * in, whatever picks they may have left lying in later rounds.
	 */
	eliminatedRoundId: string | null
	/**
	 * `game.mode_config.allowRebuys` — did this game let a round-one casualty buy
	 * back in? Classic's own flag: it's what decides whether a round-one loss
	 * eliminates at all, so it's also what decides whether playing on afterwards
	 * was a rebuy or just the starting-round exemption.
	 */
	allowRebuys: boolean
	/**
	 * `round.number` of this game's **own** first playable round — its round one.
	 *
	 * Not the competition's gameweek one: a game is created at the competition's
	 * earliest still-pickable round, so a game started in November opens at
	 * gameweek 12 and gameweek 12 is the first hurdle its players were put to.
	 * Null for a game with no picks in it at all, which has no round one to read.
	 */
	firstRoundNumber: number | null
}

/** One pick the player made, in whichever game and round. */
export interface SummaryPickRow {
	gameId: string
	/** Which round of that game — classic counts its depth in these. */
	roundId: string
	/**
	 * `round.number` — which round of the competition this pick was made in.
	 * Round one is the one the game turns on: it's the round the engine exempts
	 * from elimination in a no-rebuys game, and the only round a rebuy follows.
	 */
	roundNumber: number
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
 * One settled pick in a single-round game (turbo or cup) — from *any* player in
 * that game, the summary's owner included.
 *
 * Rivals' picks are here because the rank a streak counts from is a
 * cross-player fact: the game restarts at the lowest rank anybody got right, so
 * the player's own picks alone can't say where their streak began. Void and
 * pending picks are left out by the row source, exactly as the engine's own
 * collectors leave them out.
 */
export interface SummaryStreakPickRow {
	gameId: string
	gamePlayerId: string
	/** `pick.confidence_rank` — 1 is the most confident. */
	confidenceRank: number
	result: SummaryPickResult
	/**
	 * `game_player.status` of whoever made this pick. Turbo's engine resolves
	 * over the players still standing, so a player the game went on without
	 * (an admin removal, say) can't set the rank a turbo streak starts from.
	 */
	playerStatus: 'alive' | 'eliminated' | 'winner'
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
	/** Empty for a player who has only ever played classic. */
	streakPicks?: SummaryStreakPickRow[]
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

/**
 * One mode's record within a single competition season — the sub-row under a
 * mode section. Kept per season rather than per competition family: a season is
 * the unit a game is actually played in, and the page's own season filter is
 * what collapses them.
 */
export interface CompetitionRecord {
	competitionId: string
	name: string
	gamesPlayed: number
	gamesWon: number
	/** wins ÷ played. Never null — a sub-row exists only where a game was played. */
	winRate: number
}

/**
 * How long the player's runs of correct picks tend to be in a single-round
 * mode. Both figures are over completed games only — a game still being played
 * has no settled streak to contribute, so it can't move the average.
 */
export interface StreakStats {
	/** The best run the player has put together. Null until a game has completed. */
	longest: number | null
	/** Mean streak over `games`. Null until a game has completed. */
	average: number | null
	/** Completed games behind the two figures. */
	games: number
}

/**
 * How deep the player gets in classic — the mode where surviving *is* the game.
 *
 * Depth is the number of rounds the player held a pick in, which is the one
 * count a rebuy can't distort: buying back in clears the elimination round, so a
 * player who went out in round 1, rebought and lasted to round 8 has no
 * elimination round to read a depth of 8 from. Rounds held say it anyway.
 *
 * Unlike a streak, a round held is a fact the moment it's picked, so a game
 * still being played contributes what it has so far.
 */
export interface ClassicDepth {
	/** The deepest single run: the most rounds held in one game. */
	best: number
	/** Mean rounds held per classic game. */
	average: number
	/** Classic games behind the two figures. */
	games: number
}

/**
 * How the player fares at classic's first hurdle — the question a survivor
 * player asks about themselves before any other.
 *
 * Every figure here is read from the player's picks, never from their
 * `game_player` row: a rebuy clears the elimination round and reason, so a
 * rebought game leaves no trace on the player record. The picks survive it.
 */
export interface ClassicRoundOne {
	/** Classic games in scope. Not the rate's denominator — `settled` is. */
	games: number
	/**
	 * Games whose round-one pick resolved either way — the survival rate's
	 * denominator, and the same rule the accuracy rate and the streaks follow: a
	 * pick still waiting on kick-off, one a cancelled fixture voided, and a game
	 * that started after gameweek one and has no round one at all are none of
	 * them a hurdle the player has been put to yet.
	 */
	settled: number
	/** Games whose round-one pick came off. */
	survived: number
	/** survived ÷ settled. Null until a round one has settled. */
	survivalRate: number | null
	/**
	 * Games whose round-one pick went down. Not the same thing as going out: with
	 * rebuys switched off a lost round one doesn't eliminate at all (the
	 * starting-round exemption), so the page labels this by the pick rather than
	 * by an exit.
	 */
	exits: number
	/**
	 * Round-one exits in games that had rebuys switched on — the denominator for
	 * `rebought`. A game that never offered a way back can't be held against the
	 * player for not taking one.
	 */
	rebuyable: number
	/** Of those, the games the player bought back into. */
	rebought: number
}

/** Every mode gets a section, in the order the page reads them. */
export const SUMMARY_MODES: SummaryGameMode[] = ['classic', 'turbo', 'cup']

/** What every played mode section reports, whichever mode it is. */
export interface ModeRecord {
	gamesPlayed: number
	gamesWon: number
	/** wins ÷ played. Never null — a played section has at least one game. */
	winRate: number
	/** The same record split by competition season, deepest first. */
	competitions: CompetitionRecord[]
}

/**
 * One mode's record. `unplayed` is a mode the player has never entered in this
 * scope: the section says so in its own words rather than showing a row of
 * noughts, which would read as a bad record instead of no record.
 */
export type ModeSection =
	| { mode: SummaryGameMode; kind: 'unplayed' }
	| ({
			mode: 'classic'
			kind: 'played'
			depth: ClassicDepth
			roundOne: ClassicRoundOne
	  } & ModeRecord)
	| ({ mode: 'turbo' | 'cup'; kind: 'played'; streak: StreakStats } & ModeRecord)

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

function buildCompetitionRecords(games: SummaryGameRow[]): CompetitionRecord[] {
	const tally = new Map<string, CompetitionRecord>()
	for (const g of games) {
		const row = tally.get(g.competitionId) ?? {
			competitionId: g.competitionId,
			name: g.competitionName,
			gamesPlayed: 0,
			gamesWon: 0,
			winRate: 0,
		}
		row.gamesPlayed += 1
		if (g.playerStatus === 'winner') row.gamesWon += 1
		row.winRate = row.gamesWon / row.gamesPlayed
		tally.set(g.competitionId, row)
	}
	// Most-played first, then by name — a stable order that doesn't follow the
	// order the rows happened to arrive in.
	return [...tally.values()].sort(
		(a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name),
	)
}

/**
 * Did the pick keep the streak alive? Turbo asks only whether the prediction
 * came in; cup counts a handicapped draw and a pick a life absorbed as survived
 * — the same three results `checkCupCompletion` feeds the engine.
 */
function keepsStreakAlive(result: SummaryPickResult, mode: SummaryGameMode): boolean {
	if (result === 'win') return true
	if (mode !== 'cup') return false
	return result === 'draw' || result === 'saved_by_life'
}

/**
 * The player's streak in one completed single-round game, as the engine that
 * decided that game worked it out.
 *
 * `resolveWipeout` is handed every player's picks because the rank the streak
 * counts from is the lowest rank *anyone* got right. Goals are passed as zero
 * throughout: they only feed the tiebreaks between players, and the only thing
 * read back here is the streak length.
 */
function streakInGame(
	game: SummaryGameRow,
	streakPicks: SummaryStreakPickRow[],
	mode: SummaryGameMode,
): number {
	const byPlayer = new Map<string, SummaryStreakPickRow[]>()
	// The player themselves always has an entry, even with no picks at all —
	// a game they sat out is a streak of nothing, not a missing game.
	byPlayer.set(game.gamePlayerId, [])
	// Whose picks the engine resolved over: turbo's collector takes the players
	// still standing, cup's takes every player the game ever had. Matching each
	// decides the rank the streak counts from, which is the whole point of
	// reading it from the engine rather than recomputing it. The rule applies to
	// the player themselves too: a turbo game that finished without them (they
	// were removed) decided nothing about their streak, so it reads as nothing.
	const resolvedOver =
		mode === 'cup' ? streakPicks : streakPicks.filter((row) => row.playerStatus !== 'eliminated')
	for (const row of resolvedOver) {
		const existing = byPlayer.get(row.gamePlayerId)
		if (existing) existing.push(row)
		else byPlayer.set(row.gamePlayerId, [row])
	}

	const outcome = resolveWipeout(
		[...byPlayer.entries()].map(([gamePlayerId, rows]) => ({
			gamePlayerId,
			livesRemaining: 0,
			picks: rows.map((row) => ({
				rank: row.confidenceRank,
				correct: keepsStreakAlive(row.result, mode),
				goals: 0,
			})),
		})),
	)
	// A total wipeout — nobody got a single pick right — is a streak of zero, not
	// a game to leave out: the player played it and got nowhere.
	if (outcome.totalWipeout) return 0
	return outcome.scores.find((s) => s.gamePlayerId === game.gamePlayerId)?.streak ?? 0
}

function buildStreakStats(
	games: SummaryGameRow[],
	streakPicks: SummaryStreakPickRow[],
	mode: SummaryGameMode,
): StreakStats {
	const completed = games.filter((g) => g.gameStatus === 'completed')
	if (completed.length === 0) return { longest: null, average: null, games: 0 }
	const streaks = completed.map((g) =>
		streakInGame(
			g,
			streakPicks.filter((row) => row.gameId === g.gameId),
			mode,
		),
	)
	const total = streaks.reduce((sum, streak) => sum + streak, 0)
	return {
		longest: Math.max(...streaks),
		average: total / streaks.length,
		games: streaks.length,
	}
}

function buildClassicDepth(games: SummaryGameRow[], picks: SummaryPickRow[]): ClassicDepth {
	// Every pick the player holds counts, whatever became of it: a pick voided by
	// a cancelled fixture, and a pick still waiting on kick-off, were both a round
	// the player was in the game for.
	const roundsHeld = games.map(
		(g) => new Set(picks.filter((p) => p.gameId === g.gameId).map((p) => p.roundId)).size,
	)
	const total = roundsHeld.reduce((sum, rounds) => sum + rounds, 0)
	return {
		best: Math.max(...roundsHeld),
		average: total / roundsHeld.length,
		games: roundsHeld.length,
	}
}

/**
 * The player's round-one record across their classic games.
 *
 * Round one is `round.number === 1` — the same round the engine exempts from
 * elimination in a no-rebuys game and the only one a rebuy follows, so this
 * agrees with what the game itself did rather than with a second definition of
 * "the first round".
 *
 * A game with no settled round-one pick is neither a survival nor an exit, and
 * is out of the rate's denominator entirely — the picks are all this reads, and
 * they don't say. Three ways that happens, all of them ordinary: round one
 * hasn't kicked off yet, a cancelled fixture voided the pick, or the game was
 * created after gameweek one's deadline and has no round one at all (game
 * creation starts a game at the competition's earliest still-pickable round).
 * Such a game still counts in `games`, so the page can say what the rate is
 * over, but it can't drag the rate down to a nought the player never earned. A
 * fourth way is not ordinary and is the second knowing miss below: a round one
 * the player never picked in at all.
 *
 * Two cases this knowingly misses, both of them the price of reading picks
 * rather than payments, and neither of them fixable without a figure that would
 * be wrong in the other direction:
 *
 * 1. A player who bought back in and then never picked again is eliminated in
 *    round two as `missed_rebuy_pick`, and leaves no later pick behind to show
 *    the rebuy. Reading that off the player row would mean trusting
 *    `eliminated_reason`, which is only written as `missed_rebuy_pick` when a
 *    second *payment* row exists — so it would miss the free games this whole
 *    block exists to get right. A rebuy nobody picked with reads as no rebuy.
 * 2. A player who missed round one's deadline in a game that had rebuys switched
 *    on went out with no pick row at all: round one deliberately has no
 *    auto-pick fallback, so `handleNoPicks` eliminates them as
 *    `no_pick_no_fallback` and writes nothing (`no-pick-handler.ts`; with rebuys
 *    off the same path leaves them alone, exempt). With no round-one pick to
 *    read, that game is neither a survival nor an exit and sits outside the
 *    rate — it flatters the player by the width of one game. The elimination
 *    round *number* would catch the ones who stayed out, but not the ones who
 *    bought back in (the rebuy clears the round), so counting it would trade a
 *    silent omission for a rebuy figure that states a nought against a player
 *    who did buy back in. The omission is the quieter error of the two.
 */
function buildClassicRoundOne(games: SummaryGameRow[], picks: SummaryPickRow[]): ClassicRoundOne {
	let survived = 0
	let exits = 0
	let rebuyable = 0
	let rebought = 0
	for (const g of games) {
		const firstRound = g.firstRoundNumber
		if (firstRound === null) continue
		const own = picks.filter((p) => p.gameId === g.gameId)
		const roundOne = own.find((p) => p.roundNumber === firstRound)
		// Classic carries no handicap and no lives: only a win gets you through.
		if (roundOne?.result === 'win') {
			survived += 1
			continue
		}
		if (roundOne?.result !== 'loss' && roundOne?.result !== 'draw') continue
		exits += 1
		if (!g.allowRebuys) continue
		rebuyable += 1
		// A pick after round one is the rebuy showing through: without buying back
		// in there'd have been nothing left to pick with. No payment row is
		// consulted, because a free game has none and a rebuy in one still
		// happened. The elimination round is the cross-check the picks can't make
		// on their own: classic accepts advance picks for later rounds and doesn't
		// delete them when a player goes out, so a locked round-3 pick would
		// otherwise read as a rebuy the player never took.
		const stillOutFromRoundOne = g.eliminatedRoundId === roundOne.roundId
		const playedOn = own.some((p) => p.roundNumber > firstRound)
		if (!stillOutFromRoundOne && playedOn) rebought += 1
	}
	const settled = survived + exits
	return {
		games: games.length,
		settled,
		survived,
		survivalRate: settled === 0 ? null : survived / settled,
		exits,
		rebuyable,
		rebought,
	}
}

function buildModeSection(
	mode: SummaryGameMode,
	games: SummaryGameRow[],
	picks: SummaryPickRow[],
	streakPicks: SummaryStreakPickRow[],
): ModeSection {
	const played = games.filter((g) => g.gameMode === mode)
	if (played.length === 0) return { mode, kind: 'unplayed' }
	const gamesWon = played.filter((g) => g.playerStatus === 'winner').length
	const record: ModeRecord = {
		gamesPlayed: played.length,
		gamesWon,
		winRate: gamesWon / played.length,
		competitions: buildCompetitionRecords(played),
	}
	if (mode === 'classic') {
		return {
			mode,
			kind: 'played',
			...record,
			depth: buildClassicDepth(played, picks),
			roundOne: buildClassicRoundOne(played, picks),
		}
	}
	return {
		mode,
		kind: 'played',
		...record,
		streak: buildStreakStats(played, streakPicks, mode),
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
	const scopedPicks = input.picks.filter((p) => modeOf.has(p.gameId))
	const countedPicks = scopedPicks.filter(counts)
	const streakPicks = (input.streakPicks ?? []).filter((p) => modeOf.has(p.gameId))
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
		modes: SUMMARY_MODES.map((mode) => buildModeSection(mode, games, scopedPicks, streakPicks)),
	}
}
