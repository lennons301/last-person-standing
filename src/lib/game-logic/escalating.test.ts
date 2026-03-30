import { describe, it, expect } from "vitest"
import { evaluateEscalatingPicks } from "./escalating"
import type { Pick, Fixture } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1", gameId: "game-1", playerId: "player-1",
    gameweekId: 1, teamId: 1, fixtureId: 1, mode: "escalating",
    prediction: null, stake: "10", cupRound: null,
    result: "pending", createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1, gameweekId: 1, homeTeamId: 1, awayTeamId: 2,
    homeScore: 2, awayScore: 1, kickoff: new Date("2025-01-01T15:00:00Z"),
    started: true, finished: true, ...overrides,
  }
}

describe("evaluateEscalatingPicks", () => {
  it("uses same win/loss logic as classic (team must win, draw = loss)", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1, stake: "10" })]
    const fixtures = [makeFixture({ homeScore: 2, awayScore: 1 })]
    const results = evaluateEscalatingPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks draw as loss", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1, stake: "20" })]
    const fixtures = [makeFixture({ homeScore: 1, awayScore: 1 })]
    const results = evaluateEscalatingPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })
})
