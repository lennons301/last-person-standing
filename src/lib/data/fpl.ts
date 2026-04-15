import type {
	AdapterFixture,
	AdapterFixtureScore,
	AdapterRound,
	AdapterTeam,
	CompetitionAdapter,
} from './types'

const FPL_BASE = 'https://fantasy.premierleague.com/api'

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
		const res = await fetch(`${FPL_BASE}/bootstrap-static/`)
		this.bootstrapCache = (await res.json()) as FplBootstrap
		return this.bootstrapCache
	}

	private async getFixtures(): Promise<FplFixture[]> {
		if (this.fixturesCache) return this.fixturesCache
		const res = await fetch(`${FPL_BASE}/fixtures/`)
		this.fixturesCache = (await res.json()) as FplFixture[]
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
