import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"

async function verifyCreator(request: Request, gameId: string) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null
  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game || game.createdBy !== session.user.id) return null
  return session
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  if (!(await verifyCreator(request, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await db.delete(gamePlayers).where(
    and(eq(gamePlayers.gameId, id), eq(gamePlayers.playerId, playerId))
  )
  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  if (!(await verifyCreator(request, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { status } = await request.json()
  await db.update(gamePlayers).set({
    status,
    eliminatedAtGameweek: status === "alive" ? null : undefined,
  }).where(
    and(eq(gamePlayers.gameId, id), eq(gamePlayers.playerId, playerId))
  )
  return NextResponse.json({ success: true })
}
