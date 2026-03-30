import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GameMode, GameStatus } from "@/lib/types"

interface GameCardProps {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  playerCount: number
}

const modeLabels: Record<GameMode, string> = {
  classic: "Classic",
  turbo: "Turbo",
  cup: "Cup",
  escalating: "Escalating",
}

const statusVariants: Record<GameStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  active: "secondary",
  finished: "outline",
}

export function GameCard({ id, name, mode, status, playerCount }: GameCardProps) {
  return (
    <Link href={`/games/${id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge variant={statusVariants[status]}>{status}</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline">{modeLabels[mode]}</Badge>
            <span>{playerCount} player{playerCount !== 1 ? "s" : ""}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
