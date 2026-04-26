export interface IsRebuyEligibleArgs {
	game: {
		gameMode: 'classic' | 'turbo' | 'cup'
		modeConfig: { allowRebuys?: boolean } | null | undefined
	}
	gamePlayer: {
		status: 'alive' | 'eliminated' | 'winner'
		eliminatedRoundId: string | null
	}
	round1: { id: string }
	round2: { deadline: Date | null }
	paymentRowCount: number
	now: Date
}

export function isRebuyEligible(args: IsRebuyEligibleArgs): boolean {
	if (args.game.gameMode !== 'classic') return false
	if (args.game.modeConfig?.allowRebuys !== true) return false
	if (args.gamePlayer.status !== 'eliminated') return false
	if (args.gamePlayer.eliminatedRoundId !== args.round1.id) return false
	if (!args.round2.deadline) return false
	if (args.now.getTime() >= args.round2.deadline.getTime()) return false
	if (args.paymentRowCount >= 2) return false
	return true
}
