/**
 * The post-deadline **round summary**, derived.
 *
 * Once a classic round's picks are locked there is a story in them the progress
 * grid can't tell: who the crowd backed, who gambled, who is up against whom.
 * This is the one place that decides it. Both surfaces — the card under the grid
 * and the share dialog's text block — render what comes out and classify, order
 * and word nothing themselves.
 *
 * Deterministic by construction: same rows in, same view out. Nothing here reads
 * the clock, queries, or calls a model. The prices are the ones the daily sync
 * already persisted per fixture, frozen at the round's deadline.
 */

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

export interface RoundSummaryFixtureRow {
	id: string
	home: RoundSummaryTeamRow
	away: RoundSummaryTeamRow
	odds: RoundSummaryOdds | null
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

export interface BuildRoundSummaryInput {
	round: { label: string; longLabel: string }
	/**
	 * Is this the game's own starting round? A draw only eliminates *after* it, so
	 * the head-to-head stakes read differently there.
	 */
	isStartingRound: boolean
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
	/** Null when the round carries no prices at all, or nobody picked. */
	market: RoundSummaryMarket | null
	mostBacked: RoundSummaryBackedTeam[]
	/** Null when the round carries no prices at all. */
	boldest: RoundSummaryBoldest | null
}

export function buildRoundSummary(input: BuildRoundSummaryInput): RoundSummaryView {
	const { players, fixtures, round } = input
	const teamsById = indexTeams(fixtures)

	const picked = players.filter((p) => p.pick != null && teamsById.has(p.pick.teamId))
	const noPickPlayers = players
		.filter((p) => p.pick == null)
		.map((p) => ({ name: p.name, isAuto: false }))

	const mostBacked = buildMostBacked(picked, teamsById)

	return {
		round: { label: round.label, longLabel: round.longLabel },
		headline: buildHeadline(mostBacked, players.length),
		playersAlive: players.length,
		picksMade: picked.length,
		noPickPlayers,
		market: buildMarket(mostBacked, picked.length),
		mostBacked,
		boldest: hasPrices(fixtures) ? buildBoldest(picked, teamsById) : null,
	}
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
