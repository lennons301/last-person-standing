export interface PaymentLike {
	amount: string
	status: string
}

export interface PotBreakdown {
	confirmed: string
	pending: string
	total: string
}

/**
 * How many entries the pot would hold if everyone paid everything they owe —
 * i.e. the multiplier for the target pot (target = entryFee × entryCount).
 *
 * Each player owes their original entry, plus one more per rebuy. A rebuy is an
 * extra non-refunded payment row, so a player's owed entries = max(1, their
 * non-refunded rows) — `max(1, …)` covers players with no payment row yet (they
 * still owe the original). Refunded rows (e.g. admin-removed players) don't
 * count. Using distinct player count instead would undercount rebuys.
 */
export function expectedEntryCount(
	playerUserIds: string[],
	payments: { userId: string; status: string }[],
): number {
	return playerUserIds.reduce((sum, uid) => {
		const owed = payments.filter((p) => p.userId === uid && p.status !== 'refunded').length
		return sum + Math.max(1, owed)
	}, 0)
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
