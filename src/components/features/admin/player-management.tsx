"use client"

import { useRouter } from "next/navigation"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { PlayerStatus } from "@/lib/types"

interface Player {
  id: string
  playerId: string
  displayName: string
  status: PlayerStatus
}

export function PlayerManagement({ players, gameId }: { players: Player[]; gameId: string }) {
  const router = useRouter()

  async function handleRemove(playerId: string) {
    const res = await fetch(`/api/games/${gameId}/players/${playerId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to remove player"); return }
    toast.success("Player removed")
    router.refresh()
  }

  async function handleToggleElimination(playerId: string, currentStatus: PlayerStatus) {
    const newStatus = currentStatus === "eliminated" ? "alive" : "eliminated"
    const res = await fetch(`/api/games/${gameId}/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) { toast.error("Failed to update player"); return }
    toast.success(`Player ${newStatus === "eliminated" ? "eliminated" : "reinstated"}`)
    router.refresh()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {players.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.displayName}</TableCell>
            <TableCell>{p.status}</TableCell>
            <TableCell className="space-x-2 text-right">
              <Button size="sm" variant="outline" onClick={() => handleToggleElimination(p.playerId, p.status)}>
                {p.status === "eliminated" ? "Reinstate" : "Eliminate"}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleRemove(p.playerId)}>
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
