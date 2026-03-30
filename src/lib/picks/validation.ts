import type { PlayerStatus } from "@/lib/types"

interface ClassicPickInput {
  teamId: number
  gameweekDeadline: Date
  now: Date
  playerStatus: PlayerStatus
  previousTeamIds: number[]
}

interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateClassicPick(input: ClassicPickInput): ValidationResult {
  if (input.playerStatus === "eliminated") {
    return { valid: false, reason: "Player is eliminated" }
  }
  if (input.now >= input.gameweekDeadline) {
    return { valid: false, reason: "Deadline has passed" }
  }
  if (input.previousTeamIds.includes(input.teamId)) {
    return { valid: false, reason: "Team already used in this game" }
  }
  return { valid: true }
}
