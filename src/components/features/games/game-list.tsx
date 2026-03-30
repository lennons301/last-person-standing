import { GameCard } from "./game-card"
import type { GameMode, GameStatus } from "@/lib/types"

interface GameWithCount {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  playerCount: number
}

export function GameList({ games }: { games: GameWithCount[] }) {
  if (games.length === 0) {
    return <p className="text-muted-foreground">No games found.</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {games.map((game) => (
        <GameCard key={game.id} {...game} />
      ))}
    </div>
  )
}
