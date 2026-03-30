import type { Pick, Fixture, GamePlayer, PickResult } from "@/lib/types"

interface EvaluatedPick extends Pick {
  result: PickResult
}

function didTeamWin(teamId: number, fixture: Fixture): boolean | null {
  if (fixture.homeScore === null || fixture.awayScore === null) return null
  if (fixture.homeTeamId === teamId) return fixture.homeScore > fixture.awayScore
  if (fixture.awayTeamId === teamId) return fixture.awayScore > fixture.homeScore
  return null
}

export function evaluateClassicPicks(
  picks: Pick[],
  fixtures: Fixture[]
): EvaluatedPick[] {
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]))

  return picks.map((pick) => {
    const fixture = fixtureMap.get(pick.fixtureId!)
    if (!fixture) return { ...pick, result: "pending" as const }

    const won = didTeamWin(pick.teamId, fixture)
    if (won === null) return { ...pick, result: "pending" as const }

    return { ...pick, result: won ? ("won" as const) : ("lost" as const) }
  })
}

interface WinnerResult {
  winners: string[]
  isSplit: boolean
}

export function determineClassicWinner(
  players: GamePlayer[]
): WinnerResult | null {
  if (players.length === 0) return null

  const alive = players.filter((p) => p.status === "alive")

  if (alive.length === 1) {
    return { winners: [alive[0].playerId], isSplit: false }
  }

  if (alive.length > 1) return null

  // All eliminated — find who was eliminated last (highest gameweek)
  const maxGw = Math.max(
    ...players
      .filter((p) => p.eliminatedAtGameweek !== null)
      .map((p) => p.eliminatedAtGameweek!)
  )

  const lastEliminated = players.filter(
    (p) => p.eliminatedAtGameweek === maxGw
  )

  return {
    winners: lastEliminated.map((p) => p.playerId),
    isSplit: lastEliminated.length > 1,
  }
}
