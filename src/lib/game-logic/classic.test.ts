import { describe, it, expect } from "vitest"
import {
  evaluateClassicPicks,
  determineClassicWinner,
} from "./classic"
import type { Pick, Fixture, GamePlayer } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1",
    gameId: "game-1",
    playerId: "player-1",
    gameweekId: 1,
    teamId: 1,
    fixtureId: 1,
    mode: "classic",
    prediction: null,
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

function makeGamePlayer(overrides: Partial<GamePlayer> = {}): GamePlayer {
  return {
    id: "gp-1",
    gameId: "game-1",
    playerId: "player-1",
    status: "alive",
    eliminatedAtGameweek: null,
    joinedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

describe("evaluateClassicPicks", () => {
  it("marks pick as won when picked team wins at home", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks pick as won when picked team wins away", () => {
    const picks = [makePick({ teamId: 2, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks pick as lost when picked team loses", () => {
    const picks = [makePick({ teamId: 2, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 3, awayScore: 0 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("marks pick as lost on a draw (classic: must win)", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("keeps pick as pending when fixture has no scores", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeScore: null, awayScore: null, finished: false }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("pending")
  })

  it("finds the correct fixture for each pick", () => {
    const picks = [
      makePick({ id: "p1", teamId: 1, fixtureId: 1 }),
      makePick({ id: "p2", playerId: "player-2", teamId: 3, fixtureId: 2 }),
    ]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 0 }),
      makeFixture({ id: 2, homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
    expect(results[1].result).toBe("lost")
  })
})

describe("determineClassicWinner", () => {
  it("returns no winner when multiple players alive", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "alive" }),
      makeGamePlayer({ playerId: "p2", status: "alive" }),
    ]
    expect(determineClassicWinner(players)).toBeNull()
  })

  it("returns single winner", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "alive" }),
      makeGamePlayer({ playerId: "p2", status: "eliminated" }),
      makeGamePlayer({ playerId: "p3", status: "eliminated" }),
    ]
    const result = determineClassicWinner(players)
    expect(result).toEqual({ winners: ["p1"], isSplit: false })
  })

  it("returns split when all remaining eliminated in same gameweek", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "eliminated", eliminatedAtGameweek: 5 }),
      makeGamePlayer({ playerId: "p2", status: "eliminated", eliminatedAtGameweek: 5 }),
      makeGamePlayer({ playerId: "p3", status: "eliminated", eliminatedAtGameweek: 3 }),
    ]
    const result = determineClassicWinner(players)
    expect(result).toEqual({ winners: ["p1", "p2"], isSplit: true })
  })

  it("returns null when no players at all", () => {
    expect(determineClassicWinner([])).toBeNull()
  })
})
