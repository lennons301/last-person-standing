import type { Pick, Fixture, PickResult } from "@/lib/types"

interface EvaluatedPick extends Pick {
  result: PickResult
}

function getActualResult(fixture: Fixture): "home" | "draw" | "away" | null {
  if (fixture.homeScore === null || fixture.awayScore === null) return null
  if (fixture.homeScore > fixture.awayScore) return "home"
  if (fixture.awayScore > fixture.homeScore) return "away"
  return "draw"
}

export function scoreTurboPicks(
  picks: Pick[],
  fixtures: Fixture[]
): EvaluatedPick[] {
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]))

  return picks.map((pick) => {
    const fixture = fixtureMap.get(pick.fixtureId!)
    if (!fixture) return { ...pick, result: "pending" as const }

    const actual = getActualResult(fixture)
    if (!actual) return { ...pick, result: "pending" as const }

    const correct = pick.prediction === actual
    return { ...pick, result: correct ? ("won" as const) : ("lost" as const) }
  })
}

export interface TurboRanking {
  playerId: string
  points: number
}

export function rankTurboPlayers(picks: Pick[]): TurboRanking[] {
  const pointsByPlayer = new Map<string, number>()

  for (const pick of picks) {
    const current = pointsByPlayer.get(pick.playerId) ?? 0
    pointsByPlayer.set(
      pick.playerId,
      current + (pick.result === "won" ? 1 : 0)
    )
  }

  return Array.from(pointsByPlayer.entries())
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points)
}
