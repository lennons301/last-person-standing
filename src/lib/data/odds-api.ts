/**
 * the-odds-api.com (v4) adapter — 1X2 (`h2h`) prices for a competition,
 * de-vigged into indicative win probabilities.
 *
 * Bookmaker prices carry an overround ("the vig"): the implied probabilities
 * of a 1X2 market sum to more than 1, and the excess is the book's margin.
 * Normalising each implied probability by that sum removes the margin
 * proportionally, which is the standard indicative read of a market price.
 */

/** A single `h2h` outcome as the source reports it. */
interface OddsApiOutcome {
	name: string
	price: number
}

interface OddsApiMarket {
	key: string
	last_update?: string | null
	outcomes: OddsApiOutcome[]
}

interface OddsApiBookmaker {
	key: string
	title?: string
	last_update?: string | null
	markets: OddsApiMarket[]
}

export interface OddsApiEvent {
	id: string
	sport_key?: string
	commence_time: string
	home_team: string
	away_team: string
	bookmakers?: OddsApiBookmaker[]
}

/** One fixture's de-vigged 1X2 market, as read from a single bookmaker. */
export interface OddsMarket {
	/** Source event id — stable per fixture within the-odds-api. */
	eventId: string
	homeTeam: string
	awayTeam: string
	commenceTime: Date
	/** Bookmaker key the prices were read from (e.g. `betfair_ex_uk`). */
	bookmaker: string
	/** When the bookmaker last moved this market — the "odds as of" stamp. */
	asOf: Date
	homePrice: number
	drawPrice: number
	awayPrice: number
	homeProbability: number
	drawProbability: number
	awayProbability: number
}

/**
 * Remove the overround from a set of decimal prices, returning probabilities
 * that sum to 1.
 */
export function deVig(prices: number[]): number[] {
	const implied = prices.map((p) => 1 / p)
	const overround = implied.reduce((sum, p) => sum + p, 0)
	return implied.map((p) => p / overround)
}

/**
 * Map a the-odds-api payload to one de-vigged market per event.
 *
 * The prices come from the first bookmaker quoting a complete 1X2 market. One
 * book (rather than an average across books) keeps the displayed win-price and
 * the displayed probability two views of the same quote — an averaged
 * probability next to one book's price would be two different markets.
 */
export function parseOddsEvents(payload: OddsApiEvent[]): OddsMarket[] {
	const markets: OddsMarket[] = []
	for (const event of payload) {
		for (const bookmaker of event.bookmakers ?? []) {
			const h2h = bookmaker.markets?.find((m) => m.key === 'h2h')
			if (!h2h) continue
			const homePrice = priceFor(h2h.outcomes, event.home_team)
			const awayPrice = priceFor(h2h.outcomes, event.away_team)
			const drawPrice = priceFor(h2h.outcomes, 'Draw')
			if (homePrice == null || awayPrice == null || drawPrice == null) continue
			const [homeProbability, drawProbability, awayProbability] = deVig([
				homePrice,
				drawPrice,
				awayPrice,
			])
			markets.push({
				eventId: event.id,
				homeTeam: event.home_team,
				awayTeam: event.away_team,
				commenceTime: new Date(event.commence_time),
				bookmaker: bookmaker.key,
				asOf: new Date(h2h.last_update ?? bookmaker.last_update ?? event.commence_time),
				homePrice,
				drawPrice,
				awayPrice,
				homeProbability,
				drawProbability,
				awayProbability,
			})
			break
		}
	}
	return markets
}

function priceFor(outcomes: OddsApiOutcome[], name: string): number | null {
	const outcome = outcomes?.find((o) => o.name === name)
	if (!outcome || !Number.isFinite(outcome.price) || outcome.price <= 0) return null
	return outcome.price
}
