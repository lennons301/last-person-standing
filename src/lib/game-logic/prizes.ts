export interface PaymentLike {
	amount: string
	status: string
}

export interface PotBreakdown {
	confirmed: string
	pending: string
	total: string
}

export function calculatePot(payments: PaymentLike[]): PotBreakdown {
	let paid = 0
	let claimed = 0
	for (const p of payments) {
		if (p.status === 'paid') paid += Number.parseFloat(p.amount)
		else if (p.status === 'claimed') claimed += Number.parseFloat(p.amount)
	}
	return {
		confirmed: paid.toFixed(2),
		pending: claimed.toFixed(2),
		total: (paid + claimed).toFixed(2),
	}
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
