import { notFound } from "next/navigation"
import { eq, and } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gameGameweeks, fixtures, teams, picks } from "@/lib/schema/domain"
import { PickSelector } from "@/components/features/picks/pick-selector"
import type { GameMode } from "@/lib/types"

export default async function PickPage({
  params,
}: {
  params: Promise<{ gameId: string; mode: string }>
}) {
  const { gameId, mode } = await params
  const session = await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game || game.mode !== mode) notFound()

  // Get active gameweek for this game
  const [activeGw] = await db
    .select()
    .from(gameGameweeks)
    .where(and(eq(gameGameweeks.gameId, gameId), eq(gameGameweeks.status, "active")))

  if (!activeGw) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Make your pick</h1>
        <p className="text-muted-foreground">No active gameweek — picks aren&apos;t open yet.</p>
      </div>
    )
  }

  // Fetch fixtures for this gameweek
  const gwFixtures = await db
    .select({
      id: fixtures.id,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      kickoff: fixtures.kickoff,
      started: fixtures.started,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
    })
    .from(fixtures)
    .where(eq(fixtures.gameweekId, activeGw.gameweekId))
    .orderBy(fixtures.kickoff)

  // Get team names
  const teamRows = await db.select().from(teams)
  const teamMap = new Map(teamRows.map((t) => [t.id, t]))

  const fixtureData = gwFixtures.map((f) => ({
    id: f.id,
    homeTeam: {
      id: f.homeTeamId,
      shortName: teamMap.get(f.homeTeamId)?.shortName ?? "???",
    },
    awayTeam: {
      id: f.awayTeamId,
      shortName: teamMap.get(f.awayTeamId)?.shortName ?? "???",
    },
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    kickoff: f.kickoff,
    started: f.started,
  }))

  // Get previous team picks for classic mode
  const previousPicks = await db
    .select({ teamId: picks.teamId })
    .from(picks)
    .where(and(eq(picks.gameId, gameId), eq(picks.playerId, session.user.id)))

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Make your pick</h1>
      <p className="text-muted-foreground">Select a team for Gameweek {activeGw.gameweekId}</p>
      <PickSelector
        gameId={gameId}
        gameweekId={activeGw.gameweekId}
        mode={mode as GameMode}
        fixtures={fixtureData}
        previousTeamIds={previousPicks.map((p) => p.teamId)}
      />
    </div>
  )
}
