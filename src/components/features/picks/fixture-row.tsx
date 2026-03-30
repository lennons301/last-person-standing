"use client"

import { TeamBadge } from "./team-badge"
import { cn } from "@/lib/utils"

interface FixtureRowProps {
  fixtureId: number
  homeTeam: { id: number; shortName: string }
  awayTeam: { id: number; shortName: string }
  homeScore: number | null
  awayScore: number | null
  kickoff: Date | null
  selectedTeamId?: number
  onSelectTeam?: (teamId: number, fixtureId: number) => void
  disabled?: boolean
}

export function FixtureRow({
  fixtureId,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  kickoff,
  selectedTeamId,
  onSelectTeam,
  disabled,
}: FixtureRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTeam?.(homeTeam.id, fixtureId)}
        className={cn(
          "flex-1 rounded-md p-2 text-left transition-colors",
          selectedTeamId === homeTeam.id
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <TeamBadge shortName={homeTeam.shortName} />
      </button>

      <div className="flex min-w-[4rem] flex-col items-center font-mono text-sm">
        {homeScore !== null && awayScore !== null ? (
          <span>{homeScore} - {awayScore}</span>
        ) : kickoff ? (
          <span className="text-muted-foreground">
            {kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : (
          <span className="text-muted-foreground">TBD</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTeam?.(awayTeam.id, fixtureId)}
        className={cn(
          "flex-1 rounded-md p-2 text-right transition-colors",
          selectedTeamId === awayTeam.id
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <TeamBadge shortName={awayTeam.shortName} />
      </button>
    </div>
  )
}
