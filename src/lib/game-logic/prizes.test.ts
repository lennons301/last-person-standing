import { describe, it, expect } from "vitest"
import { calculatePrizePot, splitPrize } from "./prizes"

describe("calculatePrizePot", () => {
  it("calculates pot from entry fee x player count", () => {
    expect(calculatePrizePot("10", 8)).toBe(80)
  })
  it("returns 0 when no entry fee", () => {
    expect(calculatePrizePot(null, 8)).toBe(0)
  })
})

describe("splitPrize", () => {
  it("divides pot equally among winners", () => {
    expect(splitPrize(100, 2)).toBe(50)
  })
  it("returns full pot for single winner", () => {
    expect(splitPrize(100, 1)).toBe(100)
  })
  it("returns 0 when no winners", () => {
    expect(splitPrize(100, 0)).toBe(0)
  })
})
