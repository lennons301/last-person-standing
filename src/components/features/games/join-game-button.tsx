"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function JoinGameButton({ gameId }: { gameId: string }) {
  const router = useRouter()

  async function handleJoin() {
    const res = await fetch(`/api/games/${gameId}/join`, { method: "POST" })
    if (!res.ok) {
      toast.error("Failed to join game")
      return
    }
    toast.success("Joined game!")
    router.refresh()
  }

  return <Button onClick={handleJoin}>Join game</Button>
}
