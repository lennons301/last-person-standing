import { describe, it, expect } from "vitest"
import { validateClassicPick } from "./validation"
import type { PlayerStatus } from "@/lib/types"

describe("validateClassicPick", () => {
  const baseContext = {
    gameweekDeadline: new Date("2025-08-30T10:00:00Z"),
    now: new Date("2025-08-29T12:00:00Z"),
    playerStatus: "alive" as PlayerStatus,
    previousTeamIds: [1, 5, 12],
  }

  it("allows valid pick before deadline", () => {
    expect(validateClassicPick({ teamId: 6, ...baseContext })).toEqual({ valid: true })
  })

  it("rejects pick after deadline", () => {
    expect(validateClassicPick({ teamId: 6, ...baseContext, now: new Date("2025-08-30T11:00:00Z") }))
      .toEqual({ valid: false, reason: "Deadline has passed" })
  })

  it("rejects pick from eliminated player", () => {
    expect(validateClassicPick({ teamId: 6, ...baseContext, playerStatus: "eliminated" }))
      .toEqual({ valid: false, reason: "Player is eliminated" })
  })

  it("rejects pick reusing a previously picked team", () => {
    expect(validateClassicPick({ teamId: 12, ...baseContext }))
      .toEqual({ valid: false, reason: "Team already used in this game" })
  })
})
