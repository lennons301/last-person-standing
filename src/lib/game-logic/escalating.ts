import type { Pick, Fixture, PickResult } from "@/lib/types"
import { evaluateClassicPicks } from "./classic"

export function evaluateEscalatingPicks(
  picks: Pick[],
  fixtures: Fixture[]
): (Pick & { result: PickResult })[] {
  return evaluateClassicPicks(picks, fixtures)
}
