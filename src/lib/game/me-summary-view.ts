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

import { COMPETITION_FAMILY_NAMES } from '@/lib/game/competition-family'
import { resolveWipeout } from '@/lib/game-logic/auto-complete-tiebreakers'

export type SummaryGameMode = 'classic' | 'turbo' | 'cup'

export type SummaryPickResult = 'pending' | 'win' | 'loss' | 'draw' | 'saved_by_life' | 'void'

/** One game the player has entered. */
export interface SummaryGameRow {
	gameId: string
	/** `game.name` — what the players call it, and how a money row names itself. */
	gameName: string
	gameMode: SummaryGameMode
	/** The player's own `game_player` row — which of a game's players is them. */
	gamePlayerId: string
	/** `game.status`. Only a completed game has a streak worth counting. */
	gameStatus: 'active' | 'completed'
	/**
	 * The competition this game is played on — one *season* of a family, and the
	 * unit one mode sub-row is reported per.
	 */
	competitionId: string
	/** `competition.name`, season included ("Premier League 2025/26"). */
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
	 * back in? Classic's own flag, and the one that decides whether playing on
	 * after a lost round one was a rebuy or just the starting-round exemption
	 * carrying the player forward.
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
	/**
	 * `competition.family_key` — the family every season of this competition
	 * shares. Null for a competition that belongs to none, which stands alone
	 * rather than pooling with every other unfamilied competition.
	 */
	competitionFamilyKey: string | null
}

/** One pick the player made, in whichever game and round. */
export interface SummaryPickRow {
	gameId: string
	/** Which round of that game — classic counts its depth in these. */
	roundId: string
	/**
	 * `round.number` — which round of the competition this pick was made in.
	 * Compared against the game's own `firstRoundNumber` to tell its round one
	 * from the rounds a rebuy bought: the two are the same only for a game that
	 * started at the competition's gameweek one.
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
 * One `payment` row of the player's: their entry into a game, or a rebuy's
 * second entry. Amounts are numeric strings, as every money column in this
 * codebase is.
 */
export interface SummaryPaymentRow {
	gameId: string
	amount: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded'
}

/**
 * One `payout` row of the player's — what a game paid them for winning it.
 *
 * The status is carried and deliberately never read: nothing in the app
 * advances a payout past `pending`, so a summary that filtered on it would tell
 * every winner they had won nothing.
 */
export interface SummaryPayoutRow {
	gameId: string
	amount: string
	status: 'pending' | 'completed'
}

/**
 * What the page is scoped to. `season: null` is the career — every game the
 * player has ever entered.
 */
export interface SummaryFilters {
	season: string | null
	/**
	 * Which single season each competition family's team block is narrowed to,
	 * keyed by family key. A family with no entry pools every season it has.
	 *
	 * Per family rather than page-wide because families count seasons in
	 * incompatible vocabularies — "2025/26" means nothing to a World Cup side —
	 * and because the team blocks are the only part of the page it applies to: the
	 * career headline and the mode sections are all-time whatever is selected
	 * here.
	 */
	teamSeasons?: Record<string, string>
}

/**
 * The search-param prefix a family's team-season selection is carried under:
 * `/me?teams-premier-league=2025%2F26`.
 *
 * The URL is where this state lives so the page can stay a server component —
 * a selection survives a refresh and travels in a link, and nothing on the page
 * has to fetch anything to honour it.
 */
const TEAM_SEASON_PARAM_PREFIX = 'teams-'

/** The parameter one family's selection is carried in. */
export function teamSeasonParam(familyKey: string): string {
	return `${TEAM_SEASON_PARAM_PREFIX}${familyKey}`
}

/**
 * The team-season selections a request's search params carry, as
 * `SummaryFilters.teamSeasons` wants them. Anything else in the URL is left
 * alone, and an empty value reads as no selection rather than as a season no
 * competition has.
 */
export function parseTeamSeasonFilters(
	searchParams: Record<string, string | string[] | undefined>,
): Record<string, string> {
	const selections: Record<string, string> = {}
	for (const [key, value] of Object.entries(searchParams)) {
		if (!key.startsWith(TEAM_SEASON_PARAM_PREFIX)) continue
		const season = Array.isArray(value) ? value[0] : value
		if (!season) continue
		selections[key.slice(TEAM_SEASON_PARAM_PREFIX.length)] = season
	}
	return selections
}

/**
 * The query string for changing one family's season, every other family's
 * selection carried through — the href behind one option of one block's
 * control. `null` clears the family, which is what "all seasons" is.
 */
export function teamSeasonQuery(
	selections: Record<string, string>,
	familyKey: string,
	season: string | null,
): string {
	const next = { ...selections }
	if (season === null) delete next[familyKey]
	else next[familyKey] = season
	const params = new URLSearchParams(
		Object.entries(next).map(([key, value]) => [teamSeasonParam(key), value]),
	)
	return `?${params.toString()}`
}

export interface BuildMeSummaryInput {
	games: SummaryGameRow[]
	picks: SummaryPickRow[]
	/** Empty for a player who has only ever played classic. */
	streakPicks?: SummaryStreakPickRow[]
	/** Empty for a player who has only ever played free games. */
	payments?: SummaryPaymentRow[]
	/** Empty for a player who has never won a game with money in it. */
	payouts?: SummaryPayoutRow[]
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

/** How one team has served the player, within one competition family. */
export interface TeamRecord {
	teamId: string
	name: string
	shortName: string
	badgeUrl: string | null
	/** Every pick of this team that counts — successes, failures, saves alike. */
	picks: number
	/**
	 * Picks that came off: a win in any mode, plus cup's draw — the same rule the
	 * headline's accuracy uses, so the two figures can't disagree.
	 */
	wins: number
	/**
	 * Picks a life absorbed. The team still lost, and a team rate measures whether
	 * the *team* delivered, so these are out of both halves of `rate` and carried
	 * here on their own.
	 */
	savedByLife: number
	/** wins ÷ (picks − savedByLife). Null when a life absorbed every pick. */
	rate: number | null
}

/**
 * The player's record with the teams of one competition family.
 *
 * A family is the only scope a team record means anything in: a World Cup team
 * set and a Premier League team set are disjoint, so one league table across
 * both would compare nothing. Seasons *within* the family pool, because one
 * season yields far too few picks per team for a rate to say anything.
 */
export interface TeamRecordFamily {
	/** `competition.family_key`, or the competition's own id when it has none. */
	familyKey: string
	/** What to call the family — never a season. */
	name: string
	/**
	 * How many of the family's seasons the block pooled. Seasons that produced a
	 * pick, so it's what the ranking is actually built from — nought for a
	 * competition that records no season at all.
	 */
	seasons: number
	/**
	 * Every season this family has a pick in, most recent first — the choices its
	 * own season control offers. Listed per family and never across them: a league
	 * season reads "2025/26" and a World Cup "2026", so one control over both
	 * would offer seasons that mean nothing to half the teams under it.
	 *
	 * Never narrowed by the selection, so the control can always be changed or
	 * cleared — including from a season the player made no picks in.
	 */
	seasonOptions: string[]
	/** The season this block is narrowed to. Null is all of them. */
	selectedSeason: string | null
	/**
	 * The teams that have served the player best, best first. At most
	 * `ENDS_LENGTH`, and never more than the family's better half — so a family
	 * with four teams surfaces two, and no team is ever in both ends. Only teams
	 * with a rate are eligible for either end.
	 */
	best: TeamRecord[]
	/** The teams that have served the player worst, worst first. */
	worst: TeamRecord[]
	/** Every team the player has picked in this family, best first. */
	all: TeamRecord[]
}

/**
 * How many teams each end of a family surfaces before the expansion takes over.
 * Three is enough to read as a shortlist on a phone without becoming the list.
 */
export const ENDS_LENGTH = 3

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
 * "Round one" throughout is *the game's* first playable round, not the
 * competition's gameweek one: a game is created at the earliest still-pickable
 * round, so one started in November opens at gameweek 12 and that is the round
 * its players had to survive. `SummaryGameRow.firstRoundNumber` carries it.
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
	 * pick still waiting on kick-off, and one a cancelled fixture voided, are
	 * neither of them a hurdle the player has been put to yet.
	 */
	settled: number
	/** Games whose round-one pick came off. */
	survived: number
	/** survived ÷ settled. Null until a round one has settled. */
	survivalRate: number | null
	/**
	 * Games whose round-one pick went down. Not the same thing as going out: where
	 * the starting-round exemption applies, a lost round one doesn't eliminate at
	 * all, so the page labels this by the pick rather than by an exit.
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

/** What one game cost the player, and what it paid them back. */
export interface MoneyGameRecord {
	gameId: string
	/** `game.name`. */
	name: string
	competitionName: string
	gameMode: SummaryGameMode
	stake: string
	winnings: string
	net: string
}

/**
 * What the hobby has cost the player, or paid them.
 *
 * Every amount is a fixed-2 string, the same shape as the pot figures a game
 * page shows, so a player can reconcile the two by eye. `net` is winnings minus
 * stake, and is negative for most players — which is the whole reason the
 * section it lives in is folded shut.
 */
export interface MoneySummary {
	/** What the player has put in: payment rows that are paid or claimed. */
	stake: string
	/** What games have paid out to them. */
	winnings: string
	/** `winnings − stake`. Negative for a player down on the hobby. */
	net: string
	/**
	 * The same figures game by game, biggest loss first. Only games money was
	 * ever in: see `buildMoney`.
	 */
	games: MoneyGameRecord[]
	/**
	 * Games in scope with no money in them at all. They contribute nothing to any
	 * figure above and have no row of their own, so this is what lets the section
	 * say why its list is shorter than the games played.
	 */
	freeGames: number
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
			/** One block per competition family. Never a career-wide list. */
			teamRecords: TeamRecordFamily[]
			/** Profit and loss. Folded shut on the page, never on the model. */
			money: MoneySummary
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

/**
 * The family a game's picks belong to. A competition with no family key can't
 * pool with anything, so it stands alone under its own id — pooling every
 * unfamilied competition into one block would compare unrelated team sets,
 * which is the one thing this section exists to avoid.
 */
function familyOf(row: SummaryGameRow): { key: string; name: string } {
	if (row.competitionFamilyKey === null) {
		return { key: row.competitionId, name: row.competitionName }
	}
	return {
		key: row.competitionFamilyKey,
		name: COMPETITION_FAMILY_NAMES[row.competitionFamilyKey] ?? row.competitionName,
	}
}

/** One pick with the two things about its game a family block reads. */
interface FamilyPick {
	row: SummaryPickRow
	mode: SummaryGameMode
	season: string | null
}

/** The teams of one set of picks, ranked. */
function rankTeams(picks: FamilyPick[]): TeamRecord[] {
	const teams = new Map<string, TeamRecord>()
	for (const { row, mode } of picks) {
		let record = teams.get(row.teamId)
		if (!record) {
			record = {
				teamId: row.teamId,
				name: row.teamName,
				shortName: row.teamShortName,
				badgeUrl: row.teamBadgeUrl,
				picks: 0,
				wins: 0,
				savedByLife: 0,
				rate: null,
			}
			teams.set(row.teamId, record)
		}
		record.picks += 1
		if (isSuccess(row, mode)) record.wins += 1
		if (row.result === 'saved_by_life') record.savedByLife += 1
	}
	return [...teams.values()]
		.map((record) => {
			const rated = record.picks - record.savedByLife
			return { ...record, rate: rated === 0 ? null : record.wins / rated }
		})
		.sort(byRate)
}

/** The seasons a set of picks was made in, most recent first. */
function seasonsOf(picks: FamilyPick[]): string[] {
	const seasons = new Set(
		picks.map((p) => p.season).filter((season): season is string => season !== null),
	)
	// Season strings sort by their leading year in both vocabularies, so the most
	// recent leads without anything here having to parse a season.
	return [...seasons].sort().reverse()
}

function buildTeamRecords(
	games: SummaryGameRow[],
	picks: SummaryPickRow[],
	teamSeasons: Record<string, string>,
): TeamRecordFamily[] {
	const gameById = new Map(games.map((g) => [g.gameId, g]))
	const families = new Map<string, { name: string; picks: FamilyPick[] }>()

	for (const row of picks) {
		const gameRow = gameById.get(row.gameId)
		if (!gameRow) continue
		const family = familyOf(gameRow)
		let block = families.get(family.key)
		if (!block) {
			block = { name: family.name, picks: [] }
			families.set(family.key, block)
		}
		block.picks.push({ row, mode: gameRow.gameMode, season: gameRow.season })
	}

	const blocks = [...families.entries()].map(([familyKey, block]) => {
		const selectedSeason = teamSeasons[familyKey] ?? null
		// The selection narrows the records and nothing else: the options come off
		// every pick the family has, so a block narrowed to a season the player made
		// no picks in still carries the control that got it there.
		const scoped =
			selectedSeason === null ? block.picks : block.picks.filter((p) => p.season === selectedSeason)
		const all = rankTeams(scoped)
		// Only a team with a rate can be at either end of a ranking by rate: a team
		// every one of whose picks a life absorbed would otherwise land in the worst
		// list, which is a verdict its picks never delivered.
		const ranked = all.filter((record) => record.rate !== null)
		return {
			familyKey,
			name: block.name,
			seasons: seasonsOf(scoped).length,
			seasonOptions: seasonsOf(block.picks),
			selectedSeason,
			best: bestOf(ranked),
			worst: worstOf(ranked),
			all,
		}
	})

	// The family the player has picked in most leads, since that's the record they
	// came to read. Volume is counted over the family's whole history, so narrowing
	// one block to a season doesn't shuffle the page under the player. Name breaks
	// a tie, so the order is the player's history and never the order rows happened
	// to arrive in.
	const volume = new Map([...families].map(([key, block]) => [key, block.picks.length]))
	return blocks.sort(
		(a, b) =>
			(volume.get(b.familyKey) ?? 0) - (volume.get(a.familyKey) ?? 0) ||
			a.name.localeCompare(b.name),
	)
}

/**
 * Best team first. There is no minimum sample — a team picked once is ranked on
 * the one pick — so volume breaks a tie: at the same rate the larger sample is
 * the better-evidenced record and goes above. Name settles the rest, so the
 * order never depends on which row came back first.
 *
 * A team with no rate at all (every pick absorbed by a life) can't be compared
 * with teams that have one, so it sinks below all of them rather than reading as
 * the worst of them.
 */
function byRate(a: TeamRecord, b: TeamRecord): number {
	if (a.rate === null || b.rate === null) {
		if (a.rate !== b.rate) return a.rate === null ? 1 : -1
	} else if (a.rate !== b.rate) {
		return b.rate - a.rate
	}
	return b.picks - a.picks || a.name.localeCompare(b.name)
}

/**
 * The two ends split the ranking down the middle before either is capped, so a
 * team is never both a best and a worst — with four teams each end takes two,
 * and only from six upwards do both ends fill. An odd team out goes to the best
 * end, and a family of one has a best and no worst: one record is not two ends.
 */
function bestOf(ranked: TeamRecord[]): TeamRecord[] {
	return ranked.slice(0, Math.min(ENDS_LENGTH, Math.ceil(ranked.length / 2)))
}

/**
 * The worst end takes the bottom of the same ranking, but never a team on the
 * *best* rate in the family: with four teams on 100% and one on nothing, only
 * the one that lost has served the player worst. That leaves families whose
 * teams all share a rate with no worst end at all, which is the honest answer —
 * none of them let the player down more than the others.
 */
function worstOf(ranked: TeamRecord[]): TeamRecord[] {
	const bestRate = ranked[0]?.rate ?? null
	const candidates = ranked.filter((record) => record.rate !== bestRate)
	const take = Math.min(ENDS_LENGTH, Math.floor(ranked.length / 2), candidates.length)
	return candidates.slice(candidates.length - take).reverse()
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
 * Round one is the round *this game* started at — `firstRoundNumber`, the
 * lowest round anybody in the game ever picked in — because that is the first
 * hurdle its players were put to. A game created after gameweek one's deadline
 * starts at the competition's earliest still-pickable round, so its round one is
 * gameweek 12 or 24 and is a first round all the same. Note that the engine's
 * own starting-round exemption (`settleFixture`) and `isRebuyEligible` both key
 * off the *competition's* gameweek one instead, so for a mid-season game they
 * behave differently from what this block measures; the block follows the game.
 *
 * A game with no settled round-one pick is neither a survival nor an exit, and
 * is out of the rate's denominator entirely — the picks are all this reads, and
 * they don't say. Two ways that happens, both ordinary: round one hasn't kicked
 * off yet, or a cancelled fixture voided the pick. Such a game still counts in
 * `games`, so the page can say what the rate is over, but it can't drag the rate
 * down to a nought the player never earned. A third way is not ordinary and is
 * the second knowing miss below: a round one the player never picked in at all.
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
 * 2. A player who missed the deadline of a round one that *is* the competition's
 *    gameweek one, in a game with rebuys switched on, went out with no pick row
 *    at all: gameweek one deliberately has no auto-pick fallback, so
 *    `handleNoPicks` eliminates them as `no_pick_no_fallback` and writes nothing
 *    (`no-pick-handler.ts`; with rebuys off the same path leaves them alone,
 *    exempt). With no round-one pick to read, that game is neither a survival nor
 *    an exit and sits outside the rate — it flatters the player by the width of
 *    one game. A mid-season game's round one doesn't have this hole: a missed
 *    deadline there takes the ordinary auto-pick fallback, and a fallback pick
 *    counts exactly as a hand-made one. Reading the elimination round instead
 *    would catch the ones who stayed out but not the ones who bought back in
 *    (the rebuy clears it), so counting it would trade a silent omission for a
 *    rebuy figure that states a nought against a player who did buy back in. The
 *    omission is the quieter error of the two.
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

/**
 * Money is added up in whole pence: pounds as floats drift, and a career total
 * is a long addition.
 */
function pence(amount: string): number {
	return Math.round(Number.parseFloat(amount) * 100)
}

function pounds(total: number): string {
	return (total / 100).toFixed(2)
}

/**
 * A payment counts as staked when it is paid or claimed — exactly the rows
 * `calculatePot` counts, so a player's profit and loss reconciles with the pot
 * figure their game page shows. That leaves out what they still owe (pending)
 * and, deliberately, what a game gave back (refunded).
 */
function isStaked(row: SummaryPaymentRow): boolean {
	return row.status === 'paid' || row.status === 'claimed'
}

function buildMoney(
	games: SummaryGameRow[],
	payments: SummaryPaymentRow[],
	payouts: SummaryPayoutRow[],
): MoneySummary {
	const inScope = new Set(games.map((g) => g.gameId))
	const staked = payments.filter((row) => inScope.has(row.gameId) && isStaked(row))
	// Every payout row counts, its `status` read nowhere: see `SummaryPayoutRow`.
	const won = payouts.filter((row) => inScope.has(row.gameId))

	// A game money was never in — a free one — has nothing to report: a row of
	// noughts would read as a game that cost nothing and lost. It stays in games
	// played, where it belongs, and is counted here so the section can say how
	// many games its list leaves out.
	const withMoney = games.filter(
		(g) =>
			payments.some((row) => row.gameId === g.gameId) ||
			payouts.some((row) => row.gameId === g.gameId),
	)

	const perGame = withMoney.map((g) => {
		const gameStake = total(staked.filter((row) => row.gameId === g.gameId))
		const gameWon = total(won.filter((row) => row.gameId === g.gameId))
		return {
			gameId: g.gameId,
			name: g.gameName,
			competitionName: g.competitionName,
			gameMode: g.gameMode,
			stake: pounds(gameStake),
			winnings: pounds(gameWon),
			net: pounds(gameWon - gameStake),
		}
	})

	return {
		stake: pounds(total(staked)),
		winnings: pounds(total(won)),
		net: pounds(total(won) - total(staked)),
		freeGames: games.length - withMoney.length,
		// Biggest loss first: the figure the section exists to disclose leads, and a
		// win reads as the exception it is at the bottom. Name settles a tie, so the
		// order never follows the order rows arrived in.
		games: perGame.sort((a, b) => pence(a.net) - pence(b.net) || a.name.localeCompare(b.name)),
	}
}

function total(rows: { amount: string }[]): number {
	return rows.reduce((sum, row) => sum + pence(row.amount), 0)
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
		teamRecords: buildTeamRecords(games, countedPicks, input.filters.teamSeasons ?? {}),
		money: buildMoney(games, input.payments ?? [], input.payouts ?? []),
		modes: SUMMARY_MODES.map((mode) => buildModeSection(mode, games, scopedPicks, streakPicks)),
	}
}
