/**
 * the-odds-api.com (v4) adapter — 1X2 (`h2h`) prices for a competition,
 * de-vigged into indicative win probabilities.
 *
 * Bookmaker prices carry an overround ("the vig"): the implied probabilities
 * of a 1X2 market sum to more than 1, and the excess is the book's margin.
 * Normalising each implied probability by that sum removes the margin
 * proportionally, which is the standard indicative read of a market price.
 */

import { fetchJson } from './fetch-json'

const BASE_URL = 'https://api.the-odds-api.com/v4'

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
export function parseOddsEvents(
	payload: OddsApiEvent[],
	options?: { readAt?: Date },
): OddsMarket[] {
	// When the source sends no update stamp of its own, the honest answer for
	// "odds as of" is when we read them. Never the kickoff: for any pickable
	// fixture that's in the future, and the row would print a market it claims
	// to have read tomorrow.
	const readAt = options?.readAt ?? new Date()
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
				asOf: stampFor(h2h.last_update ?? bookmaker.last_update, readAt),
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

/** The source's own stamp when it sent a usable one, else when we read it. */
function stampFor(lastUpdate: string | null | undefined, readAt: Date): Date {
	if (!lastUpdate) return readAt
	const parsed = new Date(lastUpdate)
	return Number.isNaN(parsed.getTime()) ? readAt : parsed
}

function priceFor(outcomes: OddsApiOutcome[], name: string): number | null {
	const outcome = outcomes?.find((o) => o.name === name)
	if (!outcome || !Number.isFinite(outcome.price) || outcome.price <= 0) return null
	return outcome.price
}

/**
 * Reads one competition's 1X2 prices from the-odds-api.
 *
 * One call covers the whole competition, which is what makes the free tier's
 * request budget viable on the daily-sync cadence: PL odds cost one request a
 * day, not one per fixture.
 */
export class OddsApiAdapter {
	constructor(
		private sportKey: string,
		private apiKey: string,
	) {}

	async fetchOdds(): Promise<OddsMarket[]> {
		const url = new URL(`${BASE_URL}/sports/${this.sportKey}/odds`)
		url.searchParams.set('apiKey', this.apiKey)
		// UK books quote the 1X2 market our players recognise, decimal prices are
		// the format the de-vig maths (and the displayed win-price) assume.
		url.searchParams.set('regions', 'uk')
		url.searchParams.set('markets', 'h2h')
		url.searchParams.set('oddsFormat', 'decimal')
		const payload = await fetchJson<OddsApiEvent[]>(url.toString())
		// Stamped at the moment the payload landed, so a market the source didn't
		// date is dated by us rather than by its kickoff.
		return parseOddsEvents(payload, { readAt: new Date() })
	}
}
