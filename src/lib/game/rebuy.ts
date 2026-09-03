import type { ModeConfig } from './mode-config'

export interface IsRebuyEligibleArgs {
	/**
	 * The game's resolved settings — `resolveModeConfig(gameRow)`. It carries the
	 * mode as well as `allowRebuys`, so there is nothing else to pass and no
	 * second reading of the column.
	 */
	modeConfig: ModeConfig
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

/**
 * Has this player bought back in?
 *
 * One payment row is the entry; a second is the rebuy — both rebuy routes write
 * one, in a free game too. The same question is asked from both ends of the
 * rebuy: here, to refuse a second one, and by the deadline lock, to tell a
 * bought-back-in player apart from a survivor who is still in on merit.
 */
export function hasBoughtBackIn(paymentRowCount: number): boolean {
	return paymentRowCount >= 2
}

export function isRebuyEligible(args: IsRebuyEligibleArgs): boolean {
	if (args.modeConfig.mode !== 'classic') return false
	if (!args.modeConfig.allowRebuys) return false
	if (args.gamePlayer.status !== 'eliminated') return false
	if (args.gamePlayer.eliminatedRoundId !== args.startingRound.id) return false
	if (!args.roundAfterStarting.deadline) return false
	if (args.now.getTime() >= args.roundAfterStarting.deadline.getTime()) return false
	if (hasBoughtBackIn(args.paymentRowCount)) return false
	return true
}
