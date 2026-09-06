/**
 * The post-deadline **round summary**, derived.
 *
 * Once a classic round's picks are locked there is a story in them the progress
 * grid can't tell: who the crowd backed, who gambled, who is up against whom.
 * This is the one place that decides it. Both surfaces — the card under the grid
 * and the share dialog's text block — render what comes out and classify, order
 * and word nothing themselves.
 *
 * The summary has **two halves, and the round decides which one is the story**
 * (#267). Between the deadline and the first kick-off there are no results, so
 * the whole summary is the field and the market's read on it. From the moment a
 * *picked* fixture kicks off that read is being overtaken by what actually
 * happened, so `results` fills in — who came through, who went down, who is
 * still playing — and it is what the shared message says from then on. Both
 * halves are built from one pass over the same rows; nothing here reads the
 * clock to decide, only the fixtures' own state.
 *
 * Deterministic by construction: same rows in, same view out. Nothing here reads
 * the clock, queries, or calls a model. The prices are the ones the daily sync
 * already persisted per fixture, frozen at the round's deadline; the scores are
 * the ones the live poll writes.
 */
import { type ClassicSurvivalFixture, resolveClassicPickResult } from '@/lib/game/classic-survival'
import { arePicksLocked } from '@/lib/game/round-status'
import type { PickResult } from '@/lib/game-logic/common'

/** A team as the summary names it. */
export interface RoundSummaryTeamRow {
	id: string
	shortName: string
	name: string
}

/** One outcome's de-vigged win chance and the decimal price it came from. */
export interface RoundSummaryPrice {
	/** 0–1. */
	probability: number
	/** Decimal odds, e.g. 4.5. */
	price: number
}

/** A fixture's whole 1X2. Absent for a fixture (or competition) we hold no prices for. */
export interface RoundSummaryOdds {
	home: RoundSummaryPrice
	draw: RoundSummaryPrice
	away: RoundSummaryPrice
}

/**
 * A fixture as it currently stands — exactly the fields the classic survival
 * rule scores a pick on, so the summary never decides a result of its own.
 *
 * Required on every fixture rather than nullable-for-not-started: "no score yet"
 * is `status: 'scheduled'` with null scores, and a row source that forgot to
 * read the scores would otherwise leave the summary quoting the market for a
 * round that has already been played — which is the bug this half exists to fix.
 */
export interface RoundSummaryFixtureState {
	/** `fixture.status` — 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'. */
	status: string
	homeScore: number | null
	awayScore: number | null
	/** Authoritative winner of a tie settled after a level 90 minutes. */
	winner: 'home' | 'away' | null
}

export interface RoundSummaryFixtureRow {
	id: string
	home: RoundSummaryTeamRow
	away: RoundSummaryTeamRow
	odds: RoundSummaryOdds | null
	state: RoundSummaryFixtureState
}

/**
 * A player who was alive going into the round, with the pick they made. `pick`
 * is null for a player the deadline caught with nothing submitted — which is
 * itself newsworthy, so they're reported rather than dropped from the field.
 */
export interface RoundSummaryPlayerRow {
	id: string
	name: string
	pick: { teamId: string; isAuto: boolean } | null
}

/**
 * A win chance as a whole-percent string, or null where there is no price —
 * which is what keeps a missing price rendering as nothing rather than as 0%.
 *
 * The `toFixed` step before rounding is deliberate: an average like 2.3/4 lands
 * at 0.5749999999999999 in binary, and rounding that raw would print 57% for a
 * figure that means 57.5%. Both surfaces share this one rule so the card and the
 * share text can never quote the same number differently.
 */
export function formatWinChance(probability: number | null | undefined): string | null {
	if (probability == null) return null
	return `${Math.round(Number((probability * 100).toFixed(6)))}%`
}

/**
 * A decimal price as the card prints it: one decimal, two only where the price
 * genuinely carries them ("2.0", "4.5", "1.25").
 */
export function formatDecimalPrice(price: number | null | undefined): string | null {
	if (price == null) return null
	const rounded = Math.round(price * 100) / 100
	return rounded.toFixed(Number.isInteger(rounded * 10) ? 1 : 2)
}

/**
 * A team as the card labels it: short name, decimal price and win chance
 * together — `BRE 4.5 (22%)`. Just the short name where the fixture carries no
 * price, so a missing market never prints as a nought.
 */
export function formatTeamFigure(figure: RoundSummaryTeamFigure): string {
	const price = formatDecimalPrice(figure.price)
	const chance = formatWinChance(figure.winProbability)
	if (!price || !chance) return figure.shortName
	return `${figure.shortName} ${price} (${chance})`
}

/**
 * Every fixed word either surface says, in one table — the same arrangement
 * `JOIN_BLOCKED_COPY` uses, and for the same reason: the card and the share text
 * describe one thing, and copy split across two components drifts.
 */
export const ROUND_SUMMARY_COPY = {
	/** The fold's sub-line; its title is the summary's own headline. */
	cardSubtitle: 'Round summary — what the field picked',
	/** The same sub-line once results are landing: the fold is about them now. */
	cardSubtitleResults: 'Round summary — how it went',
	tiles: {
		results: 'How it went',
		market: "The market's verdict",
		mostBacked: 'Most backed',
		boldest: 'Boldest calls',
		lonePicks: 'Out on their own',
		headToHead: 'Head to head',
		leftOnTable: 'Left on the table',
	},
	results: {
		through: 'Through',
		/** A beaten pick puts its backer out — the ordinary round. */
		down: 'Out',
		/** …except where a non-win eliminates nobody. */
		downNoElimination: 'Beaten — but nobody goes out this round',
		stillToPlay: 'Still to play',
		/** Marks a pick whose fixture is under way but not over. */
		inPlay: 'in play',
		/** The headline's word for a beaten pick, which is only "out" where it eliminates. */
		countOut: 'out',
		countBeaten: 'beaten',
	},
	/** Why three tiles are missing, so the gap reads as deliberate. */
	noOdds:
		'This competition carries no bookmaker prices, so the market read sits this round out. The counts are the whole story.',
	noUnderdogs: "Nobody backed an underdog — every pick was its match's favourite.",
	pricesInPlay: 'Prices in play',
	drawTakesAll: 'One side goes out — and a draw takes everyone in it.',
	/** Where a non-win eliminates nobody (the opening round of a no-rebuys game), the stakes claim nothing about draws. */
	drawStartingRound: 'One side goes out.',
	noPickHeading: 'No pick at all',
	expectedSurvivors: 'expected to survive',
	stillStanding: 'still standing',
} as const

/** The minimum a round row needs for the anchor below. */
export interface RoundSummaryRoundRow {
	id: string
	number: number
	/** Competition-level round status from the bootstrap sync. */
	status: 'upcoming' | 'open' | 'active' | 'completed'
	deadline: Date | null
}

export interface SelectRoundSummaryRoundInput<T extends RoundSummaryRoundRow> {
	/** The competition's rounds. */
	rounds: T[]
	game: {
		currentRoundId: string | null
		currentRoundNumber: number | null
		/** `game.starting_round_id` — where this game began. */
		startingRoundId?: string | null
	}
	/** Highest round number this game holds a pick on, or null for none. */
	latestPickedRoundNumber?: number | null
	now: Date
}

/**
 * The round the summary speaks about: **the most recent round whose picks are
 * locked**.
 *
 * Locked is the progress grid's own gate — the round has completed, or its
 * deadline has passed — because the card narrates exactly the picks the grid
 * reveals. Anchoring to `game.currentRoundId` instead would empty the card the
 * moment a round settled and the game advanced to one whose picks are hidden
 * again, which is most of the week.
 *
 * Two bounds keep it to rounds this game actually played:
 *
 * - **Not before the starting round.** A game created in November starts at
 *   gameweek 12; gameweek 11's deadline has long passed and the game has nothing
 *   to say about it (#203).
 * - **Not past the round the game is on.** Classic accepts advance picks, so a
 *   competition round beyond the game's current one can be locked with a handful
 *   of early picks on it. The grid reveals those; a summary of them would read as
 *   the field's verdict when it's two people's. Once a game has completed and no
 *   longer points at a round, the last round it holds a pick on is the bound
 *   instead — the competition plays on for months after a game is won.
 *
 * Null when nothing qualifies: no deadline has passed yet, or the game has no
 * round to bound by at all.
 */
export function selectRoundSummaryRound<T extends RoundSummaryRoundRow>(
	input: SelectRoundSummaryRoundInput<T>,
): T | null {
	const { rounds, game, now } = input
	const startingRound = game.startingRoundId
		? rounds.find((r) => r.id === game.startingRoundId)
		: undefined
	const upperBound = game.currentRoundNumber ?? input.latestPickedRoundNumber ?? null
	if (upperBound == null) return null

	const candidates = rounds.filter((r) => {
		if (r.number > upperBound) return false
		if (startingRound && r.number < startingRound.number) return false
		return arePicksLocked(r, now)
	})
	return candidates.reduce<T | null>(
		(latest, r) => (latest == null || r.number > latest.number ? r : latest),
		null,
	)
}

export interface BuildRoundSummaryInput {
	round: { label: string; longLabel: string }
	/**
	 * Does a non-win put its backer out in this round?
	 *
	 * The starting-round exemption, as `settleClassicPick` resolves it —
	 * `!(isGameStartingRound(game, round) && !allowRebuys)` — and not
	 * "is this the starting round", which would call a rebuys-on opening round
	 * harmless when it eliminates like any other. One flag, because the summary
	 * asks the question twice: the head-to-head stakes ("a draw takes everyone in
	 * it") and whether a beaten pick is a player leaving the game.
	 */
	nonWinEliminates: boolean
	/**
	 * Is this round a knockout tie — a match that can't end level?
	 * `isKnockoutRound(competition.type, round.number)`. A finished tie with no
	 * winner reported is the provider's winner-lag, and the survival rule defers
	 * it rather than scoring a draw, so the pick reads as still to play.
	 */
	knockout: boolean
	/** Everyone alive going into the round — the denominator the card quotes. */
	players: RoundSummaryPlayerRow[]
	fixtures: RoundSummaryFixtureRow[]
}

/** A named player, marked when the pick was made for them. */
export interface RoundSummaryPlayerRef {
	name: string
	isAuto: boolean
}

/** A team with the market's read on it, where there is one. */
export interface RoundSummaryTeamFigure {
	teamId: string
	shortName: string
	name: string
	/** 0–1, or null for an unpriced fixture. Never 0 as a stand-in for "unknown". */
	winProbability: number | null
	price: number | null
}

/**
 * The market's read on the whole round.
 *
 * `expectedSurvivors` is a *sum* of win probabilities and it is exact rather
 * than modelled: in classic, surviving is your pick winning — a draw eliminates
 * after the starting round — so the expected number of survivors is the sum of
 * the picked teams' win chances and nothing more.
 */
export interface RoundSummaryMarket {
	/** Picks made in the round. */
	picks: number
	/** How many distinct teams the field spread across. */
	distinctTeams: number
	/** Mean win chance of the priced picks, 0–1. */
	averageWinProbability: number
	/** Sum of the priced picks' win chances. */
	expectedSurvivors: number
	/**
	 * How many picks the two figures above are actually over. Null when that's
	 * every pick in the round — the line only names a denominator when unpriced
	 * picks left it short of the field.
	 */
	pricedPicks: number | null
}

/** One row of "Most backed": a team, its count, and who's on it. */
export interface RoundSummaryBackedTeam extends RoundSummaryTeamFigure {
	count: number
	players: RoundSummaryPlayerRef[]
}

/** One gamble: a player, the team they took, and who it's up against. */
export interface RoundSummaryBoldCall extends RoundSummaryTeamFigure {
	player: RoundSummaryPlayerRef
	side: 'home' | 'away'
	opponentShortName: string
	opponentName: string
}

/**
 * "Boldest calls" — the picks the market doesn't favour.
 *
 * There is no magic threshold: an underdog is a team that isn't the
 * highest-probability outcome in the match it's playing, the draw included. And
 * the whole tile is computed over **hand-made picks only**. Auto-pick selects
 * the lowest-ranked unused team, so auto-picks are systematically underdogs and
 * would otherwise fill this tile with players named for a gamble the system made
 * on their behalf after they missed the deadline. That exclusion covers the
 * `none` variant's prices too: quoting an auto-pick's long price beneath
 * "nobody backed an underdog" would read as a contradiction.
 */
export type RoundSummaryBoldest =
	| { kind: 'calls'; calls: RoundSummaryBoldCall[] }
	/**
	 * Every hand-made pick was its match's favourite. The two ends of what the
	 * field actually took are reported instead — both null in the rare round whose
	 * only picks were auto-picks, where there is nothing of the players' own to
	 * quote.
	 */
	| {
			kind: 'none'
			shortest: RoundSummaryTeamFigure | null
			longest: RoundSummaryTeamFigure | null
	  }

/**
 * "Out on their own" — a team exactly one player backed. A different axis from
 * the boldest calls: a lone pick can be a stone-cold favourite nobody else
 * fancied, which is why an auto-pick belongs here (it's a real pick with real
 * consequences) and not there.
 */
export interface RoundSummaryLonePick extends RoundSummaryTeamFigure {
	player: RoundSummaryPlayerRef
}

/** One side of a contested fixture: the team, and everyone on it. */
export interface RoundSummaryHeadToHeadSide extends RoundSummaryTeamFigure {
	players: RoundSummaryPlayerRef[]
}

/**
 * A fixture the field sits on **both** sides of. One side goes out — and after
 * the game's starting round a draw takes every player in the match, which is the
 * part that isn't obvious from the two team names.
 *
 * Nothing here assumes one player a side: seven on the favourite and one on the
 * underdog is the same shape, and the commonest one.
 */
export interface RoundSummaryHeadToHead {
	fixtureId: string
	home: RoundSummaryHeadToHeadSide
	away: RoundSummaryHeadToHeadSide
	/** False where a non-win eliminates nobody — the starting-round exemption. */
	drawTakesAll: boolean
}

/**
 * One pick, with what the round has done to it so far.
 *
 * The result is `resolveClassicPickResult`'s and nothing else's — the same
 * function the settle path, the progress grid and the live view read — so the
 * summary can't call a knockout tie won on penalties a loss (#242).
 */
export interface RoundSummaryPickOutcome extends RoundSummaryTeamFigure {
	player: RoundSummaryPlayerRef
	/**
	 * How the pick stands: null while there is nothing to say (not kicked off, or
	 * a knockout tie level at full time with no winner reported yet). Provisional
	 * on a fixture still playing — `finished` is what says it's settled.
	 */
	result: PickResult | null
	/** Has the fixture finished? An in-flight lead is not a result. */
	finished: boolean
	/** "ARS 2-0 BRE", or null before a ball is kicked. */
	scoreline: string | null
	/** The same line with the clubs' full names, for prose. */
	longScoreline: string | null
}

/**
 * What the round has actually done — present from the moment a **picked**
 * fixture kicks off, absent before it.
 *
 * The gate is a picked fixture rather than any fixture in the round: a match
 * nobody backed kicking off first changes nothing about the field's story, and a
 * results block whose every line reads "still to play" is a worse message than
 * the market read it replaced.
 */
export interface RoundSummaryResults {
	/** Every pick in the round has its answer — nothing left to play. */
	complete: boolean
	/** Picks whose team came through, biggest upset first. */
	through: RoundSummaryPickOutcome[]
	/** Picks that went down, the shortest price first — the biggest casualty leads. */
	down: RoundSummaryPickOutcome[]
	/**
	 * Still playing, yet to kick off, or waiting on a knockout tie's winner, the
	 * matches in flight first. A postponed or cancelled fixture sits here too:
	 * nothing has happened to it.
	 */
	stillToPlay: RoundSummaryPickOutcome[]
	/** Does a beaten pick put its backer out? `BuildRoundSummaryInput.nonWinEliminates`. */
	eliminates: boolean
	/**
	 * Of the players alive going into the round, how many the round hasn't put out.
	 * Falls as results land, so it reads as a live figure mid-round and as the
	 * survivors once `complete`. Counts the no-pick players out from the deadline,
	 * which is when the lock eliminated them.
	 */
	stillStanding: number
}

export interface RoundSummaryView {
	round: { label: string; longLabel: string }
	/** The collapsed trigger's line, e.g. "7 of 12 on ARS". */
	headline: string
	/** Players alive going into the round. */
	playersAlive: number
	/** How many of them submitted something. */
	picksMade: number
	/** Alive players the deadline caught with no pick at all. */
	noPickPlayers: RoundSummaryPlayerRef[]
	/**
	 * Does the round carry any bookmaker price at all? False for a classic game on
	 * a competition the odds source doesn't cover (the World Cup, the FA Cup) —
	 * a shipped configuration, not a hypothetical, since only cup *mode* is
	 * restricted. The three market-driven tiles are absent there and the surface
	 * says why, so the gap reads as deliberate rather than broken.
	 */
	oddsAvailable: boolean
	/** Null when the round carries no prices at all, or nobody picked. */
	market: RoundSummaryMarket | null
	mostBacked: RoundSummaryBackedTeam[]
	/** Null when the round carries no prices at all. */
	boldest: RoundSummaryBoldest | null
	lonePicks: RoundSummaryLonePick[]
	headToHead: RoundSummaryHeadToHead[]
	/**
	 * The shortest-priced team nobody took. Null when the round is unpriced, or
	 * when the field covered every team in it.
	 */
	leftOnTable: RoundSummaryTeamFigure | null
	/**
	 * What the round did, once it started doing it. Null until a picked fixture
	 * kicks off — which is exactly when the surfaces switch from previewing the
	 * round to reporting it.
	 */
	results: RoundSummaryResults | null
}

export function buildRoundSummary(input: BuildRoundSummaryInput): RoundSummaryView {
	const { players, fixtures, round } = input
	const teamsById = indexTeams(fixtures)

	const picked = players.filter((p) => p.pick != null && teamsById.has(p.pick.teamId))
	const noPickPlayers = players
		.filter((p) => p.pick == null)
		.map((p) => ({ name: p.name, isAuto: false }))

	const mostBacked = buildMostBacked(picked, teamsById)
	const oddsAvailable = hasPrices(fixtures)
	const results = buildResults(picked, teamsById, {
		playersAlive: players.length,
		noPickPlayers: noPickPlayers.length,
		nonWinEliminates: input.nonWinEliminates,
		knockout: input.knockout,
	})

	return {
		round: { label: round.label, longLabel: round.longLabel },
		headline: results
			? buildResultsHeadline(results, players.length)
			: buildHeadline(mostBacked, players.length),
		playersAlive: players.length,
		picksMade: picked.length,
		noPickPlayers,
		oddsAvailable,
		market: buildMarket(mostBacked, picked.length),
		mostBacked,
		boldest: oddsAvailable ? buildBoldest(picked, teamsById) : null,
		lonePicks: buildLonePicks(mostBacked),
		headToHead: buildHeadToHead(mostBacked, fixtures, input.nonWinEliminates),
		leftOnTable: buildLeftOnTable(mostBacked, teamsById),
		results,
	}
}

interface ResultsContext {
	playersAlive: number
	noPickPlayers: number
	nonWinEliminates: boolean
	knockout: boolean
}

/**
 * The results half: every pick scored by the classic survival rule and sorted
 * into what the round has done with it.
 *
 * Null until one of the picked fixtures has kicked off. Nothing here reads the
 * clock — a fixture that has started says so itself, with a `live`/`finished`
 * status or a score on the board.
 */
function buildResults(
	picked: RoundSummaryPlayerRow[],
	teamsById: Map<string, RoundSummaryTeamSlot>,
	context: ResultsContext,
): RoundSummaryResults | null {
	const outcomes: RoundSummaryPickOutcome[] = []
	let started = false

	for (const player of picked) {
		const pick = player.pick
		if (!pick) continue
		const slot = teamsById.get(pick.teamId)
		if (!slot) continue
		const fixture = survivalFixture(slot, context.knockout)
		const resolution = resolveClassicPickResult({ teamId: pick.teamId }, fixture)
		if (hasStarted(slot.fixture.state)) started = true
		outcomes.push({
			...figureFor(slot),
			player: { name: player.name, isAuto: pick.isAuto },
			result: resolution.defer ? null : resolution.result,
			finished: slot.fixture.state.status === 'finished',
			scoreline: scoreline(slot.fixture, (t) => t.shortName),
			longScoreline: scoreline(slot.fixture, (t) => t.name),
		})
	}

	if (!started) return null

	// Only a finished fixture settles a pick. A team two goals up at half time is
	// not through, and reporting it as through would name a survivor the grid
	// beside it still shows pending.
	const settled = outcomes.filter((o) => o.finished && o.result != null)
	const through = settled
		.filter((o) => o.result === 'win')
		// Longest price first: the shock is the story, and an unpriced pick sinks
		// below the priced ones rather than leading on a probability it hasn't got.
		.sort((a, b) => byProbabilityAsc(a, b) || a.player.name.localeCompare(b.player.name))
	const down = settled
		.filter((o) => o.result !== 'win')
		// Shortest price first: a favourite going down is the bigger casualty.
		.sort((a, b) => byProbabilityDesc(a, b) || a.player.name.localeCompare(b.player.name))
	// Matches in flight lead the ones still to come: something is happening in
	// them, and a scoreline already on the board is the part worth reading first.
	const stillToPlay = outcomes
		.filter((o) => !(o.finished && o.result != null))
		.sort(
			(a, b) =>
				Number(b.scoreline != null) - Number(a.scoreline != null) ||
				a.shortName.localeCompare(b.shortName) ||
				a.player.name.localeCompare(b.player.name),
		)

	// A player the deadline caught with nothing was eliminated by the lock, not by
	// a result, so they're out from the moment the round locked — where a non-win
	// eliminates at all.
	const out = context.nonWinEliminates ? down.length + context.noPickPlayers : 0

	return {
		complete: stillToPlay.length === 0,
		through,
		down,
		stillToPlay,
		eliminates: context.nonWinEliminates,
		stillStanding: context.playersAlive - out,
	}
}

/** The pick's fixture, in the shape the survival rule takes. */
function survivalFixture(slot: RoundSummaryTeamSlot, knockout: boolean): ClassicSurvivalFixture {
	return {
		homeTeamId: slot.fixture.home.id,
		awayTeamId: slot.fixture.away.id,
		homeScore: slot.fixture.state.homeScore,
		awayScore: slot.fixture.state.awayScore,
		winner: slot.fixture.state.winner,
		status: slot.fixture.state.status,
		knockout,
	}
}

/** Has this fixture kicked off? A score on the board says so as loudly as a status. */
function hasStarted(state: RoundSummaryFixtureState): boolean {
	if (state.status === 'live' || state.status === 'finished') return true
	return state.homeScore != null && state.awayScore != null
}

function scoreline(
	fixture: RoundSummaryFixtureRow,
	name: (team: RoundSummaryTeamRow) => string,
): string | null {
	const { homeScore, awayScore } = fixture.state
	if (homeScore == null || awayScore == null) return null
	return `${name(fixture.home)} ${homeScore}-${awayScore} ${name(fixture.away)}`
}

/** Longest price first; a team we hold no price for sinks below the priced ones. */
function byProbabilityAsc(a: RoundSummaryTeamFigure, b: RoundSummaryTeamFigure): number {
	if (a.winProbability == null && b.winProbability == null) return 0
	if (a.winProbability == null) return 1
	if (b.winProbability == null) return -1
	return a.winProbability - b.winProbability
}

/**
 * The contested fixtures, the biggest clash first — most players involved, the
 * home side's name breaking a tie so the order never follows fixture order.
 */
function buildHeadToHead(
	mostBacked: RoundSummaryBackedTeam[],
	fixtures: RoundSummaryFixtureRow[],
	nonWinEliminates: boolean,
): RoundSummaryHeadToHead[] {
	const backedByTeam = new Map(mostBacked.map((t) => [t.teamId, t]))
	const clashes: RoundSummaryHeadToHead[] = []
	for (const fixture of fixtures) {
		const home = backedByTeam.get(fixture.home.id)
		const away = backedByTeam.get(fixture.away.id)
		if (!home || !away) continue
		clashes.push({
			fixtureId: fixture.id,
			home: toSide(home),
			away: toSide(away),
			drawTakesAll: nonWinEliminates,
		})
	}
	return clashes.sort(
		(a, b) =>
			b.home.players.length +
				b.away.players.length -
				(a.home.players.length + a.away.players.length) ||
			a.home.shortName.localeCompare(b.home.shortName),
	)
}

function toSide({ count: _count, ...side }: RoundSummaryBackedTeam): RoundSummaryHeadToHeadSide {
	return side
}

/** Shortest price first, so the biggest surprise of a lone pick leads. */
function buildLonePicks(mostBacked: RoundSummaryBackedTeam[]): RoundSummaryLonePick[] {
	return mostBacked
		.filter((t) => t.count === 1)
		.map(({ count: _count, players, ...figure }) => ({ ...figure, player: players[0] }))
		.sort((a, b) => byProbabilityDesc(a, b) || a.shortName.localeCompare(b.shortName))
}

/**
 * The best thing nobody took. Priced teams only — with no price there is no
 * "shortest", and an unpriced team named here would be an arbitrary pick out of
 * the round rather than a fact about it.
 */
function buildLeftOnTable(
	mostBacked: RoundSummaryBackedTeam[],
	teamsById: Map<string, RoundSummaryTeamSlot>,
): RoundSummaryTeamFigure | null {
	const pickedTeamIds = new Set(mostBacked.map((t) => t.teamId))
	const unpicked = [...teamsById.values()]
		.filter((slot) => !pickedTeamIds.has(slot.team.id))
		.map(figureFor)
		.filter((figure) => figure.winProbability != null)
	if (unpicked.length === 0) return null
	return unpicked.sort(
		(a, b) => byProbabilityDesc(a, b) || a.shortName.localeCompare(b.shortName),
	)[0]
}

/** Does the round carry any bookmaker prices at all? */
function hasPrices(fixtures: RoundSummaryFixtureRow[]): boolean {
	return fixtures.some((f) => f.odds != null)
}

function buildBoldest(
	picked: RoundSummaryPlayerRow[],
	teamsById: Map<string, RoundSummaryTeamSlot>,
): RoundSummaryBoldest {
	const handMade = picked.filter((p) => p.pick && !p.pick.isAuto)
	const calls: RoundSummaryBoldCall[] = []
	const pricedFigures: RoundSummaryTeamFigure[] = []

	for (const player of handMade) {
		const pick = player.pick
		if (!pick) continue
		const slot = teamsById.get(pick.teamId)
		if (!slot?.fixture.odds) continue
		const figure = figureFor(slot)
		pricedFigures.push(figure)
		if (isFavourite(slot)) continue
		const opponent = slot.side === 'home' ? slot.fixture.away : slot.fixture.home
		calls.push({
			...figure,
			player: { name: player.name, isAuto: false },
			side: slot.side,
			opponentShortName: opponent.shortName,
			opponentName: opponent.name,
		})
	}

	if (calls.length > 0) {
		return {
			kind: 'calls',
			calls: calls.sort(
				(a, b) =>
					(a.winProbability ?? 0) - (b.winProbability ?? 0) ||
					a.player.name.localeCompare(b.player.name),
			),
		}
	}

	const ranked = [...pricedFigures].sort(byProbabilityDesc)
	return { kind: 'none', shortest: ranked[0] ?? null, longest: ranked.at(-1) ?? null }
}

/**
 * Is this team the match's most likely outcome? The comparison includes the
 * draw, which is the whole point: a team the draw is priced ahead of is one the
 * market doesn't favour.
 */
function isFavourite(slot: RoundSummaryTeamSlot): boolean {
	const odds = slot.fixture.odds
	if (!odds) return false
	const mine = odds[slot.side].probability
	return mine >= Math.max(odds.home.probability, odds.draw.probability, odds.away.probability)
}

/**
 * The market line, read off the per-team rows so the two can't disagree.
 *
 * A round with no prices anywhere has no line at all rather than a line of
 * noughts: the average of nothing is not zero, and expected survivors of nought
 * would read as a wipeout the market never predicted.
 */
function buildMarket(
	mostBacked: RoundSummaryBackedTeam[],
	picksMade: number,
): RoundSummaryMarket | null {
	if (picksMade === 0) return null
	const priced = mostBacked.filter((t) => t.winProbability != null)
	if (priced.length === 0) return null
	const pricedPicks = priced.reduce((sum, t) => sum + t.count, 0)
	const expectedSurvivors = priced.reduce((sum, t) => sum + (t.winProbability ?? 0) * t.count, 0)
	return {
		picks: picksMade,
		distinctTeams: mostBacked.length,
		averageWinProbability: expectedSurvivors / pricedPicks,
		expectedSurvivors,
		pricedPicks: pricedPicks === picksMade ? null : pricedPicks,
	}
}

/**
 * Every team in the round, by id, with the side of the fixture it plays — which
 * is what turns a pick's `teamId` into a name and a price.
 */
interface RoundSummaryTeamSlot {
	team: RoundSummaryTeamRow
	fixture: RoundSummaryFixtureRow
	side: 'home' | 'away'
}

function indexTeams(fixtures: RoundSummaryFixtureRow[]): Map<string, RoundSummaryTeamSlot> {
	const byId = new Map<string, RoundSummaryTeamSlot>()
	for (const fixture of fixtures) {
		byId.set(fixture.home.id, { team: fixture.home, fixture, side: 'home' })
		byId.set(fixture.away.id, { team: fixture.away, fixture, side: 'away' })
	}
	return byId
}

function figureFor(slot: RoundSummaryTeamSlot): RoundSummaryTeamFigure {
	const price = slot.fixture.odds ? slot.fixture.odds[slot.side] : null
	return {
		teamId: slot.team.id,
		shortName: slot.team.shortName,
		name: slot.team.name,
		winProbability: price ? price.probability : null,
		price: price ? price.price : null,
	}
}

/**
 * Teams by pick count, descending. Ties break on the market read (the shorter
 * price first, an unpriced team last) and then on the club's short name, so the
 * order never depends on row order.
 */
function buildMostBacked(
	picked: RoundSummaryPlayerRow[],
	teamsById: Map<string, RoundSummaryTeamSlot>,
): RoundSummaryBackedTeam[] {
	const byTeam = new Map<string, RoundSummaryBackedTeam>()
	for (const player of picked) {
		const pick = player.pick
		if (!pick) continue
		const slot = teamsById.get(pick.teamId)
		if (!slot) continue
		let row = byTeam.get(pick.teamId)
		if (!row) {
			row = { ...figureFor(slot), count: 0, players: [] }
			byTeam.set(pick.teamId, row)
		}
		row.count += 1
		row.players.push({ name: player.name, isAuto: pick.isAuto })
	}
	return [...byTeam.values()].sort(
		(a, b) =>
			b.count - a.count || byProbabilityDesc(a, b) || a.shortName.localeCompare(b.shortName),
	)
}

/** Shorter price first; a team we hold no price for sinks below the priced ones. */
function byProbabilityDesc(a: RoundSummaryTeamFigure, b: RoundSummaryTeamFigure): number {
	if (a.winProbability == null && b.winProbability == null) return 0
	if (a.winProbability == null) return 1
	if (b.winProbability == null) return -1
	return b.winProbability - a.winProbability
}

function buildHeadline(mostBacked: RoundSummaryBackedTeam[], playersAlive: number): string {
	const top = mostBacked[0]
	if (!top) return 'No picks in'
	return `${top.count} of ${playersAlive} on ${top.shortName}`
}

/**
 * The trigger line once results are landing. Mid-round it counts what has come
 * in; finished, it states the one figure the round was ever about — who is left.
 */
function buildResultsHeadline(results: RoundSummaryResults, playersAlive: number): string {
	if (results.complete) {
		return `${results.stillStanding} of ${playersAlive} ${ROUND_SUMMARY_COPY.stillStanding}`
	}
	const beaten = results.eliminates
		? ROUND_SUMMARY_COPY.results.countOut
		: ROUND_SUMMARY_COPY.results.countBeaten
	return `${results.through.length} through, ${results.down.length} ${beaten}, ${results.stillToPlay.length} to play`
}
