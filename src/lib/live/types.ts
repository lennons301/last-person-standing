import type { GameMode, PlayerStatus } from '@/lib/types'

/**
 * A fixture's state as the live payload carries it: every value the `fixture`
 * table's own enum can hold, plus `halftime` — which the poller derives for
 * display and the pop-out's `deriveMatchState` reads.
 *
 * `cancelled` is in the union because the payload has always sent it: the round
 * is mapped fixture-for-fixture, cancellations included, and a pick sitting on
 * one projects as `void`. It was missing here only because nothing checked the
 * server side against this type until `getLivePayload` declared it (#249).
 */
export type FixtureStatus =
	| 'scheduled'
	| 'live'
	| 'finished'
	| 'postponed'
	| 'cancelled'
	| 'halftime'

export type PickResultState =
	| 'win'
	| 'loss'
	| 'draw'
	| 'saved_by_life'
	| 'hidden'
	| 'restricted'
	| 'pending'
	| 'void'

export interface LiveFixture {
	id: string
	kickoff: Date | string | null
	homeScore: number | null
	awayScore: number | null
	status: FixtureStatus
	homeShort: string
	awayShort: string
	/**
	 * The sides, so a pick's team can be placed on its fixture — which is what
	 * the classic survival rule reads. Required, not derived from the short
	 * names: those are display strings and two clubs can share one.
	 */
	homeTeamId: string
	awayTeamId: string
	/**
	 * Authoritative winner of a tie settled after a level 90 minutes (extra time
	 * or penalties). Carried on the payload because settlement reads it, and a
	 * projection that didn't showed a penalty-decided win as a loss (#242).
	 */
	winner: 'home' | 'away' | null
	/**
	 * Is this fixture a knockout tie — a match that can't end level? An
	 * unresolved level tie is deferred rather than shown settled (#107), and
	 * that only holds where a draw is impossible.
	 */
	knockout: boolean
}

export interface LivePick {
	gamePlayerId: string
	fixtureId: string | null
	teamId: string | null
	confidenceRank: number | null
	predictedResult: 'home_win' | 'away_win' | 'draw' | null
	result: PickResultState | null
	/**
	 * Projected outcome for in-progress fixtures, computed server-side by
	 * `projectPickOutcome`. Renders with the SAME visual treatment as a
	 * settled pick of the equivalent result — `winning` displays like
	 * `settled-win`, `losing` like `settled-loss`. Fixture status conveys
	 * "in progress" to the viewer.
	 *
	 * `null` for picks on unstarted fixtures (no projection possible),
	 * `'settled-win'` / `'settled-loss'` / `'saved-by-life'` for picks
	 * whose `pick.result` is already persisted.
	 */
	projectedOutcome?:
		| 'winning'
		| 'drawing'
		| 'losing'
		| 'saved-by-life'
		| 'settled-win'
		| 'settled-loss'
		| 'pending'
		| 'void'
		| null
	/**
	 * The picked team's **pre-match** win chance, 0–1 — the de-vigged bookmaker
	 * probability the daily sync persisted for the fixture, frozen at the round's
	 * deadline. Never an in-play price, so every surface labels it as pre-match.
	 *
	 * Null wherever there is no market to quote: an unpriced fixture, a whole
	 * competition the odds source doesn't cover (the World Cup, the FA Cup), and
	 * every **hidden** pick — those carry no fixture and no team, so there is
	 * nothing for a probability to attach to. Null, never 0.
	 *
	 * Required rather than optional, so "a hidden pick carries no chance" is a
	 * fact the type states rather than a convention a caller can forget.
	 */
	preMatchWinProbability: number | null
}

export interface LivePlayer {
	id: string
	userId: string
	/**
	 * The player's persisted status, straight off `game_player` — 'alive',
	 * 'eliminated' or 'winner'. It read `'active' | 'eliminated'` until #249,
	 * a value the server has never sent: nothing checked the payload against
	 * this type, so the lie was invisible. `projectedStatus` below is the "if
	 * scores held" reading and stays two-valued.
	 */
	status: PlayerStatus
	livesRemaining: number
	/**
	 * Live aggregates — "if scores stayed as they are right now". Computed
	 * server-side per request from settled picks + projected outcomes for
	 * in-progress fixtures. Not persisted.
	 *
	 * - `projectedLivesRemaining`: cup only. For classic/turbo, equals
	 *   `livesRemaining` (always 0 in those modes).
	 * - `projectedStreak`: turbo + cup. For classic, always 0.
	 * - `projectedStatus`: 'alive' or 'eliminated' if the current fixture
	 *   state held. Classic: dies on first in-progress losing pick after
	 *   the starting round. Cup: dies on streak break with no lives.
	 *   Turbo: no per-round elimination.
	 */
	projectedLivesRemaining?: number
	projectedStreak?: number
	projectedStatus?: 'alive' | 'eliminated'
}

export interface LivePayload {
	gameId: string
	gameMode: GameMode
	roundId: string | null
	fixtures: LiveFixture[]
	picks: LivePick[]
	players: LivePlayer[]
	viewerUserId: string
	updatedAt: string
}

export interface GoalEvent {
	id: string
	fixtureId: string
	side: 'home' | 'away'
	newScore: number
	previousScore: number
	observedAt: number
}

export interface PickSettlementEvent {
	id: string
	gamePlayerId: string
	roundId: string
	result: 'settled-win' | 'settled-loss' | 'saved-by-life'
	observedAt: number
}
