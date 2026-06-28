export interface CompetitionAdapter {
	fetchTeams(): Promise<AdapterTeam[]>
	fetchRounds(): Promise<AdapterRound[]>
	fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]>
	fetchStandings?(): Promise<AdapterStanding[]>
}

export interface AdapterStanding {
	teamExternalId: string
	position: number
	played: number
	won: number
	drawn: number
	lost: number
	points: number
}

export interface AdapterTeam {
	externalId: string
	name: string
	shortName: string
	badgeUrl: string | null
}

export interface AdapterRound {
	externalId: string
	number: number
	name: string
	deadline: Date | null
	finished: boolean
	fixtures: AdapterFixture[]
}

export interface AdapterFixture {
	externalId: string
	homeTeamExternalId: string
	awayTeamExternalId: string
	kickoff: Date | null
	status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
	homeScore: number | null
	awayScore: number | null
	/** 90-minute (regulation) score, when the source reports it separately (e.g.
	 * football-data's `regularTime` for ET/penalty knockouts). Null/undefined when
	 * not applicable — regulation-only matches equal the full-time score. */
	regularHomeScore?: number | null
	regularAwayScore?: number | null
	/** Authoritative winner for ET/penalty results (level full-time score); null otherwise. */
	winner?: 'home' | 'away' | null
}

export interface AdapterFixtureScore {
	externalId: string
	homeScore: number
	awayScore: number
	status: 'live' | 'finished' | 'cancelled'
	/** 90-minute (regulation) score when reported separately (ET/penalty knockouts). */
	regularHomeScore?: number | null
	regularAwayScore?: number | null
	/** Authoritative winner for ET/penalty results (level full-time score); null otherwise. */
	winner?: 'home' | 'away' | null
}
