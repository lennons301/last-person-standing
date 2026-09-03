import { determinePickResult, type PickResult } from '@/lib/game-logic/common'
import { wcRoundStage } from '@/lib/game-logic/wc-classic'
import type { ModeConfig } from './mode-config'
import { isGameStartingRound, type StartingRoundGameRow } from './starting-round'

/**
 * **The** classic survival rule: did this pick's team come through its fixture,
 * and does the answer put the player out?
 *
 * One pure module, called by every surface that has to answer it — the settle
 * path (`settle.ts`), the live projection and the progress grid
 * (`detail-queries.ts`), and the live pop-out's own projection
 * (`live/derive.ts`). Four implementations of this rule existed before #242 and
 * they disagreed: settlement read `fixture.winner`, the projections decided on
 * the score alone, so a knockout tie settled on penalties rendered as a loss in
 * the live view while settling as a win. Put any new survival rule here rather
 * than beside a caller.
 */

/** What the rule needs to know about the pick: which team it backed. */
export interface ClassicSurvivalPick {
	/** Null on a hidden pick (the live payload strips it) — nothing to resolve. */
	teamId: string | null
}

/** What scoring the pick needs to know about the fixture it sits on. */
export interface ClassicSurvivalFixture {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	/**
	 * Authoritative winner of a tie settled after a level 90 minutes (extra time
	 * or penalties — football-data's `score.winner`). When set it overrides the
	 * score, so there is no draw.
	 */
	winner?: 'home' | 'away' | null
	/** Only a `finished` fixture settles; anything else is projected in flight. */
	status: string
	/** Is this fixture a knockout tie — a match that cannot end level? */
	knockout: boolean
}

/**
 * The same fixture, placed in its round — what asking whether the result
 * *eliminates* additionally needs, since the exemption is a fact about which
 * round the game began on.
 */
export interface ClassicSurvivalRoundFixture extends ClassicSurvivalFixture {
	roundId: string
}

/** What the rule needs to know about the game: where it began, and its config. */
export interface ClassicSurvivalGame extends StartingRoundGameRow {
	/**
	 * The game's resolved settings — `resolveModeConfig(gameRow)`. The rule takes
	 * the resolved value rather than the stored column, so `game.mode_config`
	 * keeps its single reader (#248).
	 */
	modeConfig: ModeConfig
}

/** Did the pick come through? The half of the rule a projection can answer. */
export interface ClassicPickResolution {
	/** Null while the pick can't be resolved yet — see `defer`. */
	result: PickResult | null
	goalsScored: number
	/** Leave the pick pending: there is no result to write yet. */
	defer: boolean
}

export interface ClassicSurvivalOutcome extends ClassicPickResolution {
	/** Does this result put the player out? False under the starting-round exemption. */
	eliminates: boolean
}

/**
 * Is a round of this competition a knockout tie — a match that can't end level?
 *
 * The one place the question is answered, so a caller can't decide a World Cup
 * group match is a tie (it isn't: a 1-1 there is a genuine draw, and eliminates)
 * or that a bracket match is a league fixture (it isn't: it defers).
 */
export function isKnockoutRound(competitionType: string, roundNumber: number): boolean {
	if (competitionType === 'knockout') return true
	if (competitionType === 'group_knockout') return wcRoundStage(roundNumber) === 'knockout'
	return false
}

/** Nothing to write: the pick stays pending until the fixture says more. */
const DEFERRED: ClassicPickResolution = {
	result: null,
	goalsScored: 0,
	defer: true,
}

/**
 * Did the picked team come through this fixture? The scoring half of the rule,
 * without the game context — what a projection has to hand, and all it needs:
 * a live view says nothing about elimination that this doesn't already decide.
 */
export function resolveClassicPickResult(
	pick: ClassicSurvivalPick,
	fixture: ClassicSurvivalFixture,
): ClassicPickResolution {
	// A pick with no team is a hidden pick — the live payload strips the team
	// before the deadline. Nothing to score, and nothing that may be guessed:
	// reading "not the home team" as away would score somebody else's fixture.
	if (pick.teamId == null) return DEFERRED

	// No scores means no answer — a fixture that hasn't kicked off is not a
	// goalless draw, and a pick on one stays pending on every surface.
	if (fixture.homeScore == null || fixture.awayScore == null) return DEFERRED
	const homeScore = fixture.homeScore
	const awayScore = fixture.awayScore

	// Unresolved knockout tie → nothing to write yet. A knockout match can't end
	// level: a finished tie with no `winner` reported is the provider's winner-lag,
	// and scoring it a draw would eliminate a backer whose team went through on
	// penalties — an elimination that completes or advances the game irreversibly.
	// Deferring keeps the player alive until the winner (or a decisive score)
	// lands. Group-stage and league draws are genuine results and never defer.
	// See #107.
	if (fixture.knockout && fixture.status === 'finished' && fixture.winner == null) {
		if (homeScore === awayScore) return DEFERRED
	}

	const result = determinePickResult({
		pickedTeamId: pick.teamId ?? '',
		homeTeamId: fixture.homeTeamId,
		awayTeamId: fixture.awayTeamId,
		homeScore,
		awayScore,
		winner: fixture.winner,
	})
	const pickedHome = pick.teamId === fixture.homeTeamId
	const goalsScored = result === 'win' ? (pickedHome ? homeScore : awayScore) : 0

	return { result, goalsScored, defer: false }
}

/**
 * The whole rule: the result, and whether it puts the player out.
 *
 * The seam the settle path, the progress grid and the live projection all call.
 */
export function settleClassicPick(
	pick: ClassicSurvivalPick,
	fixture: ClassicSurvivalRoundFixture,
	game: ClassicSurvivalGame,
): ClassicSurvivalOutcome {
	const resolution = resolveClassicPickResult(pick, fixture)
	if (resolution.defer || resolution.result == null) return { ...resolution, eliminates: false }

	// Starting-round exemption: the game's OWN first round, with rebuys off, is
	// the round a non-win doesn't eliminate on. The round is the one the game was
	// created on (`game.starting_round_id`) and not the competition's gameweek
	// one — a game created in November opens at gameweek 12, and gameweek 12 is
	// the first hurdle its players are put to. See #203.
	const allowRebuys = game.modeConfig.mode === 'classic' && game.modeConfig.allowRebuys
	const exempt = isGameStartingRound(game, fixture.roundId) && !allowRebuys

	return { ...resolution, eliminates: resolution.result !== 'win' && !exempt }
}
