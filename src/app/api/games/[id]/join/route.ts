import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { gamePlayers } from "@/lib/schema/domain"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await db.insert(gamePlayers).values({
      gameId: id,
      playerId: session.user.id,
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Already in this game" }, { status: 400 })
  }
}
