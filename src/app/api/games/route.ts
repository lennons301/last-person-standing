import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { name, mode, entryFee, startingGameweek } = await request.json()

  const [game] = await db
    .insert(games)
    .values({
      name,
      mode,
      createdBy: session.user.id,
      entryFee: entryFee ?? null,
      startingGameweek: startingGameweek ?? null,
    })
    .returning()

  await db.insert(gamePlayers).values({
    gameId: game.id,
    playerId: session.user.id,
  })

  return NextResponse.json(game)
}
