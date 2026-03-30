export interface FPLBootstrapResponse {
  events: FPLEvent[]
  teams: FPLTeam[]
}

export interface FPLEvent {
  id: number
  name: string
  deadline_time: string
  finished: boolean
}

export interface FPLTeam {
  id: number
  name: string
  short_name: string
  code: number
}

export interface FPLFixture {
  id: number
  event: number
  finished: boolean
  kickoff_time: string
  started: boolean
  team_a: number
  team_a_score: number | null
  team_h: number
  team_h_score: number | null
}
