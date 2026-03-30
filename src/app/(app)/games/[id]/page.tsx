import { notFound } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { Leaderboard } from "@/components/features/leaderboard/leaderboard"
import { JoinGameButton } from "@/components/features/games/join-game-button"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { GameMode, PlayerStatus } from "@/lib/types"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()

  const players = await db
    .select({
      playerId: gamePlayers.playerId,
      status: gamePlayers.status,
      eliminatedAtGameweek: gamePlayers.eliminatedAtGameweek,
      displayName: user.name,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const isPlayer = players.some((p) => p.playerId === session.user.id)
  const isCreator = game.createdBy === session.user.id

  const leaderboardEntries = players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    status: p.status as PlayerStatus,
    eliminatedAt: p.eliminatedAtGameweek,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{game.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline">{game.mode}</Badge>
            <Badge variant="secondary">{game.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {!isPlayer && game.status === "open" && <JoinGameButton gameId={id} />}
          {isPlayer && game.status !== "finished" && (
            <Link
              href={`/pick/${id}/${game.mode}`}
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Make pick
            </Link>
          )}
          {isCreator && (
            <Link
              href={`/games/${id}/admin`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
      <Leaderboard entries={leaderboardEntries} mode={game.mode as GameMode} />
    </div>
  )
}
