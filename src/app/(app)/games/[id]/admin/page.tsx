import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { PlayerManagement } from "@/components/features/admin/player-management"
import type { PlayerStatus } from "@/lib/types"

export default async function AdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()
  if (game.createdBy !== session.user.id) redirect(`/games/${id}`)

  const players = await db
    .select({
      id: gamePlayers.id,
      playerId: gamePlayers.playerId,
      status: gamePlayers.status,
      displayName: user.name,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const formatted = players.map((p) => ({
    id: p.id,
    playerId: p.playerId,
    displayName: p.displayName,
    status: p.status as PlayerStatus,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{game.name} — Admin</h1>
      <PlayerManagement players={formatted} gameId={id} />
    </div>
  )
}
