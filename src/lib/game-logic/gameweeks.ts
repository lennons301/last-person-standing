import type { Gameweek, Fixture } from "@/lib/types"

export function getGameweeksToActivate(gameweeks: Gameweek[], now: Date): number[] {
  return gameweeks.filter((gw) => !gw.finished && gw.deadline < now).map((gw) => gw.id)
}

export function isGameweekComplete(fixtures: Fixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => f.finished)
}
