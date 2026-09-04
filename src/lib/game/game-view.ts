/**
 * Game-page view deriver.
 *
 * One pure function turns the page's already-derived facts (game status, mode,
 * current round, alive status, current-round pick, pot/player counts) into a
 * descriptor that drives the top-of-page hero. The page itself does no
 * branching — it renders whatever variant comes back.
 *
 * Two rules keep this testable and safe:
 *
 * 1. **No wall-clock reads.** `now` is an argument. The deadline pivot goes
 *    through `deriveGameRoundStatus`, the single source of truth for "is this
 *    round accepting picks for THIS game?".
 * 2. **JSON-serializable output.** The descriptor crosses the Server → Client
 *    Component boundary (page.tsx → GameDetailView). Dates are ISO strings;
 *    no functions, Maps, class instances or component refs. `game-view.test.ts`
 *    round-trips every variant through `structuredClone` to enforce it —
 *    `structuredClone` throws on function refs where `JSON.stringify` silently
 *    drops them (PR #55 → #57 incident).
 *
 * The hero is the *personal* lens on the game. Before the deadline that means
 * the viewer's pick (`pick-open` / `pick-made`); after it, their own live read
 * (`live`), their round result (`round-result`), the rebuy offer that follows a
 * round-1 elimination (`rebuy`), the quiet spectator note once they're out for
 * good (`spectator`), and the winner outcome on a completed game (`winner`).
 * The field-wide standings below the hero stay the calm view, so the two never
 * duplicate live information.
 *
 * `{ kind: 'none' }` is now only for states with nothing personal to say (no
 * round at all, a round the game hasn't reached, a completed game with no
 * winner recorded); the page falls back to its pre-redesign rendering there.
 */

import { deriveGameRoundStatus } from '@/lib/game/round-status'
import { isGameStartingRound } from '@/lib/game/starting-round'

export type GameMode = 'classic' | 'turbo' | 'cup'

/** Round identity as the hero shows it: label, long label, deadline. */
export interface HeroRound {
	number: number
	/** Short form, e.g. "GW36" / "MD1" / "R16". */
	label: string
	/** Long form, e.g. "Gameweek 36" / "Matchday 1". */
	longLabel: string
	/** ISO string — rendered client-side in the viewer's timezone. */
	deadlineIso: string | null
}

/** The confirmation line on a `pick-made` hero. */
export type HeroPickSummary =
	| {
			type: 'team'
			shortName: string
			name: string
			opponentName: string | null
			side: 'home' | 'away' | null
			kickoffIso: string | null
			isAuto: boolean
	  }
	| {
			type: 'ranked'
			picksMade: number
			picksRequired: number
			isAuto: boolean
	  }

/** Why no hero renders — the page keeps its pre-redesign rendering for these. */
export type HeroNoneReason = 'no-round' | 'round-locked' | 'game-completed'

/** Persisted per-slot pick outcome (`pick.result` in the schema). */
export type HeroPickResult = 'pending' | 'win' | 'loss' | 'draw' | 'saved_by_life' | 'void'

/** The fixture a classic pick rides on, with its latest score snapshot. */
export interface HeroFixtureSnapshot {
	id: string
	status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
	homeShort: string
	awayShort: string
	homeScore: number | null
	awayScore: number | null
	kickoffIso: string | null
}

/**
 * How the player is doing on the round that's in play (or has just finished).
 *
 * - `surviving` — winning / won it.
 * - `at-risk` — level or behind with the match still running, or out of lives.
 * - `out` — the pick lost, or there was no pick to lose with.
 * - `unknown` — nothing to read yet (not kicked off, or a mode with no
 *   round-to-round elimination).
 */
export type HeroSurvival = 'surviving' | 'at-risk' | 'out' | 'unknown'

/** The player's entry on a round that's past its deadline. */
export type HeroEntry =
	| {
			type: 'team'
			shortName: string
			name: string
			opponentName: string | null
			side: 'home' | 'away' | null
			fixture: HeroFixtureSnapshot | null
	  }
	| {
			type: 'ranked'
			picksMade: number
			picksRequired: number
			correct: number
			wrong: number
			pending: number
			/** Cup only — null in the other modes. */
			livesRemaining: number | null
	  }
	/** The deadline passed with nothing submitted. */
	| { type: 'none' }

/** One winner on a completed game. Icons are string keys, never component refs. */
export type HeroWinnerStatIcon = 'flame' | 'target' | 'heart' | 'list-checks'

export interface HeroWinnerStat {
	iconKey: HeroWinnerStatIcon
	value: number | string
	label: string
}

export interface HeroWinnerEntry {
	userId: string
	name: string
	potShare: string
	stats: HeroWinnerStat[]
}

export type GameHeroDescriptor =
	| {
			kind: 'pick-open'
			mode: GameMode
			round: HeroRound
			/** Filled pick slots so far. Classic: always 0 here. */
			picksMade: number
			/** Slots needed for a complete entry. Classic: 1. */
			picksRequired: number
			/** Name of the player an admin is picking on behalf of, if any. */
			actingAsName: string | null
	  }
	| {
			kind: 'pick-made'
			mode: GameMode
			round: HeroRound
			pick: HeroPickSummary
			actingAsName: string | null
	  }
	| {
			kind: 'live'
			mode: GameMode
			round: HeroRound
			entry: HeroEntry
			survival: HeroSurvival
			/**
			 * Classic's starting-round exemption is in force: round 1 of a no-rebuys
			 * game, where a non-win doesn't eliminate. The hero says so, because the
			 * scoreline on its own would read like an elimination.
			 */
			startingRoundExemption: boolean
			actingAsName: string | null
	  }
	| {
			kind: 'round-result'
			mode: GameMode
			round: HeroRound
			entry: HeroEntry
			/**
			 * `played` is the ranked modes: one round, no survive-to-advance, so the
			 * round ending isn't a survival verdict — the standings settle it.
			 */
			result: 'survived' | 'eliminated' | 'played'
			nextRound: HeroRound | null
			/** As on `live` — the round-1 non-win that didn't cost anything. */
			startingRoundExemption: boolean
			actingAsName: string | null
	  }
	| {
			kind: 'winner'
			mode: GameMode
			round: HeroRound | null
			winners: HeroWinnerEntry[]
			runnerUpName: string | null
			/** The viewer's own relationship to that result. */
			viewerOutcome: 'won' | 'shared' | 'lost'
			/**
			 * The viewer's own cut, when they're one of the winners. Never read off
			 * `winners[0]` — `calculatePayouts` hands the rounding remainder to the
			 * earliest winners, so a split pot's shares can differ by a penny.
			 */
			viewerPotShare: string | null
	  }
	| {
			kind: 'rebuy'
			mode: GameMode
			round: HeroRound
			entryFee: string
			/** Rebuys close at the round-2 deadline. */
			closesAtIso: string | null
			/**
			 * Set once a rebuy has been started and is waiting on payment.
			 *
			 * Unreachable through today's `getGameDetail`, which only reports a
			 * pending rebuy for a player it has already put back to `alive` — and
			 * this variant is the eliminated branch, so that player's hero is a pick
			 * state with the pending notice in its notice slot. Kept because the
			 * deriver shouldn't depend on where that line is drawn: if the payment
			 * ever gates re-entry, the offer hero already has the claim state
			 * instead of silently showing "buy back in" to someone mid-rebuy.
			 */
			pendingPayment: { id: string; amount: string } | null
			eliminatedRoundLabel: string | null
	  }
	| {
			kind: 'spectator'
			mode: GameMode
			round: HeroRound
			eliminatedRoundLabel: string | null
	  }
	| {
			kind: 'none'
			mode: GameMode
			round: HeroRound | null
			reason: HeroNoneReason
	  }

/**
 * The page's compact stat line: pot + how many players are still in, with the
 * pot's breakdown revealed on demand rather than shown as four standing figures.
 */
export interface GameViewStats {
	/** Money actually banked. */
	potConfirmed: string
	/** Claimed-but-unconfirmed money. */
	potPending: string
	/** confirmed + pending — the headline figure. */
	potTotal: string
	/** Still owed across the game: target − total. */
	potUnpaid: string
	/** What the pot holds once everyone has paid: entry fee × expected entries. */
	potTarget: string
	aliveCount: number
	playerCount: number
	rebuyAvailable: boolean
}

/**
 * Chrome the hero has taken ownership of. The page hides the corresponding
 * standalone element when the flag is set, and keeps rendering it when it
 * isn't — which is what keeps the `none` states rendering intact while every
 * state that does have a hero variant lets the hero speak for it.
 */
export interface GameViewDemotions {
	/** Hero owns the round label + deadline: the standalone round strip must not render. */
	roundStrip: boolean
	/**
	 * Hero owns the post-deadline state: the pick section's placeholder card
	 * ("You have been eliminated from this game.", "Round closed — picks
	 * locked…", "This game has ended.") must not restate it underneath.
	 */
	pickPlaceholder: boolean
}

export interface GameViewDescriptor {
	hero: GameHeroDescriptor
	stats: GameViewStats
	demote: GameViewDemotions
}

/** Current-round pick facts for the player whose context is being rendered. */
export interface GameViewPickInput {
	/** Filled pick slots for the current round. Classic: 0 or 1. */
	picksMade: number
	/** True if any of those slots was auto-submitted on the player's behalf. */
	isAuto: boolean
	/** Classic only — the single team pick, for the hero's confirmation line. */
	team: {
		shortName: string
		name: string
		opponentName: string | null
		side: 'home' | 'away' | null
		kickoffIso: string | null
	} | null
	/** Classic only — the fixture that pick rides on, for the post-deadline read. */
	fixture?: HeroFixtureSnapshot | null
	/** Persisted result of every filled slot in this round. */
	results?: HeroPickResult[]
}

export interface BuildGameViewInput {
	gameMode: GameMode
	gameStatus: string
	round: {
		id: string
		number: number
		/** Competition-level round status from the bootstrap sync. */
		status: 'upcoming' | 'open' | 'active' | 'completed'
		deadline: Date | null
		label: string
		longLabel: string
	} | null
	game: {
		currentRoundId: string | null
		currentRoundNumber: number | null
		/**
		 * `game.starting_round_id` — the round this game was played from, its own
		 * round one. The starting-round exemption is read off this rather than off
		 * `round.number === 1`, so a game created mid-season gets it on the round it
		 * actually started at (#203). Absent is "not the starting round", which is
		 * the safe direction: the hero then reads a losing scoreline as a losing
		 * scoreline.
		 */
		startingRoundId?: string | null
	}
	/**
	 * Is the viewer — or the acting-as target — still picking in this game?
	 *
	 * This is the *gating* flag, not a statement of fact: acting-as forces it true
	 * even for an eliminated target, because an admin can rebuy-via-pick on their
	 * behalf. Anything that asserts survival reads `targetEliminated` instead.
	 */
	isAlive: boolean
	/**
	 * The target player's real membership status — `gamePlayer.status ===
	 * 'eliminated'`. Defaults to `!isAlive`, which is the same thing outside
	 * acting-as mode.
	 */
	targetEliminated?: boolean
	/** Set when an admin is acting as another player. */
	actingAsName: string | null
	/** Null when the player has no pick at all for the current round. */
	pick: GameViewPickInput | null
	/** Slots needed for a complete entry: 1 for classic, `numberOfPicks` otherwise. */
	picksRequired: number
	rebuyAvailable: boolean
	/** Cup only — lives left for the player being rendered. */
	livesRemaining?: number | null
	/** Where the game goes after this round — shown on the round-result hero. */
	nextRound?: {
		number: number
		label: string
		longLabel: string
		deadline: Date | null
	} | null
	/**
	 * The classic rebuy offer, when one stands. Mirrors `getGameDetail`'s
	 * `rebuyBanner`: an offer for an eliminated player, or a started rebuy waiting
	 * on payment.
	 */
	rebuy?: {
		entryFee: string
		closesAt: Date | null
		pendingPayment: { id: string; amount: string } | null
	} | null
	/** Round the player went out in — the quiet note on the spectator hero. */
	eliminatedRoundLabel?: string | null
	/**
	 * Id of that round, for the one comparison the label can't make: whether the
	 * elimination happened on the round being rendered. `gamePlayer.eliminatedRoundId`
	 * verbatim — null for a player who is still in, or was removed by an admin.
	 */
	eliminatedRoundId?: string | null
	/**
	 * `modeConfig.allowRebuys`. Classic only, and only for the starting-round
	 * exemption: round 1 of a no-rebuys game can't eliminate anyone, so the live
	 * hero must not read a losing scoreline as an exit.
	 */
	allowRebuys?: boolean
	/** Winner payload for a completed game (from `buildWinnerBanner`). */
	winner?: { winners: HeroWinnerEntry[]; runnerUpName?: string } | null
	/** Decides whether the winner hero reads as the viewer's win or someone else's. */
	viewerUserId?: string | null
	pot: {
		confirmed: string
		pending: string
		total: string
		/** Still owed across the game: target − total. */
		unpaid: string
		/** Entry fee × expected entries. */
		target: string
	}
	aliveCount: number
	playerCount: number
	now: Date
}

/** The variants that speak for a round whose deadline has already gone. */
const POST_DEADLINE_HERO_KINDS: Array<GameHeroDescriptor['kind']> = [
	'live',
	'round-result',
	'winner',
	'rebuy',
	'spectator',
]

export function buildGameView(input: BuildGameViewInput): GameViewDescriptor {
	const hero = buildHero(input)
	const heroActive = hero.kind !== 'none'
	return {
		hero,
		stats: {
			potConfirmed: input.pot.confirmed,
			potPending: input.pot.pending,
			potTotal: input.pot.total,
			potUnpaid: input.pot.unpaid,
			potTarget: input.pot.target,
			aliveCount: input.aliveCount,
			playerCount: input.playerCount,
			rebuyAvailable: input.rebuyAvailable,
		},
		demote: {
			roundStrip: heroActive,
			// Every post-deadline variant already says what the placeholder card was
			// there to say. The pre-deadline ones don't: the pick interface (or its
			// "waiting for the next round" stand-in) still belongs below the hero.
			pickPlaceholder: POST_DEADLINE_HERO_KINDS.includes(hero.kind),
		},
	}
}

function toHeroRound(round: NonNullable<BuildGameViewInput['round']>): HeroRound {
	return {
		number: round.number,
		label: round.label,
		longLabel: round.longLabel,
		deadlineIso: round.deadline ? round.deadline.toISOString() : null,
	}
}

function buildHero(input: BuildGameViewInput): GameHeroDescriptor {
	const { gameMode, round } = input

	// A finished game leads with its outcome, whoever's looking. This runs BEFORE
	// the no-round bail-out on purpose: `applyAutoCompletion` nulls out
	// `game.currentRoundId` when it crowns a winner, so a completed game always
	// arrives here with `round === null` — checking for a round first would hide
	// the result on every game that has actually finished. (`getTurboStandingsData`
	// and `getCupStandingsData` carry their own fallbacks for the same reason.)
	if (input.gameStatus === 'completed') {
		const completedRound = round ? toHeroRound(round) : null
		const winners = input.winner?.winners ?? []
		if (winners.length === 0) {
			return { kind: 'none', mode: gameMode, round: completedRound, reason: 'game-completed' }
		}
		const viewerEntry = input.viewerUserId
			? (winners.find((w) => w.userId === input.viewerUserId) ?? null)
			: null
		return {
			kind: 'winner',
			mode: gameMode,
			round: completedRound,
			winners,
			runnerUpName: input.winner?.runnerUpName ?? null,
			viewerOutcome: viewerEntry ? (winners.length > 1 ? 'shared' : 'won') : 'lost',
			viewerPotShare: viewerEntry?.potShare ?? null,
		}
	}

	if (!round) return { kind: 'none', mode: gameMode, round: null, reason: 'no-round' }

	const heroRound: HeroRound = toHeroRound(round)

	// A standing rebuy offer outranks everything else: it's the one thing an
	// eliminated player can still act on, and it expires at the round-2 deadline.
	if (!input.isAlive && input.rebuy) {
		return {
			kind: 'rebuy',
			mode: gameMode,
			round: heroRound,
			entryFee: input.rebuy.entryFee,
			closesAtIso: input.rebuy.closesAt ? input.rebuy.closesAt.toISOString() : null,
			pendingPayment: input.rebuy.pendingPayment,
			eliminatedRoundLabel: input.eliminatedRoundLabel ?? null,
		}
	}

	const roundStatus = deriveGameRoundStatus({
		round: { id: round.id, number: round.number, status: round.status, deadline: round.deadline },
		game: input.game,
		now: input.now,
	})

	// Out of the game with no way back in: the hero goes quiet and the standings
	// below become the page. Admin acting-as mode passes isAlive=true even for
	// eliminated targets, because an admin can rebuy-via-pick on their behalf.
	//
	// The one exception is the settled round they actually went out in — that
	// round still gets to say so, via the round-result hero below, before the
	// hero settles into spectating. It has to be *that* round, not just any
	// settled one: `advanceGame` deliberately parks a game on a
	// completed round when the next one is TBD, and a competition-scoped round
	// can settle before this game advances — so a player eliminated in GW5 would
	// otherwise be told "you're out" all over again on a settled GW6, on a round
	// they never picked in.
	const eliminatedThisRound =
		input.eliminatedRoundId != null && input.eliminatedRoundId === round.id
	if (!input.isAlive && !(roundStatus === 'completed' && eliminatedThisRound)) {
		return {
			kind: 'spectator',
			mode: gameMode,
			round: heroRound,
			eliminatedRoundLabel: input.eliminatedRoundLabel ?? null,
		}
	}

	const picksRequired = Math.max(1, input.picksRequired)

	// The round has been settled but the game hasn't moved on yet: report the
	// player's result and point at what's next.
	if (roundStatus === 'completed') {
		const entry = buildEntry(input, picksRequired)
		return {
			kind: 'round-result',
			mode: gameMode,
			round: heroRound,
			entry,
			// The real status, not the pick gate: an admin acting as an eliminated
			// player has isAlive forced true, and "You survived Gameweek 6" above
			// standings showing that player out is the contradiction this hero exists
			// to avoid.
			result:
				gameMode === 'classic' ? (isTargetEliminated(input) ? 'eliminated' : 'survived') : 'played',
			// Classic is the only mode that advances round to round; turbo and cup
			// are single-round, so there is never a "next up" for them.
			nextRound:
				gameMode === 'classic' && input.nextRound
					? {
							number: input.nextRound.number,
							label: input.nextRound.label,
							longLabel: input.nextRound.longLabel,
							deadlineIso: input.nextRound.deadline ? input.nextRound.deadline.toISOString() : null,
						}
					: null,
			startingRoundExemption: isStartingRoundExempt(input),
			actingAsName: input.actingAsName,
		}
	}

	// Deadline gone, matches on: the personal live read.
	if (roundStatus === 'active') {
		const entry = buildEntry(input, picksRequired)
		return {
			kind: 'live',
			mode: gameMode,
			round: heroRound,
			entry,
			survival: deriveSurvival(input, entry),
			startingRoundExemption: isStartingRoundExempt(input),
			actingAsName: input.actingAsName,
		}
	}

	if (roundStatus !== 'open') {
		return { kind: 'none', mode: gameMode, round: heroRound, reason: 'round-locked' }
	}

	const picksMade = input.pick?.picksMade ?? 0
	const isAuto = input.pick?.isAuto ?? false

	// A partial ranked entry (turbo/cup) is still an open pick: the CTA nudges
	// the player to finish it rather than congratulating them on a half-entry.
	if (picksMade < picksRequired) {
		return {
			kind: 'pick-open',
			mode: gameMode,
			round: heroRound,
			picksMade,
			picksRequired,
			actingAsName: input.actingAsName,
		}
	}

	const team = input.pick?.team ?? null
	const summary: HeroPickSummary =
		gameMode === 'classic' && team
			? {
					type: 'team',
					shortName: team.shortName,
					name: team.name,
					opponentName: team.opponentName,
					side: team.side,
					kickoffIso: team.kickoffIso,
					isAuto,
				}
			: { type: 'ranked', picksMade, picksRequired, isAuto }

	return {
		kind: 'pick-made',
		mode: gameMode,
		round: heroRound,
		pick: summary,
		actingAsName: input.actingAsName,
	}
}

/**
 * The player's entry on a round past its deadline: the classic team pick with
 * the scoreboard it rides on, or the ranked slate broken down into correct /
 * wrong / still-to-play.
 */
function buildEntry(input: BuildGameViewInput, picksRequired: number): HeroEntry {
	const pick = input.pick
	if (!pick || pick.picksMade === 0) return { type: 'none' }

	if (input.gameMode === 'classic' && pick.team) {
		return {
			type: 'team',
			shortName: pick.team.shortName,
			name: pick.team.name,
			opponentName: pick.team.opponentName,
			side: pick.team.side,
			fixture: pick.fixture ?? null,
		}
	}

	const results = pick.results ?? []
	// `void` (cancelled fixture) is settled-as-non-event: neither a hit nor a
	// miss, and not waiting on anything either.
	//
	// Cup persists a handicapped-underdog `draw_success` as `pick.result =
	// 'draw'` (`settleFixture`) — a *surviving* pick, and the grid renders it as
	// one (`mapPickResult`: 'draw' → 'win'). Count it with the hits there, or the
	// hero contradicts the grid directly below it. 'draw' is unreachable in
	// turbo, and classic never takes this ranked path.
	const drawSurvives = input.gameMode === 'cup'
	const correct = results.filter(
		(r) => r === 'win' || r === 'saved_by_life' || (drawSurvives && r === 'draw'),
	).length
	const wrong = results.filter((r) => r === 'loss' || (!drawSurvives && r === 'draw')).length
	const pending = results.filter((r) => r === 'pending').length
	return {
		type: 'ranked',
		picksMade: pick.picksMade,
		picksRequired,
		correct,
		wrong,
		pending,
		livesRemaining: input.gameMode === 'cup' ? (input.livesRemaining ?? null) : null,
	}
}

/**
 * Did the player being rendered actually go out? `isAlive` can't answer that —
 * acting-as forces it true so the admin keeps the pick hero — so every
 * statement of fact ("you survived", "out") goes through here instead.
 */
function isTargetEliminated(input: BuildGameViewInput): boolean {
	return input.targetEliminated ?? !input.isAlive
}

/**
 * Classic's starting-round exemption: in the game's own opening round of a
 * no-rebuys game a loss, a draw and even a missed deadline all leave the player
 * in. It's a rule of the mode (`docs/game-modes/classic.md`), encoded in
 * `settleClassicPick`, in `processDeadlineLock`'s opening-round branch, and in
 * the standings' own projection (`projectClassicPlayer`). The hero reads the same
 * scoreboard as those standings, so without this it would announce "Out" directly
 * above a table showing the same player alive.
 *
 * The round is matched by id against the game's starting round, never by number:
 * a game created in November starts at gameweek 12 and the exemption is that
 * game's, not the competition's (#203).
 */
function isStartingRoundExempt(input: BuildGameViewInput): boolean {
	if (input.gameMode !== 'classic') return false
	if (input.allowRebuys === true) return false
	return isGameStartingRound(input.game, input.round?.id ?? null)
}

function deriveSurvival(input: BuildGameViewInput, entry: HeroEntry): HeroSurvival {
	const exempt = isStartingRoundExempt(input)

	if (entry.type === 'none') {
		// Classic has no way back from a missed deadline once the round settles —
		// unless the exemption is in force, where round 1's no-pickers are left
		// alone. The ranked modes just score nothing for the empty slots.
		if (input.gameMode !== 'classic' || exempt) return 'unknown'
		return 'out'
	}

	if (entry.type === 'team') {
		const result = input.pick?.results?.[0] ?? 'pending'
		if (result === 'win' || result === 'saved_by_life') return 'surviving'
		// Under the exemption the settled non-win is real but harmless: the player
		// is through, and saying otherwise would contradict the standings below.
		if (result === 'loss' || result === 'draw') return exempt ? 'surviving' : 'out'
		if (result === 'void') return 'unknown'

		const fx = entry.fixture
		if (!fx || fx.homeScore == null || fx.awayScore == null || !entry.side) return 'unknown'
		if (fx.status === 'scheduled' || fx.status === 'postponed' || fx.status === 'cancelled') {
			return 'unknown'
		}
		const margin = entry.side === 'home' ? fx.homeScore - fx.awayScore : fx.awayScore - fx.homeScore
		if (margin > 0) return 'surviving'
		if (exempt) return 'surviving'
		return fx.status === 'finished' ? 'out' : 'at-risk'
	}

	if (isTargetEliminated(input)) return 'out'
	// Turbo never eliminates mid-round — the standings, not the hero, tell that
	// story. Cup does, once the lives run out.
	if (input.gameMode !== 'cup') return 'unknown'
	return (entry.livesRemaining ?? 0) <= 0 ? 'at-risk' : 'surviving'
}
