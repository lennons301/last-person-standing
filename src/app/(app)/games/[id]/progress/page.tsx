import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers, picks, teams } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { EliminationGrid } from "@/components/features/progress/elimination-grid"

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()

  const players = await db
    .select({ playerId: gamePlayers.playerId, status: gamePlayers.status, displayName: user.name })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const allPicks = await db
    .select({
      playerId: picks.playerId,
      gameweekId: picks.gameweekId,
      result: picks.result,
      teamShortName: teams.shortName,
    })
    .from(picks)
    .innerJoin(teams, eq(picks.teamId, teams.id))
    .where(eq(picks.gameId, id))
    .orderBy(picks.gameweekId)

  const gameweekIds = [...new Set(allPicks.map((p) => p.gameweekId))].sort((a, b) => a - b)

  const playerProgress = players.map((p) => ({
    displayName: p.displayName,
    status: p.status,
    picks: allPicks
      .filter((pick) => pick.playerId === p.playerId)
      .map((pick) => ({
        gameweekId: pick.gameweekId,
        teamShortName: pick.teamShortName,
        result: pick.result,
      })),
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{game.name} — Progress</h1>
      <EliminationGrid players={playerProgress} gameweekIds={gameweekIds} />
    </div>
  )
}
