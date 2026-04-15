export function calculatePot(entryFee: string | null, playerCount: number): string {
	if (!entryFee) return '0.00'
	return (Number.parseFloat(entryFee) * playerCount).toFixed(2)
}

export interface PayoutEntry {
	userId: string
	amount: string
	isSplit: boolean
}

export function calculatePayouts(pot: string, winnerUserIds: string[]): PayoutEntry[] {
	if (winnerUserIds.length === 0) return []
	const totalCents = Math.round(Number.parseFloat(pot) * 100)
	const perWinnerCents = Math.floor(totalCents / winnerUserIds.length)
	let remainderCents = totalCents - perWinnerCents * winnerUserIds.length
	const isSplit = winnerUserIds.length > 1

	return winnerUserIds.map((userId) => {
		const extra = remainderCents > 0 ? 1 : 0
		remainderCents -= extra
		return { userId, amount: ((perWinnerCents + extra) / 100).toFixed(2), isSplit }
	})
}
