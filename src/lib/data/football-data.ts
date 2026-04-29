import type { competition } from '@/lib/schema/competition'
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
	homeTeam: FdTeam
	awayTeam: FdTeam
	utcDate: string
	status: string
	score: { fullTime: { home: number | null; away: number | null } }
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
		const res = await fetch(`${BASE_URL}${path}`, {
			headers: { 'X-Auth-Token': this.apiKey },
		})
		return res.json() as Promise<T>
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
		const roundMap = new Map<number, FdMatch[]>()
		for (const match of data.matches) {
			if (match.matchday == null) continue
			const list = roundMap.get(match.matchday) ?? []
			list.push(match)
			roundMap.set(match.matchday, list)
		}
		return Array.from(roundMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([matchday, matches]) => ({
				externalId: String(matchday),
				number: matchday,
				name: `Matchday ${matchday}`,
				deadline: null,
				finished: matches.every((m) => m.status === 'FINISHED'),
				fixtures: matches
					.filter((m) => m.homeTeam.id != null && m.awayTeam.id != null)
					.map(
						(m): AdapterFixture => ({
							externalId: String(m.id),
							homeTeamExternalId: String(m.homeTeam.id),
							awayTeamExternalId: String(m.awayTeam.id),
							kickoff: new Date(m.utcDate),
							status: this.mapStatus(m.status),
							homeScore: m.score.fullTime.home,
							awayScore: m.score.fullTime.away,
						}),
					),
			}))
	}

	async fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]> {
		const data = await this.request<{ matches: FdMatch[] }>(
			`/competitions/${this.competitionCode}/matches?matchday=${roundNumber}`,
		)
		return data.matches
			.filter((m) => m.score.fullTime.home != null && m.score.fullTime.away != null)
			.map((m) => ({
				externalId: String(m.id),
				homeScore: m.score.fullTime.home as number,
				awayScore: m.score.fullTime.away as number,
				status: m.status === 'FINISHED' ? ('finished' as const) : ('live' as const),
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
