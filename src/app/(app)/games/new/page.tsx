import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { gameweeks } from "@/lib/schema/domain"
import { CreateGameForm } from "@/components/features/games/create-game-form"

export default async function NewGamePage() {
  await requireSession()

  const futureGameweeks = await db
    .select({ id: gameweeks.id, name: gameweeks.name })
    .from(gameweeks)
    .where(eq(gameweeks.finished, false))
    .orderBy(gameweeks.id)

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">New game</h1>
      <CreateGameForm gameweeks={futureGameweeks} />
    </div>
  )
}
