import { eq } from 'drizzle-orm'
import { OddsApiAdapter } from '@/lib/data/odds-api'
import { db } from '@/lib/db'
import { fixtureOdds, round } from '@/lib/schema/competition'
import type { Competition } from '@/lib/types'

const SOURCE = 'the_odds_api'

/** The subset of a competition row this sync needs. */
export type OddsCompetition = Pick<Competition, 'id' | 'externalId' | 'dataSource' | 'status'>

/**
 * the-odds-api sport key for a competition, or null when we have no odds
 * source for it. Null is the ordinary case for everything but the Premier
 * League today — those competitions keep no odds rows and their fixtures
 * render no win-probability.
 */
export function oddsSportKeyFor(
	comp: Pick<OddsCompetition, 'externalId' | 'dataSource'>,
): string | null {
	// FPL-sourced competitions mirror the Premier League, as does an explicit
	// football-data 'PL' code.
	if (comp.dataSource === 'fpl' || comp.externalId === 'PL') return 'soccer_epl'
	return null
}

/**
 * the-odds-api quotes clubs by their full names ("Manchester United"); our PL
 * teams carry FPL's abbreviated ones ("Man Utd"), so the two only meet through
 * an explicit table — the same shape as `FPL_TO_FD_TLA` in
 * bootstrap-competitions. Keyed by normalised source name → our team's short
 * name. A club missing from this table falls back to normalised name/short-name
 * equality and, failing that, simply gets no odds (reported in `unmatched` and
 * warned about at the end of the sync).
 *
 * Deliberately a **superset**, like `TEAM_COLOURS` in `src/lib/teams/colours.ts`
 * — recently relegated clubs stay so an August rollover never thins the table
 * out mid-season, and a unit test holds this table to that one's coverage.
 * Promoted clubs are added by the annual rollover ritual in AGENTS.md.
 */
export const ODDS_API_NAME_TO_SHORT_NAME: Record<string, string> = {
	arsenal: 'ARS',
	'aston villa': 'AVL',
	bournemouth: 'BOU',
	brentford: 'BRE',
	'brighton and hove albion': 'BHA',
	burnley: 'BUR',
	chelsea: 'CHE',
	'coventry city': 'COV',
	'crystal palace': 'CRY',
	everton: 'EVE',
	fulham: 'FUL',
	'hull city': 'HUL',
	'ipswich town': 'IPS',
	'leeds united': 'LEE',
	'leicester city': 'LEI',
	liverpool: 'LIV',
	'manchester city': 'MCI',
	'manchester united': 'MUN',
	'newcastle united': 'NEW',
	'nottingham forest': 'NFO',
	southampton: 'SOU',
	sunderland: 'SUN',
	'tottenham hotspur': 'TOT',
	'west ham united': 'WHU',
	'wolverhampton wanderers': 'WOL',
}

/** Lowercase, strip accents, punctuation and the club-suffix noise. */
function normaliseTeamName(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, '')
		.replace(/^afc /, '')
		.replace(/ (afc|fc)$/, '')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Every key a fixture's team can be matched on, source-side or ours. */
function matchKeys(name: string, shortName?: string): string[] {
	const normalised = normaliseTeamName(name)
	const keys = [normalised]
	const alias = ODDS_API_NAME_TO_SHORT_NAME[normalised]
	if (alias) keys.push(normaliseTeamName(alias))
	if (shortName) keys.push(normaliseTeamName(shortName))
	return keys
}

export interface OddsSyncSummary {
	/** Fixtures whose odds row was written/refreshed. */
	matched: number
	/** Fixtures skipped because their round deadline has already passed. */
	frozen: number
	/** Source markets with no fixture of ours, as "Home v Away" labels. */
	unmatched: string[]
}

/**
 * Fetch one competition's 1X2 prices and persist the de-vigged probabilities
 * per fixture. One source request covers the whole competition, which is what
 * makes this affordable on the daily-sync cadence.
 *
 * Two rules define what gets written:
 * - **Frozen after the deadline.** A round whose deadline has passed keeps the
 *   odds it had when picks locked. Everyone in every game sees the same
 *   numbers, and they stop moving at the moment the decision did.
 * - **Absent rather than wrong.** An unmatched market, an unpriced fixture or
 *   a competition with no odds source leaves no row behind, and the surfaces
 *   render no win-probability at all.
 */
export async function syncFixtureOdds(
	comp: OddsCompetition,
	apiKey: string,
	options?: { now?: Date },
): Promise<OddsSyncSummary> {
	const summary: OddsSyncSummary = { matched: 0, frozen: 0, unmatched: [] }
	// Archived competitions are frozen history — never re-priced.
	if (comp.status === 'archived') return summary
	const sportKey = oddsSportKeyFor(comp)
	if (!sportKey) return summary

	const markets = await new OddsApiAdapter(sportKey, apiKey).fetchOdds()
	if (markets.length === 0) return summary

	// Scoped to this competition's own rounds, like every other sync-owned
	// write: a pairing key is only unique within a competition.
	const rounds = await db.query.round.findMany({
		where: eq(round.competitionId, comp.id),
		with: { fixtures: { with: { homeTeam: true, awayTeam: true } } },
	})

	interface Candidate {
		fixtureId: string
		deadline: Date | null
	}
	const byPair = new Map<string, Candidate>()
	for (const r of rounds) {
		for (const f of r.fixtures) {
			for (const homeKey of matchKeys(f.homeTeam.name, f.homeTeam.shortName)) {
				for (const awayKey of matchKeys(f.awayTeam.name, f.awayTeam.shortName)) {
					byPair.set(`${homeKey}|${awayKey}`, { fixtureId: f.id, deadline: r.deadline })
				}
			}
		}
	}

	const now = options?.now ?? new Date()
	for (const market of markets) {
		const candidate = matchKeys(market.homeTeam)
			.flatMap((homeKey) => matchKeys(market.awayTeam).map((awayKey) => `${homeKey}|${awayKey}`))
			.map((key) => byPair.get(key))
			.find((found) => found != null)
		if (!candidate) {
			summary.unmatched.push(`${market.homeTeam} v ${market.awayTeam}`)
			continue
		}
		if (candidate.deadline != null && candidate.deadline <= now) {
			summary.frozen++
			continue
		}
		const values = {
			fixtureId: candidate.fixtureId,
			source: SOURCE,
			bookmaker: market.bookmaker,
			homePrice: market.homePrice,
			drawPrice: market.drawPrice,
			awayPrice: market.awayPrice,
			homeProbability: market.homeProbability,
			drawProbability: market.drawProbability,
			awayProbability: market.awayProbability,
			asOf: market.asOf,
		}
		await db
			.insert(fixtureOdds)
			.values(values)
			.onConflictDoUpdate({
				target: fixtureOdds.fixtureId,
				set: { ...values, updatedAt: now },
			})
		summary.matched++
	}
	// Naming drift (a promoted club the table hasn't learned) produces no error,
	// just quietly odds-less fixtures — so say it in the log rather than leaving
	// it to whoever reads the cron's response body.
	if (summary.unmatched.length > 0) {
		console.warn(
			`[syncFixtureOdds] ${comp.id}: ${summary.unmatched.length} unmatched market(s) — check ODDS_API_NAME_TO_SHORT_NAME`,
			summary.unmatched,
		)
	}
	return summary
}
