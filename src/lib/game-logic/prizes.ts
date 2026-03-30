export function calculatePrizePot(entryFee: string | null, playerCount: number): number {
  if (!entryFee) return 0
  return parseFloat(entryFee) * playerCount
}

export function splitPrize(pot: number, winnerCount: number): number {
  if (winnerCount === 0) return 0
  return pot / winnerCount
}
