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
 * Only the pre-deadline hero variants (`pick-open`, `pick-made`) exist today.
 * Everything else lands on `{ kind: 'none' }` with a reason, and the page falls
 * back to its pre-redesign rendering. Later tickets in the hierarchy redesign
 * replace those `none` cases with real variants.
 */

import { deriveGameRoundStatus } from '@/lib/game/round-status'

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

/**
 * Why no hero renders. Each of these becomes its own variant in a later ticket;
 * until then the page keeps its pre-redesign rendering for them.
 */
export type HeroNoneReason =
	| 'no-round'
	| 'round-locked'
	| 'round-completed'
	| 'game-completed'
	| 'not-playing'

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
 * isn't — which is what keeps post-deadline rendering intact while only the
 * pre-deadline states have hero variants.
 */
export interface GameViewDemotions {
	/** Hero owns the round label + deadline: the standalone round strip must not render. */
	roundStrip: boolean
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
	}
	/** Is the viewer — or the acting-as target — still in the game? */
	isAlive: boolean
	/** Set when an admin is acting as another player. */
	actingAsName: string | null
	/** Null when the player has no pick at all for the current round. */
	pick: GameViewPickInput | null
	/** Slots needed for a complete entry: 1 for classic, `numberOfPicks` otherwise. */
	picksRequired: number
	rebuyAvailable: boolean
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
		},
	}
}

function buildHero(input: BuildGameViewInput): GameHeroDescriptor {
	const { gameMode, round } = input

	if (!round) return { kind: 'none', mode: gameMode, round: null, reason: 'no-round' }

	const heroRound: HeroRound = {
		number: round.number,
		label: round.label,
		longLabel: round.longLabel,
		deadlineIso: round.deadline ? round.deadline.toISOString() : null,
	}

	if (input.gameStatus === 'completed') {
		return { kind: 'none', mode: gameMode, round: heroRound, reason: 'game-completed' }
	}

	const roundStatus = deriveGameRoundStatus({
		round: { id: round.id, number: round.number, status: round.status, deadline: round.deadline },
		game: input.game,
		now: input.now,
	})

	// Everything from the deadline onwards belongs to a later ticket.
	if (roundStatus === 'completed') {
		return { kind: 'none', mode: gameMode, round: heroRound, reason: 'round-completed' }
	}
	if (roundStatus !== 'open') {
		return { kind: 'none', mode: gameMode, round: heroRound, reason: 'round-locked' }
	}

	// Eliminated players (and non-members) get no pick hero. Admin acting-as
	// mode passes isAlive=true even for eliminated targets, because an admin can
	// rebuy-via-pick on their behalf.
	if (!input.isAlive) {
		return { kind: 'none', mode: gameMode, round: heroRound, reason: 'not-playing' }
	}

	const picksRequired = Math.max(1, input.picksRequired)
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
