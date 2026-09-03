export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'halftime'

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
	status: 'active' | 'eliminated'
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
	gameMode: 'classic' | 'turbo' | 'cup'
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
