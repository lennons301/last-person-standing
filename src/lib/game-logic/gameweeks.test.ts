import { describe, it, expect } from "vitest"
import { getGameweeksToActivate, isGameweekComplete } from "./gameweeks"
import type { Gameweek, Fixture } from "@/lib/types"

describe("getGameweeksToActivate", () => {
  it("returns gameweeks past their deadline", () => {
    const now = new Date("2025-08-20T12:00:00Z")
    const gameweeks: Gameweek[] = [
      { id: 1, name: "GW1", deadline: new Date("2025-08-16T10:00:00Z"), finished: false },
      { id: 2, name: "GW2", deadline: new Date("2025-08-23T10:00:00Z"), finished: false },
    ]
    expect(getGameweeksToActivate(gameweeks, now)).toEqual([1])
  })

  it("excludes already-finished gameweeks", () => {
    const now = new Date("2025-08-20T12:00:00Z")
    const gameweeks: Gameweek[] = [
      { id: 1, name: "GW1", deadline: new Date("2025-08-16T10:00:00Z"), finished: true },
    ]
    expect(getGameweeksToActivate(gameweeks, now)).toEqual([])
  })
})

describe("isGameweekComplete", () => {
  it("returns true when all fixtures finished", () => {
    const fixtures: Fixture[] = [
      { id: 1, gameweekId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, kickoff: null, started: true, finished: true },
      { id: 2, gameweekId: 1, homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 0, kickoff: null, started: true, finished: true },
    ]
    expect(isGameweekComplete(fixtures)).toBe(true)
  })

  it("returns false when any fixture not finished", () => {
    const fixtures: Fixture[] = [
      { id: 1, gameweekId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, kickoff: null, started: true, finished: true },
      { id: 2, gameweekId: 1, homeTeamId: 3, awayTeamId: 4, homeScore: null, awayScore: null, kickoff: null, started: false, finished: false },
    ]
    expect(isGameweekComplete(fixtures)).toBe(false)
  })

  it("returns false when no fixtures", () => {
    expect(isGameweekComplete([])).toBe(false)
  })
})
