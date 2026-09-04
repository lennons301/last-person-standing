import {
	classicTiebreaker,
	cupTiebreaker,
	resolveWipeout,
	turboTiebreaker,
	type WipeoutPlayerInput,
} from '@/lib/game-logic/auto-complete-tiebreakers'
import type { PickResult, PlayerStatus } from '@/lib/types'

/**
 * Is this game over, and who won it?
 *
 * Three pure verdicts, one per mode, taking the rows rather than fetching them.
 * They used to read the database themselves, which is why the only tests they
 * had mocked `@/lib/db` — and why `deriveSettlement` (`settlement-plan.ts`)
 * could not decide a winner without one. The money-moving half is
 * `applyAutoCompletion` (`auto-complete.ts`); nothing here writes.
 */

export type CompletionReason =
	| 'last-alive'
	| 'mass-extinction'
	| 'rounds-exhausted'
	| 'turbo-single-round'
	| 'turbo-total-wipeout'
	| 'cup-longest-streak'
	| 'cup-total-wipeout'

export interface CompletionCheckResult {
	completed: boolean
	winnerPlayerIds: string[]
	reason?: CompletionReason
	/** total wipeout — every player got every pick wrong → refund everyone, no payout. */
	refund?: boolean
}

function notCompleted(): CompletionCheckResult {
	return { completed: false, winnerPlayerIds: [] }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Classic                                                                */
/* ────────────────────────────────────────────────────────────────────── */

/** What the classic verdict needs to know about one player. */
export interface ClassicCompletionPlayer {
	id: string
	status: PlayerStatus
	eliminatedRoundId: string | null
}

/** What either tiebreak needs to know about one pick: whose, and its goals. */
export interface CompletionPick {
	gamePlayerId: string
	result: PickResult
	goalsScored: number | null
}

export interface ClassicCompletionInput {
	/** Every `game_player` row of the game — the alive count is read off it. */
	players: ClassicCompletionPlayer[]
	/** Every pick of the game, any round — the goals tiebreak sums the wins. */
	picks: CompletionPick[]
	/** The round that just settled; the mass-extinction cohort is its leavers. */
	completedRoundId: string
	/**
	 * Is the current round FULLY settled (every fixture finished or cancelled)?
	 * `rounds-exhausted` may only be evaluated once this is true — "we've run out
	 * of rounds" cannot be concluded while the current round is still in progress.
	 * `last-alive` / `mass-extinction` are valid mid-round (no one left to play
	 * the remaining fixtures changes nothing) and are unaffected by this flag.
	 *
	 * Without this guard, the very first fixture to settle in the final seeded
	 * round triggers a premature `rounds-exhausted` completion — the dc857c5f
	 * MD3 mis-crowning, where the WC knockout rounds weren't seeded so
	 * there was no next round from the first MD3 result onward.
	 */
	roundFullySettled: boolean
	/** Does the competition hold a round after the one that just settled? */
	hasNextRound: boolean
}

function tiebreakClassicByGoals(picks: CompletionPick[], candidatePlayerIds: string[]): string[] {
	const inputs = candidatePlayerIds.map((pid) => ({
		gamePlayerId: pid,
		totalWinningGoals: picks
			.filter((p) => p.gamePlayerId === pid && p.result === 'win')
			.reduce((sum, p) => sum + (p.goalsScored ?? 0), 0),
	}))
	return classicTiebreaker(inputs)
}

export function checkClassicCompletion(input: ClassicCompletionInput): CompletionCheckResult {
	const alive = input.players.filter((p) => p.status === 'alive')

	if (alive.length === 1) {
		return { completed: true, winnerPlayerIds: [alive[0].id], reason: 'last-alive' }
	}

	if (alive.length === 0) {
		const cohort = input.players.filter(
			(p) => p.status === 'eliminated' && p.eliminatedRoundId === input.completedRoundId,
		)
		if (cohort.length === 0) return notCompleted()
		const winners = tiebreakClassicByGoals(
			input.picks,
			cohort.map((p) => p.id),
		)
		return { completed: true, winnerPlayerIds: winners, reason: 'mass-extinction' }
	}

	// >1 alive: the game only ends if the tournament is genuinely out of rounds —
	// and only once the current round has fully finished.
	if (!input.roundFullySettled) return notCompleted()
	if (input.hasNextRound) return notCompleted()

	const winners = tiebreakClassicByGoals(
		input.picks,
		alive.map((p) => p.id),
	)
	return { completed: true, winnerPlayerIds: winners, reason: 'rounds-exhausted' }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Turbo                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Turbo is a SINGLE round decided by the longest streak of correct predictions.
 * The wipeout rule (see `resolveWipeout`) skips any leading ranks that were a
 * universal loss, then crowns the longest rebased streak (tiebreak: goals — no
 * lives in turbo). A total wipeout (no player got a single pick right anywhere)
 * refunds everyone with no winner. The caller only invokes this once the round
 * is fully settled.
 */
export function checkTurboCompletion(players: WipeoutPlayerInput[]): CompletionCheckResult {
	if (players.length === 0) {
		return { completed: true, winnerPlayerIds: [], reason: 'turbo-single-round' }
	}
	const outcome = resolveWipeout(players)
	if (outcome.totalWipeout) {
		return {
			completed: true,
			winnerPlayerIds: [],
			reason: 'turbo-total-wipeout',
			refund: true,
		}
	}
	const winners = turboTiebreaker(
		outcome.scores.map((s) => ({
			gamePlayerId: s.gamePlayerId,
			streak: s.streak,
			goalsInStreak: s.goalsInStreak,
		})),
	)
	return { completed: true, winnerPlayerIds: winners, reason: 'turbo-single-round' }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Cup                                                                    */
/* ────────────────────────────────────────────────────────────────────── */

/** What the cup verdict needs to know about one player. */
export interface CupCompletionPlayer {
	id: string
	livesRemaining: number
}

/**
 * A cup pick with its fixture. The picked team's *raw* goals (the actual score)
 * come off the fixture rather than off `goalsScored`, which suppresses
 * 1-tier-favourite-win goals — the raw-goals backstop needs the unsuppressed
 * value.
 */
export interface CupCompletionPick {
	gamePlayerId: string
	confidenceRank: number | null
	result: PickResult
	goalsScored: number | null
	teamId: string | null
	fixture: { homeTeamId: string; homeScore: number | null; awayScore: number | null } | null
}

export interface CupCompletionInput {
	/** Only for the log line when the guard below refuses to crown. */
	gameId: string
	players: CupCompletionPlayer[]
	/** Every pick of the game — cup is one gameweek, so that is the round's. */
	picks: CupCompletionPick[]
}

/**
 * Cup is a SINGLE gameweek decided by the longest streak (with the tier
 * handicap + lives folded into the streak). The caller only invokes this once
 * the whole gameweek is fully settled.
 *
 * The streak is a *consecutive* run of surviving picks (win / draw_success /
 * saved_by_life) counted in confidence-rank order — the wipeout rule
 * (`resolveWipeout`) skips any leading ranks that were a universal loss, so the
 * game restarts from the first rank anyone got right, then crowns the longest
 * rebased streak (tiebreak: lives → goals). The winner can be a player whose
 * streak later *broke*: a long broken streak still beats a short unbroken one.
 * A total wipeout (no rank has a single correct pick anywhere) refunds everyone
 * with no winner. No per-round elimination winner and no advancement — cup
 * never spans gameweeks.
 */
export function checkCupCompletion(input: CupCompletionInput): CompletionCheckResult {
	if (input.players.length === 0) return notCompleted()

	// Authoritative invariant guard, independent of the caller's fixture-derived
	// round-settled gate: a cup game is a single gameweek and may only be crowned
	// once EVERY pick has a final result. If any pick is still `pending`, a fixture
	// hasn't been played/settled — crowning now would decide the game on an
	// incomplete gameweek (the 1f0d292d incident, where stale code crowned a
	// winner whose rank-1 pick hadn't kicked off). This holds even if the
	// round-settled gate is satisfied wrongly (e.g. a transient fixture state).
	const pendingCount = input.picks.filter((p) => p.result === 'pending').length
	if (pendingCount > 0) {
		console.warn(
			`[checkCupCompletion] refusing to complete game ${input.gameId}: ${pendingCount} pending pick(s) — gameweek incomplete`,
		)
		return notCompleted()
	}

	const players: WipeoutPlayerInput[] = input.players.map((p) => ({
		gamePlayerId: p.id,
		livesRemaining: p.livesRemaining,
		picks: input.picks
			.filter((pk) => pk.gamePlayerId === p.id)
			// Settled, non-void picks only. Void (cancelled fixture) and pending
			// picks contribute nothing — the streak walks past a void gap and stops
			// at any pending pick (there should be none once the gameweek is done).
			.filter((pk) => pk.result !== 'void' && pk.result !== 'pending')
			.map((pk) => {
				const pickedHome = pk.teamId === pk.fixture?.homeTeamId
				const rawGoals = pickedHome ? (pk.fixture?.homeScore ?? 0) : (pk.fixture?.awayScore ?? 0)
				return {
					rank: pk.confidenceRank ?? 0,
					correct: pk.result === 'win' || pk.result === 'draw' || pk.result === 'saved_by_life',
					goals: pk.goalsScored ?? 0,
					rawGoals,
				}
			}),
	}))

	const outcome = resolveWipeout(players)
	if (outcome.totalWipeout) {
		return {
			completed: true,
			winnerPlayerIds: [],
			reason: 'cup-total-wipeout',
			refund: true,
		}
	}
	const winners = cupTiebreaker(
		outcome.scores.map((s) => ({
			gamePlayerId: s.gamePlayerId,
			cumulativeStreak: s.streak,
			livesRemaining: s.livesRemaining,
			cumulativeGoals: s.goalsInStreak,
			rawStreakGoals: s.rawGoalsInStreak,
		})),
	)
	return { completed: true, winnerPlayerIds: winners, reason: 'cup-longest-streak' }
}
