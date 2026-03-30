export interface ScoresProvider {
  fetchLiveScores(): Promise<LiveScore[]>
  fetchResults(gameweekId: number): Promise<MatchResult[]>
}

export interface LiveScore {
  fixtureId: number
  homeTeamId: number
  awayTeamId: number
  homeScore: number
  awayScore: number
  status: "scheduled" | "in_progress" | "finished"
  minute?: number
}

export interface MatchResult {
  fixtureId: number
  homeScore: number
  awayScore: number
  finished: boolean
}
