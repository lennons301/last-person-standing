import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { GameList } from "@/components/features/games/game-list"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { GameMode, GameStatus } from "@/lib/types"

export default async function GamesPage() {
  await requireSession()

  const gamesWithCount = await db
    .select({
      id: games.id,
      name: games.name,
      mode: games.mode,
      status: games.status,
      playerCount: sql<number>`count(${gamePlayers.id})::int`,
    })
    .from(games)
    .leftJoin(gamePlayers, eq(games.id, gamePlayers.gameId))
    .groupBy(games.id)
    .orderBy(desc(games.createdAt))

  const formatted = gamesWithCount.map((g) => ({
    id: g.id,
    name: g.name,
    mode: g.mode as GameMode,
    status: g.status as GameStatus,
    playerCount: g.playerCount ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Games</h1>
        <Button render={<Link href="/games/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New game
        </Button>
      </div>
      <GameList games={formatted} />
    </div>
  )
}
