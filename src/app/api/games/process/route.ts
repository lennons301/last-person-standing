import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  gameweeks,
  fixtures,
  games,
  gamePlayers,
  gameGameweeks,
  picks,
  gameWinners,
} from "@/lib/schema/domain"
import {
  getGameweeksToActivate,
  isGameweekComplete,
} from "@/lib/game-logic/gameweeks"
import {
  evaluateClassicPicks,
  determineClassicWinner,
} from "@/lib/game-logic/classic"
import { scoreTurboPicks } from "@/lib/game-logic/turbo"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const allGameweeks = await db.select().from(gameweeks)
    const toActivate = getGameweeksToActivate(allGameweeks, new Date())

    for (const gwId of toActivate) {
      await db
        .update(gameGameweeks)
        .set({ status: "active" })
        .where(
          and(
            eq(gameGameweeks.gameweekId, gwId),
            eq(gameGameweeks.status, "pending")
          )
        )
    }

    const activeGameGws = await db
      .select()
      .from(gameGameweeks)
      .where(eq(gameGameweeks.status, "active"))

    for (const ggw of activeGameGws) {
      const gwFixtures = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.gameweekId, ggw.gameweekId))

      if (!isGameweekComplete(gwFixtures)) continue

      await db
        .update(gameGameweeks)
        .set({ status: "complete" })
        .where(eq(gameGameweeks.id, ggw.id))

      const [game] = await db
        .select()
        .from(games)
        .where(eq(games.id, ggw.gameId))

      if (!game) continue

      const gwPicks = await db
        .select()
        .from(picks)
        .where(
          and(
            eq(picks.gameId, game.id),
            eq(picks.gameweekId, ggw.gameweekId)
          )
        )

      if (game.mode === "classic" || game.mode === "escalating") {
        const evaluated = evaluateClassicPicks(gwPicks, gwFixtures)

        for (const pick of evaluated) {
          await db
            .update(picks)
            .set({ result: pick.result })
            .where(eq(picks.id, pick.id))

          if (pick.result === "lost") {
            await db
              .update(gamePlayers)
              .set({
                status: "eliminated",
                eliminatedAtGameweek: ggw.gameweekId,
              })
              .where(
                and(
                  eq(gamePlayers.gameId, game.id),
                  eq(gamePlayers.playerId, pick.playerId)
                )
              )
          }
        }

        const players = await db
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, game.id))

        const winnerResult = determineClassicWinner(players)
        if (winnerResult) {
          await db
            .update(games)
            .set({ status: "finished" })
            .where(eq(games.id, game.id))

          for (const winnerId of winnerResult.winners) {
            await db.insert(gameWinners).values({
              gameId: game.id,
              playerId: winnerId,
              isSplit: winnerResult.isSplit,
            })
          }
        }
      }

      if (game.mode === "turbo") {
        const scored = scoreTurboPicks(gwPicks, gwFixtures)
        for (const pick of scored) {
          await db
            .update(picks)
            .set({ result: pick.result })
            .where(eq(picks.id, pick.id))
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Game processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
