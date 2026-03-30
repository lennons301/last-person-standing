import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface PlayerProgress {
  displayName: string
  picks: { gameweekId: number; teamShortName: string; result: string | null }[]
  status: string
}

export function EliminationGrid({
  players,
  gameweekIds,
}: {
  players: PlayerProgress[]
  gameweekIds: number[]
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">Player</TableHead>
            {gameweekIds.map((gw) => (
              <TableHead key={gw} className="text-center font-mono">GW{gw}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => {
            const picksByGw = new Map(player.picks.map((p) => [p.gameweekId, p]))
            return (
              <TableRow key={player.displayName}>
                <TableCell className="sticky left-0 bg-background font-medium">{player.displayName}</TableCell>
                {gameweekIds.map((gwId) => {
                  const pick = picksByGw.get(gwId)
                  return (
                    <TableCell
                      key={gwId}
                      className={cn(
                        "text-center font-mono text-sm",
                        pick?.result === "won" && "text-green-500",
                        pick?.result === "lost" && "text-red-500"
                      )}
                    >
                      {pick?.teamShortName ?? "\u2014"}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
