import { evaluateCupPicks, resolveCupQualifier } from '@/lib/game-logic/cup'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import {
	computeWcClassicAutoElims,
	type WcFixture,
	wcRoundStage,
} from '@/lib/game-logic/wc-classic'
import type {
	CompetitionType,
	EliminationReason,
	FixtureStatus,
	GameStatus,
	PickResult,
	PlayerStatus,
	RoundStatus,
} from '@/lib/types'
import { isKnockoutRound, settleClassicPick } from './classic-survival'
import {
	type CompletionCheckResult,
	checkClassicCompletion,
	checkCupCompletion,
	checkTurboCompletion,
} from './completion'
import { eliminationUpdate, isAdminRemoved } from './elimination'
import type { ModeConfig } from './mode-config'

/**
 * What a fixture reaching a terminal state does to one game, decided before
 * anything is written.
 *
 * `deriveSettlement` is the whole of settlement's reasoning and it touches no
 * database: the rows arrive as {@link SettlementFacts}, the writes leave as a
 * {@link SettlementPlan}, and `applyPlan` (`settle.ts`) puts that plan into one
 * transaction. It is the shape `decideNoPickOutcome` (`no-pick-decision.ts`)
 * already has at a smaller scale, and it exists for the same reason: the rules
 * that eliminate players and pay out pots had no unit tests at all, because
 * every one of them was tangled with a query.
 *
 * There is exactly **one** mode dispatch here — the `switch` in
 * `deriveSettlement`, exhaustive over the {@link ModeConfig} union, so a fourth
 * mode is a compile error rather than four `if (gameMode === …)` tables to go
 * and find. It replaced ten such branches across four unlinked tables (#244).
 */

/* ────────────────────────────────────────────────────────────────────── */
/* Facts                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

/** A team, as the cup tier handicap reads it. */
export interface SettlementTeam {
	externalIds: Record<string, string | number> | null
}

/** A pick row, as every rule below reads it. */
export interface SettlementPick {
	id: string
	gamePlayerId: string
	fixtureId: string | null
	teamId: string
	confidenceRank: number | null
	predictedResult: string | null
	result: PickResult
	goalsScored: number | null
	lifeGained: number
	lifeSpent: boolean
}

/** A `game_player` row. */
export interface SettlementPlayer {
	id: string
	status: PlayerStatus
	eliminatedReason: EliminationReason | null
	eliminatedRoundId: string | null
	livesRemaining: number
}

/** The fixture whose terminal state set this settlement off. */
export interface SettlingFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	winner: 'home' | 'away' | null
	status: FixtureStatus
}

/** A fixture of a round, as the terminal-state test reads it. */
export interface SettlementRoundFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	status: FixtureStatus
}

/**
 * The same fixture with what cup scoring additionally needs: the two sides (for
 * the tier handicap), the regulation score (the draw floor) and the winner.
 */
export interface SettlementCupFixture extends SettlementRoundFixture {
	homeTeam: SettlementTeam
	awayTeam: SettlementTeam
	regularHomeScore: number | null
	regularAwayScore: number | null
	winner: 'home' | 'away' | null
}

/** A pick of the game in any round — what the completion tiebreaks read. */
export interface SettlementGamePick {
	id: string
	gamePlayerId: string
	teamId: string
	confidenceRank: number | null
	result: PickResult
	goalsScored: number | null
	/** The pick's fixture, for cup's raw-goals backstop. Null outside cup. */
	fixture: { homeTeamId: string; homeScore: number | null; awayScore: number | null } | null
}

/** A round of the competition, as the World Cup auto-elim walks the bracket. */
export interface SettlementCompetitionRound {
	id: string
	number: number
	status: RoundStatus
	fixtures: Array<{
		id: string
		homeTeamId: string
		awayTeamId: string
		homeScore: number | null
		awayScore: number | null
		status: FixtureStatus
		winner: 'home' | 'away' | null
	}>
}

export interface SettlementFacts {
	game: {
		id: string
		status: GameStatus
		/** The game's settings through the one resolver (#248), never a cast. */
		modeConfig: ModeConfig
		startingRoundId: string | null
		currentRoundId: string | null
	}
	competitionType: CompetitionType
	fixture: SettlingFixture
	/** The round the settling fixture belongs to. */
	round: { id: string; number: number }
	/** Every pick this game holds on the settling fixture. */
	fixturePicks: SettlementPick[]
	/** Every fixture of the settling round. */
	roundFixtures: SettlementRoundFixture[]
	/** Every pick this game holds in the settling round. */
	roundPicks: SettlementPick[]
	/**
	 * The game's own current round, with its fixtures and this game's picks on
	 * them — cup re-evaluates that round rather than the settling one. Null when
	 * the game sits on no round.
	 */
	cupRound: {
		id: string
		fixtures: SettlementCupFixture[]
		picks: SettlementPick[]
	} | null
	/** Every `game_player` row of the game. */
	players: SettlementPlayer[]
	/** Every pick of the game, any round. */
	gamePicks: SettlementGamePick[]
	/** Does the competition hold a round after the settling one? */
	hasNextRound: boolean
	/** The competition's rounds and fixtures. Empty outside `group_knockout`. */
	competitionRounds: SettlementCompetitionRound[]
}

/* ────────────────────────────────────────────────────────────────────── */
/* The plan                                                               */
/* ────────────────────────────────────────────────────────────────────── */

/** The columns a pick write sets, and nothing else. */
export interface PickWrite {
	pickId: string
	set: {
		result: PickResult
		goalsScored?: number
		lifeGained?: number
		lifeSpent?: boolean
		cancellationReason?: string
	}
}

/** A `game_player` write: an elimination, a revival, or a lives adjustment. */
export interface PlayerWrite {
	gamePlayerId: string
	set: {
		status?: PlayerStatus
		eliminatedReason?: EliminationReason | null
		eliminatedRoundId?: string | null
		livesRemaining?: number
	}
	/**
	 * Write only while the player is still `alive`. The elimination race guard —
	 * it is what makes a re-run of a settled fixture a no-op.
	 */
	requireAlive: boolean
	/** Does a landed write here count towards `classicEliminated`? */
	countsAsElimination: boolean
}

export interface SettlementPlan {
	gameId: string
	/** The round the settling fixture belongs to — what `completeRound` closes. */
	roundId: string
	pickWrites: PickWrite[]
	playerWrites: PlayerWrite[]
	/** What the writes above contribute to the `SettleResult` counters. */
	counters: {
		classicSettled: number
		turboSettled: number
		picksVoided: number
		cupReevaluated: boolean
	}
	/** Every fixture of the round is terminal and no pick of it is pending. */
	roundSettled: boolean
	/**
	 * Tear the whole round up — too many of its fixtures were cancelled. A
	 * round-level act, so the caller applies it once and asks again: every
	 * verdict below was reached against a round that still counted.
	 */
	voidRound: boolean
	/**
	 * Winners to crown or stakes to refund — the argument for
	 * `applyAutoCompletion`. Null when this mode and state say not to look yet.
	 */
	completion: CompletionCheckResult | null
	/** Report the game as completed in the settle result. */
	gameCompleted: boolean
	/** Mark the settling round `completed`. */
	completeRound: boolean
	/** Hand the game to the advancement gate once the writes land. */
	advance: boolean
}

function emptyPlan(facts: SettlementFacts): SettlementPlan {
	return {
		gameId: facts.game.id,
		roundId: facts.round.id,
		pickWrites: [],
		playerWrites: [],
		counters: { classicSettled: 0, turboSettled: 0, picksVoided: 0, cupReevaluated: false },
		roundSettled: false,
		voidRound: false,
		completion: null,
		gameCompleted: false,
		completeRound: false,
		advance: false,
	}
}

/* ────────────────────────────────────────────────────────────────────── */
/* Round state                                                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Has every fixture of the round reached a terminal state — finished with
 * scores, or cancelled? A cancelled fixture never blocks a round.
 */
export function allFixturesTerminal(
	fixtures: Array<Pick<SettlementRoundFixture, 'status' | 'homeScore' | 'awayScore'>>,
): boolean {
	return (
		fixtures.length > 0 &&
		fixtures.every(
			(f) =>
				(f.status === 'finished' && f.homeScore != null && f.awayScore != null) ||
				f.status === 'cancelled',
		)
	)
}

/**
 * Is this game's round done with?
 *
 * Terminal fixtures are not enough on their own: a knockout tie can be
 * `finished` while the pick on it is deliberately left pending until the winner
 * resolves (`settleClassicPick`'s deferral, #107). Crowning or advancing on the
 * fixture-only reading would decide a game on an unresolved tie — so a pending
 * pick keeps the round open in every mode, which is the invariant turbo and cup
 * each used to restate as a guard of their own.
 */
export function isRoundSettled(input: {
	fixtures: Array<Pick<SettlementRoundFixture, 'status' | 'homeScore' | 'awayScore'>>
	picks: Array<{ result: PickResult }>
}): boolean {
	return allFixturesTerminal(input.fixtures) && input.picks.every((p) => p.result !== 'pending')
}

/**
 * Does this event ask the game about its round at all — its completion, its
 * closing, its advancement?
 *
 * A finished fixture always does: a game holding a pick on it has just had its
 * field change. A **cancelled** one only does for the games actually sitting on
 * that round, because a cancellation is a property of the round rather than of
 * the pick — an advance pick (PR #81) on a gameweek ten out is voided by it, but
 * that gameweek is nobody's current round and has no outcome to reach yet.
 */
function evaluatesRound(facts: SettlementFacts): boolean {
	if (facts.game.status !== 'active') return false
	if (facts.fixture.status === 'cancelled') return facts.game.currentRoundId === facts.round.id
	return true
}

/**
 * Has the round-void threshold been crossed? Fires when >50% of the round's
 * fixtures are cancelled, or more than 5 in absolute terms — which catches a
 * 7-fixture round where 4 cancellations are under half but still represent
 * enough disruption to void.
 */
function cancellationStormCrossed(fixtures: Array<{ status: FixtureStatus }>): boolean {
	if (fixtures.length === 0) return false
	const cancelled = fixtures.filter((f) => f.status === 'cancelled').length
	return cancelled / fixtures.length > 0.5 || cancelled > 5
}

/* ────────────────────────────────────────────────────────────────────── */
/* The one dispatch                                                       */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * What settling this fixture does to this game.
 *
 * The `switch` below is settlement's only mode dispatch. Each arm owns its
 * mode's whole answer — the pick results, the eliminations, the completion
 * verdict, whether the round closes and whether the game moves on — so adding a
 * mode is one arm rather than a hunt through four tables that had already
 * drifted apart.
 */
export function deriveSettlement(facts: SettlementFacts): SettlementPlan {
	const config = facts.game.modeConfig
	switch (config.mode) {
		case 'classic':
			return deriveClassic(facts)
		case 'turbo':
			return deriveTurbo(facts)
		case 'cup':
			return deriveCup(facts, config.startingLives)
	}
}

/* ── classic ───────────────────────────────────────────────────────────── */

function deriveClassic(facts: SettlementFacts): SettlementPlan {
	const plan = emptyPlan(facts)
	voidPendingFixturePicks(facts, plan)

	if (facts.game.status !== 'active') {
		settleHistoryPicks(facts, plan)
		return plan
	}

	if (facts.fixture.status === 'finished') {
		for (const p of facts.fixturePicks) {
			if (p.result !== 'pending') continue
			// THE classic survival rule, shared with both projections (#242): it reads
			// `fixture.winner`, so a tie settled on penalties is a win rather than a
			// draw; it defers an unresolved knockout tie (#107) rather than scoring
			// one; and it owns the starting-round exemption (#203).
			const outcome = settleClassicPick({ teamId: p.teamId }, settlingFixtureFor(facts), {
				startingRoundId: facts.game.startingRoundId,
				modeConfig: facts.game.modeConfig,
			})
			// Deferred: the pick stays PENDING on purpose and settles later via the
			// poll re-fire / recovery sweeps, once the winner (or a decisive score)
			// lands.
			if (outcome.defer || outcome.result == null) continue
			plan.pickWrites.push({
				pickId: p.id,
				set: { result: outcome.result, goalsScored: outcome.goalsScored },
			})
			plan.counters.classicSettled++
			if (!outcome.eliminates) continue
			plan.playerWrites.push({
				gamePlayerId: p.gamePlayerId,
				set: eliminationUpdate('loss', facts.round.id),
				requireAlive: true,
				countsAsElimination: true,
			})
		}
	}

	if (!evaluatesRound(facts)) return plan

	// Classic alone tears a round up when too many of its fixtures are
	// cancelled: turbo and cup are one round each, so a round torn up is a game
	// torn up, and their total-wipeout refund already covers that.
	if (facts.fixture.status === 'cancelled' && cancellationStormCrossed(facts.roundFixtures)) {
		plan.voidRound = true
	}

	// Everything below reads the state the writes above will leave behind — the
	// alive count decides the winner, so it has to see this fixture's exits.
	let players = withPlayerWrites(facts.players, plan.playerWrites)
	const roundPicks = withPickWrites(facts.roundPicks, plan.pickWrites)
	plan.roundSettled = isRoundSettled({ fixtures: facts.roundFixtures, picks: roundPicks })

	// World Cup auto-elim runs once the round is fully settled (it needs the full
	// set of remaining-round candidates) and before the completion check, because
	// it changes who is left standing.
	if (plan.roundSettled && facts.competitionType === 'group_knockout') {
		const autoElims = deriveWcAutoElims(facts, players)
		plan.playerWrites.push(...autoElims)
		players = withPlayerWrites(players, autoElims)
	}

	const completion = checkClassicCompletion({
		players,
		picks: withGamePickWrites(facts.gamePicks, plan.pickWrites),
		completedRoundId: facts.round.id,
		roundFullySettled: plan.roundSettled,
		hasNextRound: facts.hasNextRound,
	})
	if (completion.completed) {
		plan.completion = completion
		plan.gameCompleted = true
		return plan
	}

	// Game still active — if the round is fully settled, close it and move on.
	// Advance only when the settled round IS the game's current round. A late
	// settle in a round the game already moved past (a stranded pick healed by
	// the all-rounds sweep) must land its elimination and stop — re-advancing
	// from the old round would drag `currentRoundId` backwards.
	if (plan.roundSettled) {
		plan.completeRound = true
		plan.advance = facts.game.currentRoundId === facts.round.id
	}
	return plan
}

/**
 * Knockout auto-elim: players every remaining team of whose is out of the
 * tournament. `no_remaining_teams` rather than `loss` — nothing of theirs lost.
 */
function deriveWcAutoElims(facts: SettlementFacts, players: SettlementPlayer[]): PlayerWrite[] {
	const alive = players.filter((p) => p.status === 'alive')
	if (alive.length === 0) return []

	const asWcFixture = (
		roundId: string,
		roundNumber: number,
		f: SettlementCompetitionRound['fixtures'][number],
	): WcFixture => ({
		id: f.id,
		roundId,
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
		homeScore: f.homeScore,
		awayScore: f.awayScore,
		status: f.status,
		stage: wcRoundStage(roundNumber),
		winner: f.winner,
	})

	const autoElims = computeWcClassicAutoElims({
		alivePlayers: alive.map((p) => ({
			gamePlayerId: p.id,
			usedTeamIds: facts.gamePicks.filter((pk) => pk.gamePlayerId === p.id).map((pk) => pk.teamId),
		})),
		remainingRounds: facts.competitionRounds
			.filter((r) => r.status !== 'completed' && r.id !== facts.round.id)
			.map((r) => ({ id: r.id, fixtures: r.fixtures.map((f) => asWcFixture(r.id, r.number, f)) })),
		finishedKnockoutFixtures: facts.competitionRounds.flatMap((r) =>
			r.fixtures.map((f) => asWcFixture(r.id, r.number, f)),
		),
	})

	return autoElims.map((ae) => ({
		gamePlayerId: ae.gamePlayerId,
		set: eliminationUpdate('no_remaining_teams', facts.round.id),
		requireAlive: false,
		countsAsElimination: false,
	}))
}

/* ── turbo ─────────────────────────────────────────────────────────────── */

function deriveTurbo(facts: SettlementFacts): SettlementPlan {
	const plan = emptyPlan(facts)
	voidPendingFixturePicks(facts, plan)

	if (facts.game.status !== 'active') {
		settleHistoryPicks(facts, plan)
		return plan
	}

	if (facts.fixture.status === 'finished') {
		for (const p of facts.fixturePicks) {
			if (p.result !== 'pending') continue
			plan.pickWrites.push({ pickId: p.id, set: settleTurboPick(p, facts.fixture) })
			plan.counters.turboSettled++
		}
	}

	if (!evaluatesRound(facts)) return plan
	if (!allFixturesTerminal(facts.roundFixtures)) return plan

	const roundPicks = withPickWrites(facts.roundPicks, plan.pickWrites)
	// Never crown while any pick in the round is still `pending` — a deferred
	// knockout tie, or a fixture whose scores haven't landed.
	const pending = roundPicks.filter((p) => p.result === 'pending').length
	if (pending > 0) {
		console.warn(
			`[deriveSettlement] refusing to complete turbo game ${facts.game.id}: ${pending} pending pick(s)`,
		)
		return plan
	}
	plan.roundSettled = true

	plan.completion = checkTurboCompletion(
		facts.players
			.filter((p) => p.status === 'alive')
			.map((p) => ({
				gamePlayerId: p.id,
				// Turbo has no lives mechanic — the goals tiebreak settles ties.
				livesRemaining: 0,
				// Skip void picks — the streak walks past them as if they weren't in
				// the input (equivalent to a 9-pick game when one fixture was cancelled).
				picks: roundPicks
					.filter((pk) => pk.gamePlayerId === p.id)
					.filter((pk) => pk.result !== 'void' && pk.result !== 'pending')
					.map((pk) => ({
						rank: pk.confidenceRank ?? 0,
						correct: pk.result === 'win',
						goals: pk.goalsScored ?? 0,
					})),
			})),
	)
	plan.gameCompleted = true
	// Mark the round complete; turbo doesn't advance (single-round mode).
	plan.completeRound = true
	return plan
}

/** Did the prediction come off, and how many goals does it count for? */
function settleTurboPick(
	p: SettlementPick,
	fx: SettlingFixture,
): { result: PickResult; goalsScored: number } {
	const homeScore = fx.homeScore ?? 0
	const awayScore = fx.awayScore ?? 0
	const actualOutcome =
		homeScore > awayScore ? 'home_win' : awayScore > homeScore ? 'away_win' : 'draw'
	const correct = p.predictedResult === actualOutcome
	if (!correct) return { result: 'loss', goalsScored: 0 }
	const goalsScored =
		p.predictedResult === 'home_win'
			? homeScore
			: p.predictedResult === 'away_win'
				? awayScore
				: homeScore + awayScore
	return { result: 'win', goalsScored }
}

/* ── cup ───────────────────────────────────────────────────────────────── */

function deriveCup(facts: SettlementFacts, startingLives: number): SettlementPlan {
	const plan = emptyPlan(facts)
	voidPendingFixturePicks(facts, plan)

	// Cup settles as a whole-game re-evaluation, which needs a live game and a
	// round to evaluate. A completed cup game's stray pick is left alone.
	if (!evaluatesRound(facts)) return plan

	const beforeReeval = plan.pickWrites.length + plan.playerWrites.length
	reevaluateCup(facts, plan, startingLives)
	// Only the re-evaluation's own writes count — voiding a cancelled fixture's
	// picks is reported by `picksVoided`, not as a game re-evaluated.
	plan.counters.cupReevaluated = plan.pickWrites.length + plan.playerWrites.length > beforeReeval

	// Cup is a SINGLE gameweek decided by the longest streak — exactly like
	// turbo, just with the tier handicap + lives baked into the streak. Wait
	// until the whole gameweek is settled, then crown the longest streak. Cup
	// never eliminates-to-complete mid-gameweek and never advances.
	if (!allFixturesTerminal(facts.roundFixtures)) return plan
	plan.roundSettled = isRoundSettled({
		fixtures: facts.roundFixtures,
		picks: withPickWrites(facts.roundPicks, plan.pickWrites),
	})

	plan.completion = checkCupCompletion({
		gameId: facts.game.id,
		players: withPlayerWrites(facts.players, plan.playerWrites),
		picks: withGamePickWrites(facts.gamePicks, plan.pickWrites),
	})
	plan.gameCompleted = true
	plan.completeRound = true
	return plan
}

/**
 * Whole-game re-evaluation for cup mode. Iterates each player's picks in
 * confidence-rank order, only over fixtures that have both scores set, and
 * accumulates streak / lives through the same `evaluateCupPicks` evaluator used
 * at end-of-round. Emits only the writes that actually change a row, which is
 * what `cupReevaluated` reports.
 */
function reevaluateCup(facts: SettlementFacts, plan: SettlementPlan, startingLives: number): void {
	const cupRound = facts.cupRound
	if (!cupRound) return
	// The fixture's own picks may have just been voided; the streak has to walk
	// past those rather than score them.
	const existingPicks = withPickWrites(cupRound.picks, plan.pickWrites)

	for (const player of facts.players) {
		// Evaluate EVERY player's picks, not just the currently-alive ones. The
		// wipeout rule needs the full rank-ordered result sequence for everyone,
		// including players whose streak already broke — when a leading rank is a
		// universal loss, an "eliminated" player can win the rebased streak from a
		// later rank, so their later picks must settle rather than stay `pending`.
		const playerPicks = existingPicks
			.filter((p) => p.gamePlayerId === player.id)
			.sort((a, b) => (a.confidenceRank ?? 99) - (b.confidenceRank ?? 99))

		// Only picks whose fixture has both scores (`pending` fixtures are
		// excluded; their result stays `'pending'`). Cancelled fixtures are
		// skipped — the pick's `'void'` row is already accounted for, and the
		// streak math walks past it naturally because it's not in the input.
		const settleable: Array<{ pickRow: SettlementPick; fixture: SettlementCupFixture }> = []
		for (const p of playerPicks) {
			if (p.result === 'void') continue
			const fx = cupRound.fixtures.find((f) => f.id === p.fixtureId)
			if (!fx) continue
			if (fx.status === 'cancelled') continue
			// Confirmed-streak boundary: STOP at the first pending pick in rank
			// order. A player's streak — and any elimination from it — can't be
			// confirmed while a higher-confidence pick is still unplayed.
			if (fx.homeScore == null || fx.awayScore == null) break
			settleable.push({ pickRow: p, fixture: fx })
		}
		if (settleable.length === 0) continue

		const evalResult = evaluateCupPicks(
			settleable.map(({ pickRow, fixture: fx }) => ({
				confidenceRank: pickRow.confidenceRank ?? 0,
				pickedTeam: pickRow.teamId === fx.homeTeamId ? ('home' as const) : ('away' as const),
				// A knockout pick is "to qualify": `winner` (incl. ET/penalty ties)
				// decides whether the picked side advanced. The 90-minute (regulation)
				// score is the draw floor + goals source — an underdog level at 90 that
				// loses the shootout still survives (draw_success), and one that wins it
				// is a win. Fall back to the full-time score when regulation isn't
				// reported separately.
				homeScore: fx.regularHomeScore ?? fx.homeScore ?? 0,
				awayScore: fx.regularAwayScore ?? fx.awayScore ?? 0,
				tierDifference: computeTierDifference(fx.homeTeam, fx.awayTeam, facts.competitionType),
				winner: resolveCupQualifier({
					winner: fx.winner,
					finished: fx.status === 'finished',
					fullHomeScore: fx.homeScore,
					fullAwayScore: fx.awayScore,
				}),
			})),
			startingLives,
		)

		for (const pr of evalResult.pickResults) {
			const target = settleable.find((s) => (s.pickRow.confidenceRank ?? 0) === pr.confidenceRank)
			if (!target) continue
			const result: PickResult =
				pr.result === 'win'
					? 'win'
					: pr.result === 'draw_success'
						? 'draw'
						: pr.result === 'saved_by_life'
							? 'saved_by_life'
							: 'loss' // 'loss' + 'restricted' both persist as loss
			const lifeSpent = pr.result === 'saved_by_life'
			// Don't write identical state — it is what keeps a re-run of a settled
			// gameweek reporting "nothing changed".
			const prev = target.pickRow
			if (
				prev.result === result &&
				prev.goalsScored === pr.goalsCounted &&
				prev.lifeGained === pr.livesGained &&
				prev.lifeSpent === lifeSpent
			) {
				continue
			}
			plan.pickWrites.push({
				pickId: prev.id,
				set: { result, goalsScored: pr.goalsCounted, lifeGained: pr.livesGained, lifeSpent },
			})
		}

		// A broken streak does NOT eliminate a cup player: cup is won by the
		// LONGEST streak (every player is ranked, broken or not — exactly like
		// turbo), so a frozen streak can still be the winning one. Marking it
		// 'eliminated' wrongly drops the player from the in-contention standings
		// (the 1f0d292d "Feargal" incident). The winner is crowned only at
		// gameweek completion; every other cup player stays 'alive'.
		//
		// Self-heal: revive any cup player a previous (buggy) settle wrongly marked
		// eliminated on a streak break. Admin removals are a deliberate action and
		// must persist.
		const wronglyEliminated = player.status === 'eliminated' && !isAdminRemoved(player)
		if (player.livesRemaining === evalResult.finalLives && !wronglyEliminated) continue
		plan.playerWrites.push({
			gamePlayerId: player.id,
			set: {
				livesRemaining: evalResult.finalLives,
				...(wronglyEliminated ? { status: 'alive' as const, eliminatedRoundId: null } : {}),
			},
			requireAlive: false,
			countsAsElimination: false,
		})
	}
}

/* ────────────────────────────────────────────────────────────────────── */
/* Shared steps                                                           */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * A cancelled fixture voids every still-pending pick on it, in every mode and
 * whatever state the game is in. Guarded on `pending` so an already-settled row
 * isn't retroactively overwritten by a late cancellation — the whole-round void
 * is the only thing that does that.
 */
function voidPendingFixturePicks(facts: SettlementFacts, plan: SettlementPlan): void {
	if (facts.fixture.status !== 'cancelled') return
	for (const p of facts.fixturePicks) {
		if (p.result !== 'pending') continue
		plan.pickWrites.push({
			pickId: p.id,
			set: {
				result: 'void',
				cancellationReason: 'cancelled',
				goalsScored: 0,
				lifeGained: 0,
				lifeSpent: false,
			},
		})
		plan.counters.picksVoided++
	}
}

/**
 * A game that is over (or never started) still settles its pick rows, so the
 * history view isn't left with `pending` on a played fixture. No elimination,
 * no completion, no advancement — there is no game left to decide.
 *
 * The rows are scored by the classic rule whatever the mode, which is the
 * behaviour this path has always had; a turbo game's history is the only place
 * that shows, and it is not worth changing under a refactor.
 */
function settleHistoryPicks(facts: SettlementFacts, plan: SettlementPlan): void {
	if (facts.fixture.status !== 'finished') return
	for (const p of facts.fixturePicks) {
		if (p.result !== 'pending') continue
		const outcome = settleClassicPick({ teamId: p.teamId }, settlingFixtureFor(facts), {
			startingRoundId: null,
			modeConfig: { mode: 'classic', allowRebuys: false },
		})
		if (outcome.defer || outcome.result == null) continue
		plan.pickWrites.push({
			pickId: p.id,
			set: { result: outcome.result, goalsScored: outcome.goalsScored },
		})
		// Counted like any other settle so the sweep telemetry doesn't undercount a
		// fixture whose only pending picks belong to non-active games.
		plan.counters.classicSettled++
	}
}

function settlingFixtureFor(facts: SettlementFacts) {
	return {
		roundId: facts.round.id,
		homeTeamId: facts.fixture.homeTeamId,
		awayTeamId: facts.fixture.awayTeamId,
		homeScore: facts.fixture.homeScore,
		awayScore: facts.fixture.awayScore,
		winner: facts.fixture.winner,
		status: facts.fixture.status,
		knockout: isKnockoutRound(facts.competitionType, facts.round.number),
	}
}

/* ────────────────────────────────────────────────────────────────────── */
/* Reading the state the plan will leave behind                           */
/* ────────────────────────────────────────────────────────────────────── */

function writesById(writes: PickWrite[]): Map<string, PickWrite> {
	return new Map(writes.map((w) => [w.pickId, w] as const))
}

function withPickWrites(rows: SettlementPick[], writes: PickWrite[]): SettlementPick[] {
	if (writes.length === 0) return rows
	const byId = writesById(writes)
	return rows.map((row) => {
		const write = byId.get(row.id)
		if (!write) return row
		return {
			...row,
			result: write.set.result,
			goalsScored: write.set.goalsScored ?? row.goalsScored,
			lifeGained: write.set.lifeGained ?? row.lifeGained,
			lifeSpent: write.set.lifeSpent ?? row.lifeSpent,
		}
	})
}

function withGamePickWrites(rows: SettlementGamePick[], writes: PickWrite[]): SettlementGamePick[] {
	if (writes.length === 0) return rows
	const byId = writesById(writes)
	return rows.map((row) => {
		const write = byId.get(row.id)
		if (!write) return row
		return {
			...row,
			result: write.set.result,
			goalsScored: write.set.goalsScored ?? row.goalsScored,
		}
	})
}

function withPlayerWrites(rows: SettlementPlayer[], writes: PlayerWrite[]): SettlementPlayer[] {
	if (writes.length === 0) return rows
	return rows.map((row) => {
		let next = row
		for (const write of writes) {
			if (write.gamePlayerId !== row.id) continue
			if (write.requireAlive && next.status !== 'alive') continue
			next = { ...next, ...write.set }
		}
		return next
	})
}
