import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { GameMode, PlayerStatus } from "@/lib/types"

interface LeaderboardEntry {
  playerId: string
  displayName: string
  status: PlayerStatus
  eliminatedAt?: number | null
  points?: number
}

const statusColors: Record<PlayerStatus, string> = {
  alive: "text-green-500",
  eliminated: "text-red-500",
  winner: "text-amber-500",
}

export function Leaderboard({
  entries,
  mode,
}: {
  entries: LeaderboardEntry[]
  mode: GameMode
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          {mode === "turbo" && (
            <TableHead className="text-right font-mono">Points</TableHead>
          )}
          {(mode === "classic" || mode === "escalating") && (
            <TableHead>Eliminated</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.playerId}>
            <TableCell className="font-medium">{entry.displayName}</TableCell>
            <TableCell>
              <span className={statusColors[entry.status]}>{entry.status}</span>
            </TableCell>
            {mode === "turbo" && (
              <TableCell className="text-right font-mono">{entry.points ?? 0}</TableCell>
            )}
            {(mode === "classic" || mode === "escalating") && (
              <TableCell className="font-mono text-muted-foreground">
                {entry.eliminatedAt ? `GW${entry.eliminatedAt}` : "\u2014"}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
