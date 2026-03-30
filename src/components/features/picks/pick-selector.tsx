"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FixtureRow } from "./fixture-row"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { GameMode } from "@/lib/types"

interface FixtureData {
  id: number
  homeTeam: { id: number; shortName: string }
  awayTeam: { id: number; shortName: string }
  homeScore: number | null
  awayScore: number | null
  kickoff: Date | null
  started: boolean
}

interface PickSelectorProps {
  gameId: string
  gameweekId: number
  mode: GameMode
  fixtures: FixtureData[]
  previousTeamIds: number[]
}

export function PickSelector({
  gameId,
  gameweekId,
  mode,
  fixtures,
  previousTeamIds,
}: PickSelectorProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function handleSelectTeam(teamId: number, fixtureId: number) {
    if (mode === "classic" && previousTeamIds.includes(teamId)) {
      toast.error("You already used this team")
      return
    }
    setSelectedTeamId(teamId)
    setSelectedFixtureId(fixtureId)
  }

  async function handleSubmit() {
    if (!selectedTeamId || !selectedFixtureId) return
    setLoading(true)

    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        gameweekId,
        teamId: selectedTeamId,
        fixtureId: selectedFixtureId,
        mode,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error || "Failed to submit pick")
      setLoading(false)
      return
    }

    toast.success("Pick submitted!")
    router.push(`/games/${gameId}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {fixtures.map((fixture) => (
        <FixtureRow
          key={fixture.id}
          fixtureId={fixture.id}
          homeTeam={fixture.homeTeam}
          awayTeam={fixture.awayTeam}
          homeScore={fixture.homeScore}
          awayScore={fixture.awayScore}
          kickoff={fixture.kickoff}
          selectedTeamId={
            selectedFixtureId === fixture.id ? (selectedTeamId ?? undefined) : undefined
          }
          onSelectTeam={handleSelectTeam}
          disabled={fixture.started}
        />
      ))}
      <Button onClick={handleSubmit} disabled={!selectedTeamId || loading} className="w-full">
        {loading ? "Submitting..." : "Submit pick"}
      </Button>
    </div>
  )
}
