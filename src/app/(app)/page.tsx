import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { gamePlayers, games } from "@/lib/schema/domain"

export default async function HomePage() {
  const session = await requireSession()

  const myGames = await db
    .select({
      gameId: gamePlayers.gameId,
      gameName: games.name,
      gameMode: games.mode,
      gameStatus: games.status,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(eq(gamePlayers.playerId, session.user.id))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Home</h1>
      <p className="text-muted-foreground">
        {myGames.length > 0
          ? `You're in ${myGames.length} game${myGames.length === 1 ? "" : "s"}.`
          : "You haven't joined any games yet."}
      </p>
    </div>
  )
}
