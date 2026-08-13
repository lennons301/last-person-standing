/**
 * The player's own summary page (`/me`) as one pure view model.
 *
 * Every figure the page shows is derived here from plain rows, so the page is a
 * renderer with no branching of its own — the same split as `buildGameView`.
 * The rows are deliberately dumb: ids, names, enum values. No Drizzle types, no
 * dates that only make sense against a live competition.
 */

import { COMPETITION_FAMILY_NAMES } from '@/lib/game/competition-family'

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
	/** The competition this game is played on — one *season* of a family. */
	competitionId: string
	/** `competition.name`, season included ("Premier League 2025/26"). */
	competitionName: string
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

function buildTeamRecords(
	games: SummaryGameRow[],
	picks: SummaryPickRow[],
	modeOf: Map<string, SummaryGameMode>,
): TeamRecordFamily[] {
	const familyOfGame = new Map(games.map((g) => [g.gameId, familyOf(g)]))
	const families = new Map<string, { name: string; teams: Map<string, TeamRecord> }>()

	for (const row of picks) {
		const family = familyOfGame.get(row.gameId)
		if (!family) continue
		let block = families.get(family.key)
		if (!block) {
			block = { name: family.name, teams: new Map() }
			families.set(family.key, block)
		}
		let record = block.teams.get(row.teamId)
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
			block.teams.set(row.teamId, record)
		}
		record.picks += 1
		if (isSuccess(row, modeOf.get(row.gameId))) record.wins += 1
		if (row.result === 'saved_by_life') record.savedByLife += 1
	}

	const blocks = [...families.entries()].map(([familyKey, block]) => {
		const all = [...block.teams.values()]
			.map((record) => {
				const rated = record.picks - record.savedByLife
				return { ...record, rate: rated === 0 ? null : record.wins / rated }
			})
			.sort(byRate)
		// Only a team with a rate can be at either end of a ranking by rate: a team
		// every one of whose picks a life absorbed would otherwise land in the worst
		// list, which is a verdict its picks never delivered.
		const ranked = all.filter((record) => record.rate !== null)
		return { familyKey, name: block.name, best: bestOf(ranked), worst: worstOf(ranked), all }
	})

	// The family the player has picked in most leads, since that's the record they
	// came to read. Name breaks a tie, so the order is the player's history and
	// never the order rows happened to arrive in.
	return blocks.sort((a, b) => pickCount(b.all) - pickCount(a.all) || a.name.localeCompare(b.name))
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

function pickCount(records: TeamRecord[]): number {
	return records.reduce((total, record) => total + record.picks, 0)
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
		teamRecords: buildTeamRecords(games, countedPicks, modeOf),
	}
}
