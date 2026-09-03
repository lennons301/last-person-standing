import type { ModeConfig } from './mode-config'
import { hasBoughtBackIn } from './rebuy'
import { isGameStartingRound, resolveRoundAfterStarting } from './starting-round'

/**
 * What the deadline lock knows about one player who let a round's deadline go by
 * with nothing in — every fact the rule needs, and no database.
 */
export interface NoPickDecisionInput {
	game: {
		startingRoundId: string | null
		/** The game's resolved settings — `resolveModeConfig(gameRow)`. */
		modeConfig: ModeConfig
	}
	/** The round whose deadline just passed. */
	roundId: string
	/** The competition's whole round sequence — resolves the round-after-starting. */
	competitionRounds: Array<{ id: string; number: number }>
	/** Payment rows this player has in this game. More than one means a rebuy. */
	paymentRowCount: number
	/** The fallback team `pickWorstUnusedTeam` resolved; absent for turbo/cup. */
	fallbackTeamId?: string | null
}

/** What the lock should do about that player. */
export type NoPickOutcome =
	| { kind: 'exempt' }
	| { kind: 'auto-pick'; teamId: string }
	| {
			kind: 'eliminate'
			reason: 'no_pick_no_fallback' | 'missed_rebuy_pick'
			refund: boolean
	  }

/**
 * The missed-deadline rule, as one pure decision over already-fetched rows.
 *
 * Every fact it needs arrives as an argument — the game's own starting round,
 * the competition's round sequence, how many payment rows the player has, and
 * the fallback team `pickWorstUnusedTeam` resolved — so the rule that eliminates
 * players and reverses payments can be exercised without a database. The
 * composition is where #238's defect lived: each pure function it called was
 * right, and the arrangement of them eliminated paid-up survivors.
 */
export function decideNoPickOutcome(input: NoPickDecisionInput): NoPickOutcome {
	const { game, roundId, competitionRounds, paymentRowCount, fallbackTeamId } = input

	// Turbo and cup have no fallback to offer: their round *is* the game, so a
	// missed deadline ends it and the entry comes back off the pot.
	if (game.modeConfig.mode !== 'classic') {
		return { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: true }
	}

	if (isGameStartingRound(game, roundId)) {
		return game.modeConfig.allowRebuys
			? { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false }
			: { kind: 'exempt' }
	}

	// The round after the opening one holds two kinds of player, and a missed
	// deadline means opposite things to them.
	//
	// A player who is here on merit — the opening pick came off, or the no-rebuys
	// exemption carried a loss — has done nothing to forfeit their entry, so they
	// take the ordinary auto-pick fallback, exactly as they would in any later
	// round. Eliminating them outright was #238's defect and it took paid-up
	// survivors out of games they were still winning.
	//
	// A player who is here because they *bought back in* is the other case: the
	// rebuy was an entry into this round, and missing its deadline means the entry
	// bought nothing. They go out and the money comes back off the pot. A second
	// payment row is what says a rebuy happened — both rebuy routes write one, in
	// a free game too — and it stays the signal here because the rebuy clears
	// `eliminatedRoundId`, so player state alone can't tell the two kinds of
	// survivor apart.
	const isRoundAfterStarting = resolveRoundAfterStarting(game, competitionRounds)?.id === roundId
	if (isRoundAfterStarting && hasBoughtBackIn(paymentRowCount)) {
		return { kind: 'eliminate', reason: 'missed_rebuy_pick', refund: true }
	}

	// No unused team left in the round: there is nothing to pick on the player's
	// behalf, so the round they missed is the one they go out in.
	if (!fallbackTeamId) return { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false }
	return { kind: 'auto-pick', teamId: fallbackTeamId }
}
