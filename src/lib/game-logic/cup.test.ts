import { describe, it, expect } from "vitest"
import { resolveCupFixture } from "./cup"

describe("resolveCupFixture", () => {
  it("returns player1 as winner when fixture result favours them", () => {
    const result = resolveCupFixture({
      player1Id: "p1", player2Id: "p2",
      fixtureHomeScore: 2, fixtureAwayScore: 1, player1PickedHome: true,
    })
    expect(result).toBe("p1")
  })

  it("returns player2 as winner when fixture result favours them", () => {
    const result = resolveCupFixture({
      player1Id: "p1", player2Id: "p2",
      fixtureHomeScore: 0, fixtureAwayScore: 2, player1PickedHome: true,
    })
    expect(result).toBe("p2")
  })

  it("returns null when fixture is a draw", () => {
    const result = resolveCupFixture({
      player1Id: "p1", player2Id: "p2",
      fixtureHomeScore: 1, fixtureAwayScore: 1, player1PickedHome: true,
    })
    expect(result).toBeNull()
  })

  it("handles player1 picking away side", () => {
    const result = resolveCupFixture({
      player1Id: "p1", player2Id: "p2",
      fixtureHomeScore: 0, fixtureAwayScore: 3, player1PickedHome: false,
    })
    expect(result).toBe("p1")
  })
})
