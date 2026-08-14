/**
 * The home page's **discovery** half: public games the viewer isn't in.
 *
 * Games are public by default (#205) and self-service entry closes when a game
 * starts (#204), which together make a game findable without a link — the point
 * of #202. This is the one place that decides what lands in each of the two
 * sections and in what order; the page and the cards render what comes out and
 * compute nothing.
 *
 * Two sections, and they carry different weight:
 *
 * - **Open to join** — public, open for entry, viewer not a member. A call to
 *   action, ordered soonest-start first so the most urgent thing sits at the top
 *   and a game ages off the list as it begins.
 * - **In progress** — public, already started, viewer not a member. Not
 *   joinable, so not a call to action: it exists so you can see a game is
 *   running and know to ask the admin for an in. Ordered most-recently-started
 *   first, because the game that just kicked off is the one worth asking about.
 *
 * What never appears, and why:
 *
 * - **Private games**, in either section — the invite link is the only way in,
 *   and listing one would be handing out the link.
 * - **Games the viewer is already in** — those are the page's own list above.
 * - **Completed games** — other people's finished games are noise, and "past
 *   games" stays a per-player idea about games you actually played.
 * - **Games that are neither open nor started** — a game still in `setup`, or
 *   one with no starting round recorded (which `evaluateJoinability` reads as
 *   `not-open`, see its note). Neither is something to act on, and a game we
 *   can't place is not one we can announce as running.
 *
 * Which side of the line a game falls on is `evaluateJoinability` and nothing
 * else — the same function the join route and the invite page read, so a game
 * listed as joinable is one the route will actually accept.
 *
 * Two figures are deliberately absent from the row, both because they'd say
 * something untrue:
 *
 * - **No pot.** The pot counts *paid* entries, so before a game starts it reads
 *   as zero and a paid game looks free. The entry fee is the honest number.
 * - **No creator name.** The name, mode and competition are what a reader is
 *   choosing between; whose game it is answers nothing until they're in it.
 */

import { evaluateJoinability } from '@/lib/game/joinability'
import { type CompetitionType, roundLabelLong } from '@/lib/game/round-label'
import type { GameMode, GameStatus, GameVisibility } from '@/lib/types'

/** A candidate game, as the discovery query returns it. */
export interface DiscoverGameRow {
	id: string
	name: string
	inviteCode: string
	gameMode: GameMode
	status: GameStatus
	visibility: GameVisibility
	competitionName: string
	competitionType: CompetitionType
	playerCount: number
	maxPlayers: number | null
	entryFee: string | null
	currentRoundId: string | null
	startingRoundId: string | null
	/** The round row `startingRoundId` points at, or null when it names none. */
	startingRound: { id: string; number: number; deadline: Date | null } | null
	/** Is the viewer already a player in this game? */
	viewerIsMember: boolean
}

/** One row in either section — everything the card renders, already worded. */
export interface DiscoverGameView {
	id: string
	name: string
	/** Public games list their code: the card's link into the join flow. */
	inviteCode: string
	mode: GameMode
	/** 'Classic' | 'Turbo' | 'Cup'. */
	modeLabel: string
	competition: string
	playerCount: number
	maxPlayers: number | null
	/** '4 players' / '4 of 12 players' — the cap only when the game sets one. */
	playersLabel: string
	/** '£5.00', or 'Free' where there is no fee to pay. */
	entryLabel: string
	/**
	 * When the game starts: its starting round's deadline. Null where that round
	 * carries none — WC knockouts pre-draw are pickable with no deadline, and a
	 * game sitting on one is open with no start time to state.
	 */
	startsAt: Date | null
	/** 'Gameweek 12' — which round the game is played from. */
	startRoundLabel: string | null
}

export interface DiscoverView {
	openToJoin: DiscoverGameView[]
	inProgress: DiscoverGameView[]
}

const MODE_LABELS: Record<GameMode, string> = {
	classic: 'Classic',
	turbo: 'Turbo',
	cup: 'Cup',
}

/**
 * A game is free when it names no entry fee, and when it names one of nothing —
 * a `0.00` fee is a free game written the long way, and '£0.00' would read as a
 * price.
 */
function entryLabel(entryFee: string | null): string {
	if (!entryFee) return 'Free'
	const amount = Number.parseFloat(entryFee)
	if (!Number.isFinite(amount) || amount === 0) return 'Free'
	return `£${entryFee}`
}

function playersLabel(playerCount: number, maxPlayers: number | null): string {
	const noun = playerCount === 1 ? 'player' : 'players'
	return maxPlayers ? `${playerCount} of ${maxPlayers} ${noun}` : `${playerCount} ${noun}`
}

function toView(row: DiscoverGameRow): DiscoverGameView {
	return {
		id: row.id,
		name: row.name,
		inviteCode: row.inviteCode,
		mode: row.gameMode,
		modeLabel: MODE_LABELS[row.gameMode],
		competition: row.competitionName,
		playerCount: row.playerCount,
		maxPlayers: row.maxPlayers,
		playersLabel: playersLabel(row.playerCount, row.maxPlayers),
		entryLabel: entryLabel(row.entryFee),
		startsAt: row.startingRound?.deadline ?? null,
		startRoundLabel: row.startingRound
			? roundLabelLong(row.competitionType, row.startingRound.number)
			: null,
	}
}

/**
 * Soonest start first. A game with no start time sorts last rather than first:
 * an unknown date is not an imminent one, and the top of this list is for what
 * the reader has to act on now. Name breaks a tie so the order never follows row
 * order.
 */
function bySoonestStart(a: DiscoverGameView, b: DiscoverGameView): number {
	if (a.startsAt && b.startsAt) {
		const diff = a.startsAt.getTime() - b.startsAt.getTime()
		if (diff !== 0) return diff
	} else if (a.startsAt || b.startsAt) {
		return a.startsAt ? -1 : 1
	}
	return a.name.localeCompare(b.name)
}

/** The same order reversed on time: the game that just started sits at the top. */
function byMostRecentStart(a: DiscoverGameView, b: DiscoverGameView): number {
	if (a.startsAt && b.startsAt) {
		const diff = b.startsAt.getTime() - a.startsAt.getTime()
		if (diff !== 0) return diff
	} else if (a.startsAt || b.startsAt) {
		return a.startsAt ? -1 : 1
	}
	return a.name.localeCompare(b.name)
}

/** Split the candidates into the two sections, worded and ordered. */
export function buildDiscoverView({
	games,
	now,
}: {
	games: DiscoverGameRow[]
	now: Date
}): DiscoverView {
	const openToJoin: DiscoverGameView[] = []
	const inProgress: DiscoverGameView[] = []

	for (const row of games) {
		// The three exclusions the query narrows on as well. They live here because
		// this is the rule; the SQL is only there to keep the read small, and a
		// listing that leaked a private game because a `where` clause was edited
		// would be the worst kind of quiet bug.
		if (row.visibility !== 'public') continue
		if (row.viewerIsMember) continue
		if (row.status === 'completed') continue

		const { joinable, reason } = evaluateJoinability({
			game: {
				status: row.status,
				currentRoundId: row.currentRoundId,
				startingRoundId: row.startingRoundId,
			},
			startingRound: row.startingRound,
			now,
		})

		if (joinable) openToJoin.push(toView(row))
		else if (reason === 'started') inProgress.push(toView(row))
	}

	openToJoin.sort(bySoonestStart)
	inProgress.sort(byMostRecentStart)

	return { openToJoin, inProgress }
}
