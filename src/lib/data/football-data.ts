import type { competition } from '@/lib/schema/competition'
import { fetchJson } from './fetch-json'
import type {
	AdapterFixture,
	AdapterFixtureScore,
	AdapterRound,
	AdapterTeam,
	CompetitionAdapter,
} from './types'

const BASE_URL = 'https://api.football-data.org/v4'

/**
 * Resolve the football-data.org competition code for a competition row.
 *
 * Returns the explicit `externalId` when present, or falls back to `'PL'`
 * for FPL-sourced competitions (which effectively mirror the Premier
 * League on football-data.org). Returns `null` when no code can be
 * determined, in which case the competition cannot be dispatched.
 */
export function resolveFootballDataCode(
	comp: Pick<typeof competition.$inferSelect, 'externalId' | 'dataSource'>,
): string | null {
	if (comp.externalId) return comp.externalId
	if (comp.dataSource === 'fpl') return 'PL'
	return null
}

interface FdTeam {
	id: number | null
	name: string | null
	tla: string | null
	crest: string | null
}

interface FdMatch {
	id: number
	matchday: number | null
	/**
	 * Tournament stage. Group/league matches carry a `matchday`; knockout matches
	 * have `matchday: null` and are distinguished only by `stage`
	 * (LAST_32 / LAST_16 / QUARTER_FINALS / SEMI_FINALS / THIRD_PLACE / FINAL).
	 */
	stage?: string | null
	homeTeam: FdTeam
	awayTeam: FdTeam
	utcDate: string
	status: string
	// `winner` is the authoritative outcome ('HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' |
	// null). For knockout ties decided in ET/penalties, fullTime stays level but
	// winner names the side that advanced.
	score: {
		winner?: string | null
		// `fullTime` includes extra time (and, for shootouts, penalties).
		// `regularTime` is the 90-minute score (present for ET/penalty matches).
		fullTime: { home: number | null; away: number | null }
		regularTime?: { home: number | null; away: number | null }
	}
}

/** Map football-data `score.winner` to our home/away marker (DRAW/null → null). */
function mapWinner(winner: string | null | undefined): 'home' | 'away' | null {
	if (winner === 'HOME_TEAM') return 'home'
	if (winner === 'AWAY_TEAM') return 'away'
	return null
}

/**
 * Knockout stages in bracket order. The round NUMBER for a knockout stage is
 * `maxGroupMatchday + (index in this list) + 1`, so for a competition whose
 * group stage runs to matchday 3 (the World Cup) the knockout rounds become
 * 4 (Round of 32) … 8 (Final). THIRD_PLACE is intentionally absent — the
 * third-place playoff is a consolation match between two already-eliminated
 * teams, not a survivor round, so it is excluded from the round structure.
 */
const KO_STAGE_ORDER = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'] as const

const KO_STAGE_NAMES: Record<string, string> = {
	LAST_32: 'Round of 32',
	LAST_16: 'Round of 16',
	QUARTER_FINALS: 'Quarter-finals',
	SEMI_FINALS: 'Semi-finals',
	FINAL: 'Final',
}

/** Highest matchday across the match set (0 if none carry a matchday). */
function maxGroupMatchday(matches: FdMatch[]): number {
	let max = 0
	for (const m of matches) {
		if (m.matchday != null && m.matchday > max) max = m.matchday
	}
	return max
}

/**
 * Resolve a match to its round NUMBER. Group/league matches map to their
 * `matchday`; knockout matches (matchday=null) map by `stage` to a number after
 * the last group matchday. Returns null for matches we don't model as a survivor
 * round (unknown stage, or THIRD_PLACE) — the caller skips them.
 */
function roundNumberForMatch(m: FdMatch, maxMatchday: number): number | null {
	if (m.matchday != null) return m.matchday
	const idx = KO_STAGE_ORDER.indexOf((m.stage ?? '') as (typeof KO_STAGE_ORDER)[number])
	if (idx === -1) return null
	return maxMatchday + idx + 1
}

/** Round display name from the matches grouped under it. */
function roundNameForMatches(number: number, matches: FdMatch[]): string {
	const first = matches[0]
	if (first?.matchday != null) return `Matchday ${number}`
	const stageName = first?.stage ? KO_STAGE_NAMES[first.stage] : undefined
	return stageName ?? `Round ${number}`
}

interface FdStandingEntry {
	position: number
	team: { id: number }
	playedGames: number
	won: number
	draw: number
	lost: number
	points: number
}

export interface StandingRow {
	teamExternalId: string
	position: number
	played: number
	won: number
	drawn: number
	lost: number
	points: number
}

export class FootballDataAdapter implements CompetitionAdapter {
	constructor(
		private competitionCode: string,
		private apiKey: string,
	) {}

	private async request<T>(path: string): Promise<T> {
		return fetchJson<T>(`${BASE_URL}${path}`, {
			headers: { 'X-Auth-Token': this.apiKey },
		})
	}

	async fetchTeams(): Promise<AdapterTeam[]> {
		const data = await this.request<{ matches: FdMatch[] }>(
			`/competitions/${this.competitionCode}/matches`,
		)
		const teamMap = new Map<string, AdapterTeam>()
		for (const match of data.matches) {
			for (const t of [match.homeTeam, match.awayTeam]) {
				if (t.id == null || t.name == null) continue
				if (!teamMap.has(String(t.id))) {
					teamMap.set(String(t.id), {
						externalId: String(t.id),
						name: t.name,
						shortName: t.tla ?? t.name.slice(0, 3).toUpperCase(),
						badgeUrl: t.crest ?? null,
					})
				}
			}
		}
		return Array.from(teamMap.values())
	}

	async fetchRounds(): Promise<AdapterRound[]> {
		const data = await this.request<{ matches: FdMatch[] }>(
			`/competitions/${this.competitionCode}/matches`,
		)
		// Map every match to a round NUMBER — group/league matches by matchday,
		// knockout matches (matchday=null) by stage (see roundNumberForMatch).
		// Knockout rounds are seeded as round rows even before the bracket is
		// drawn: their matches exist (with TBD teams) so the round number + name
		// are known. This is essential for survivor-game progression — without
		// the knockout round rows, `nextRoundExists` is false at the end of the
		// group stage and a classic game wrongly auto-completes (the dc857c5f
		// MD3 incident).
		const maxMatchday = maxGroupMatchday(data.matches)
		const roundMap = new Map<number, FdMatch[]>()
		for (const match of data.matches) {
			const number = roundNumberForMatch(match, maxMatchday)
			if (number == null) continue
			const list = roundMap.get(number) ?? []
			list.push(match)
			roundMap.set(number, list)
		}
		return Array.from(roundMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([number, matches]) => {
				// Only matches with both teams resolved become fixtures. Knockout
				// rounds with a TBD bracket yield zero fixtures (and a null deadline)
				// until the draw is known — the round row still exists so the game
				// can advance to it / wait at it.
				const playable = matches.filter((m) => m.homeTeam.id != null && m.awayTeam.id != null)
				// Round deadline = earliest kickoff − 90 minutes. Matches the FPL
				// convention (FPL's event.deadline_time is 90 min before the first
				// match) and aligns with public team-news release. football-data
				// doesn't supply a separate deadline concept, so we derive from
				// kickoffs. Knockout rounds with TBD fixtures have no playable
				// kickoffs yet — deadline stays null until the bracket is published.
				const earliestKickoff = playable
					.map((m) => new Date(m.utcDate).getTime())
					.filter((t) => Number.isFinite(t))
					.reduce((min, t) => (min === null || t < min ? t : min), null as number | null)
				const deadline = earliestKickoff != null ? new Date(earliestKickoff - 90 * 60 * 1000) : null
				return {
					externalId: String(number),
					number,
					name: roundNameForMatches(number, matches),
					deadline,
					finished: matches.every((m) => m.status === 'FINISHED'),
					fixtures: playable.map(
						(m): AdapterFixture => ({
							externalId: String(m.id),
							homeTeamExternalId: String(m.homeTeam.id),
							awayTeamExternalId: String(m.awayTeam.id),
							kickoff: new Date(m.utcDate),
							status: this.mapStatus(m.status),
							homeScore: m.score.fullTime.home,
							awayScore: m.score.fullTime.away,
							regularHomeScore: m.score.regularTime?.home ?? null,
							regularAwayScore: m.score.regularTime?.away ?? null,
							winner: mapWinner(m.score.winner),
						}),
					),
				}
			})
	}

	async fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]> {
		// Fetch all matches and resolve each to its round number via the shared
		// mapping, then filter to the requested round. The `?matchday=` filter
		// can't be used because knockout matches have matchday=null and are keyed
		// by stage — querying `?matchday=4` would return nothing for the Round of
		// 32. (Trade-off: one all-matches request per active competition per poll
		// rather than a single-matchday request; acceptable for the tournament
		// sizes here.)
		const data = await this.request<{ matches: FdMatch[] }>(
			`/competitions/${this.competitionCode}/matches`,
		)
		const maxMatchday = maxGroupMatchday(data.matches)
		return data.matches
			.filter((m) => roundNumberForMatch(m, maxMatchday) === roundNumber)
			.filter((m) => m.score.fullTime.home != null && m.score.fullTime.away != null)
			.map((m) => ({
				externalId: String(m.id),
				homeScore: m.score.fullTime.home as number,
				awayScore: m.score.fullTime.away as number,
				regularHomeScore: m.score.regularTime?.home ?? null,
				regularAwayScore: m.score.regularTime?.away ?? null,
				status: m.status === 'FINISHED' ? ('finished' as const) : ('live' as const),
				winner: mapWinner(m.score.winner),
			}))
	}

	async fetchStandings(): Promise<StandingRow[]> {
		const data = await this.request<{
			standings: Array<{ type: string; table: FdStandingEntry[] }>
		}>(`/competitions/${this.competitionCode}/standings`)
		const total = data.standings.find((s) => s.type === 'TOTAL')
		if (!total) return []
		return total.table.map((entry) => ({
			teamExternalId: String(entry.team.id),
			position: entry.position,
			played: entry.playedGames,
			won: entry.won,
			drawn: entry.draw,
			lost: entry.lost,
			points: entry.points,
		}))
	}

	private mapStatus(fdStatus: string): AdapterFixture['status'] {
		switch (fdStatus) {
			case 'FINISHED':
				return 'finished'
			case 'IN_PLAY':
			case 'PAUSED':
			case 'HALFTIME':
				return 'live'
			case 'POSTPONED':
			case 'CANCELLED':
				return 'postponed'
			default:
				return 'scheduled'
		}
	}
}
