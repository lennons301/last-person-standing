import { isGameStartingRound } from './starting-round'

/**
 * What the deadline lock knows about one player who let a round's deadline go by
 * with nothing in — every fact the rule needs, and no database.
 */
export interface NoPickDecisionInput {
	game: {
		gameMode: 'classic' | 'turbo' | 'cup'
		startingRoundId: string | null
		modeConfig: { allowRebuys?: boolean } | null
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
 */
export function decideNoPickOutcome(input: NoPickDecisionInput): NoPickOutcome {
	const { game, roundId, fallbackTeamId } = input

	if (isGameStartingRound(game, roundId)) {
		const allowRebuys = game.modeConfig?.allowRebuys === true
		return allowRebuys
			? { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false }
			: { kind: 'exempt' }
	}

	if (!fallbackTeamId) return { kind: 'eliminate', reason: 'no_pick_no_fallback', refund: false }
	return { kind: 'auto-pick', teamId: fallbackTeamId }
}
