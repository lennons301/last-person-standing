"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { GameMode } from "@/lib/types"

const modes: { value: GameMode; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Pick a team each week. If they lose, you're out." },
  { value: "turbo", label: "Turbo", description: "Predict results for every fixture. Most points wins." },
  { value: "cup", label: "Cup", description: "Head-to-head knockout bracket." },
  { value: "escalating", label: "Escalating", description: "Classic rules with increasing stakes." },
]

export function CreateGameForm({ gameweeks }: { gameweeks: { id: number; name: string }[] }) {
  const [name, setName] = useState("")
  const [mode, setMode] = useState<GameMode>("classic")
  const [entryFee, setEntryFee] = useState("")
  const [startingGameweek, setStartingGameweek] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mode,
        entryFee: entryFee || null,
        startingGameweek: startingGameweek ? parseInt(startingGameweek) : null,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create game")
      setLoading(false)
      return
    }

    const game = await res.json()
    router.push(`/games/${game.id}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a new game</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Game name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as GameMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {modes.find((m) => m.value === mode)?.description}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fee">Entry fee (optional)</Label>
            <Input id="fee" type="number" step="0.01" min="0" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Starting gameweek</Label>
            <Select value={startingGameweek} onValueChange={(v) => setStartingGameweek(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select gameweek" />
              </SelectTrigger>
              <SelectContent>
                {gameweeks.map((gw) => (
                  <SelectItem key={gw.id} value={String(gw.id)}>{gw.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create game"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
