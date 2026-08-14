export interface IsRebuyEligibleArgs {
	game: {
		gameMode: 'classic' | 'turbo' | 'cup'
		modeConfig: { allowRebuys?: boolean } | null | undefined
	}
	gamePlayer: {
		status: 'alive' | 'eliminated' | 'winner'
		eliminatedRoundId: string | null
	}
	/**
	 * The game's own starting round — the round it was played from, whatever
	 * gameweek the competition calls that. Only an exit *there* can be bought
	 * back from. Resolved by the callers off `game.starting_round_id`
	 * (`src/lib/game/starting-round.ts`), never as the competition's round 1: a
	 * game created in November starts at gameweek 12 and gameweek 12 is the
	 * hurdle its rebuy answers. See #203.
	 */
	startingRound: { id: string }
	/** The round after that one — its deadline is when the window shuts. */
	roundAfterStarting: { deadline: Date | null }
	paymentRowCount: number
	now: Date
}

export function isRebuyEligible(args: IsRebuyEligibleArgs): boolean {
	if (args.game.gameMode !== 'classic') return false
	if (args.game.modeConfig?.allowRebuys !== true) return false
	if (args.gamePlayer.status !== 'eliminated') return false
	if (args.gamePlayer.eliminatedRoundId !== args.startingRound.id) return false
	if (!args.roundAfterStarting.deadline) return false
	if (args.now.getTime() >= args.roundAfterStarting.deadline.getTime()) return false
	if (args.paymentRowCount >= 2) return false
	return true
}
