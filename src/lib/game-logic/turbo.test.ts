import { describe, it, expect } from "vitest"
import { scoreTurboPicks, rankTurboPlayers } from "./turbo"
import type { Pick, Fixture } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1",
    gameId: "game-1",
    playerId: "player-1",
    gameweekId: 1,
    teamId: 1,
    fixtureId: 1,
    mode: "turbo",
    prediction: "home",
    stake: null,
    cupRound: null,
    result: "pending",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    gameweekId: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 2,
    awayScore: 1,
    kickoff: new Date("2025-01-01T15:00:00Z"),
    started: true,
    finished: true,
    ...overrides,
  }
}

describe("scoreTurboPicks", () => {
  it("awards won for correct home prediction", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 2, awayScore: 0 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("awards won for correct draw prediction", () => {
    const picks = [makePick({ prediction: "draw", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 1, awayScore: 1 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("awards won for correct away prediction", () => {
    const picks = [makePick({ prediction: "away", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 0, awayScore: 2 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks lost for incorrect prediction", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 0, awayScore: 2 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("keeps pending when scores not available", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: null, awayScore: null })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("pending")
  })
})

describe("rankTurboPlayers", () => {
  it("ranks players by correct predictions descending", () => {
    const picks = [
      makePick({ playerId: "p1", fixtureId: 1, result: "won" }),
      makePick({ playerId: "p1", fixtureId: 2, result: "won" }),
      makePick({ playerId: "p2", fixtureId: 1, result: "won" }),
      makePick({ playerId: "p2", fixtureId: 2, result: "lost" }),
    ]
    const rankings = rankTurboPlayers(picks)
    expect(rankings[0]).toEqual({ playerId: "p1", points: 2 })
    expect(rankings[1]).toEqual({ playerId: "p2", points: 1 })
  })
})
