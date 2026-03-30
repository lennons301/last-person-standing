import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { gamePlayers, gameweeks, picks } from "@/lib/schema/domain"
import { validateClassicPick } from "@/lib/picks/validation"
import type { PlayerStatus } from "@/lib/types"

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { gameId, gameweekId, teamId, fixtureId, mode, prediction, stake } = body

  const [gamePlayer] = await db
    .select()
    .from(gamePlayers)
    .where(
      and(
        eq(gamePlayers.gameId, gameId),
        eq(gamePlayers.playerId, session.user.id)
      )
    )

  if (!gamePlayer) {
    return NextResponse.json({ error: "Not a player in this game" }, { status: 403 })
  }

  const [gameweek] = await db
    .select()
    .from(gameweeks)
    .where(eq(gameweeks.id, gameweekId))

  if (!gameweek) {
    return NextResponse.json({ error: "Gameweek not found" }, { status: 404 })
  }

  if (mode === "classic" || mode === "escalating") {
    const previousPicks = await db
      .select({ teamId: picks.teamId })
      .from(picks)
      .where(
        and(eq(picks.gameId, gameId), eq(picks.playerId, session.user.id))
      )

    const validation = validateClassicPick({
      teamId,
      gameweekDeadline: gameweek.deadline,
      now: new Date(),
      playerStatus: gamePlayer.status as PlayerStatus,
      previousTeamIds: previousPicks.map((p) => p.teamId),
    })

    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400 })
    }
  }

  try {
    const [pick] = await db
      .insert(picks)
      .values({
        gameId,
        playerId: session.user.id,
        gameweekId,
        teamId,
        fixtureId: fixtureId ?? null,
        mode,
        prediction: prediction ?? null,
        stake: stake ?? null,
      })
      .returning()

    return NextResponse.json(pick)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit pick" },
      { status: 400 }
    )
  }
}
