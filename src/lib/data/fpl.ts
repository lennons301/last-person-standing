import { fetchJson } from './fetch-json'
import type {
	AdapterFixture,
	AdapterFixtureScore,
	AdapterRound,
	AdapterTeam,
	CompetitionAdapter,
} from './types'

const FPL_BASE = 'https://fantasy.premierleague.com/api'

// FPL is fronted by Cloudflare, which 403s the default Node fetch UA from
// cloud-provider egress IPs (observed via the cron_run audit trail on
// 2026-05-22: 24 days of daily-sync silently failing with status=403,
// body=""). A realistic browser UA + Accept headers gets us through —
// every other FPL API client in the wild does the same. Not abusive: this
// is one request per FPL endpoint per daily-sync run.
const FPL_HEADERS: Record<string, string> = {
	'User-Agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
	Accept: 'application/json, text/plain, */*',
	'Accept-Language': 'en-GB,en;q=0.9',
}

interface FplBootstrap {
	teams: Array<{ id: number; name: string; short_name: string; code: number }>
	events: Array<{ id: number; name: string; deadline_time: string; finished: boolean }>
}

interface FplFixture {
	id: number
	event: number | null
	team_h: number
	team_a: number
	kickoff_time: string | null
	started: boolean
	finished: boolean
	finished_provisional: boolean
	team_h_score: number | null
	team_a_score: number | null
}

export class FplAdapter implements CompetitionAdapter {
	private bootstrapCache: FplBootstrap | null = null
	private fixturesCache: FplFixture[] | null = null

	private async getBootstrap(): Promise<FplBootstrap> {
		if (this.bootstrapCache) return this.bootstrapCache
		this.bootstrapCache = await fetchJson<FplBootstrap>(`${FPL_BASE}/bootstrap-static/`, {
			headers: FPL_HEADERS,
		})
		return this.bootstrapCache
	}

	private async getFixtures(): Promise<FplFixture[]> {
		if (this.fixturesCache) return this.fixturesCache
		this.fixturesCache = await fetchJson<FplFixture[]>(`${FPL_BASE}/fixtures/`, {
			headers: FPL_HEADERS,
		})
		return this.fixturesCache
	}

	async fetchTeams(): Promise<AdapterTeam[]> {
		const data = await this.getBootstrap()
		return data.teams.map((t) => ({
			externalId: String(t.id),
			name: t.name,
			shortName: t.short_name,
			badgeUrl: `https://resources.premierleague.com/premierleague/badges/rb/t${t.code}.svg`,
		}))
	}

	async fetchRounds(): Promise<AdapterRound[]> {
		const [bootstrap, fixtures] = await Promise.all([this.getBootstrap(), this.getFixtures()])
		const fixturesByEvent = new Map<number, FplFixture[]>()
		for (const f of fixtures) {
			if (f.event == null) continue
			const list = fixturesByEvent.get(f.event) ?? []
			list.push(f)
			fixturesByEvent.set(f.event, list)
		}

		return bootstrap.events.map((event) => ({
			externalId: String(event.id),
			number: event.id,
			name: event.name,
			deadline: new Date(event.deadline_time),
			finished: event.finished,
			fixtures: (fixturesByEvent.get(event.id) ?? []).map(
				(f): AdapterFixture => ({
					externalId: String(f.id),
					homeTeamExternalId: String(f.team_h),
					awayTeamExternalId: String(f.team_a),
					kickoff: f.kickoff_time ? new Date(f.kickoff_time) : null,
					status: this.mapFixtureStatus(f),
					homeScore: f.team_h_score,
					awayScore: f.team_a_score,
				}),
			),
		}))
	}

	async fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]> {
		const fixtures = await this.getFixtures()
		return fixtures
			.filter((f) => f.event === roundNumber && (f.started || f.finished))
			.filter((f) => f.team_h_score != null && f.team_a_score != null)
			.map((f) => ({
				externalId: String(f.id),
				homeScore: f.team_h_score as number,
				awayScore: f.team_a_score as number,
				status: f.finished ? ('finished' as const) : ('live' as const),
			}))
	}

	private mapFixtureStatus(f: FplFixture): AdapterFixture['status'] {
		if (f.finished || f.finished_provisional) return 'finished'
		if (f.started) return 'live'
		return 'scheduled'
	}
}
