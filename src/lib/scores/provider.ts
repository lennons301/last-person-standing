import type { ScoresProvider, LiveScore, MatchResult } from "./types"

export const stubProvider: ScoresProvider = {
  async fetchLiveScores(): Promise<LiveScore[]> {
    console.warn("ScoresProvider: using stub — no live scores available")
    return []
  },
  async fetchResults(_gameweekId: number): Promise<MatchResult[]> {
    console.warn("ScoresProvider: using stub — no results available")
    return []
  },
}
