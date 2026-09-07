import type { GridCell } from './read/standings'

export type GridSortKey = 'status' | 'goals' | 'name' | 'round'
export type GridSortDir = 'asc' | 'desc'

export interface GridSort {
	key: GridSortKey
	/** Required when key === 'round' — which round's picked team to order by. */
	roundId?: string
	dir: GridSortDir
}

interface SortablePlayer {
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber?: number
	goals: number
	/** Per-round cells; only the picked team's short name is consulted for the 'round' sort. */
	cellsByRoundId?: Record<string, { teamShortName?: string } | undefined>
}

/**
 * Order players for the progress grid. Pure + non-mutating.
 *
 * The player name is always the secondary tiebreak (A–Z) and is NOT reversed by
 * `dir` — only each key's primary metric flips. For 'round', players with no
 * picked team (no_pick / void / locked / empty) always sink to the bottom,
 * regardless of direction.
 *
 *  - 'name'   asc A–Z (default) / desc Z–A
 *  - 'goals'  asc low→high / desc high→low (the natural first click)
 *  - 'status' asc alive-first then later-eliminated (survived longer) / desc reversed
 *  - 'round'  asc picked-team A–Z (default) / desc Z–A; no pick last either way
 */
export function sortGridPlayers<T extends SortablePlayer>(players: T[], sort: GridSort): T[] {
	const roundId = sort.roundId
	const teamOf = (pl: T): string | undefined =>
		roundId ? pl.cellsByRoundId?.[roundId]?.teamShortName : undefined

	return [...players].sort((a, b) => {
		const name = a.name.localeCompare(b.name)

		// 'round' handles its own no-team-last rule before applying direction.
		if (sort.key === 'round') {
			const ta = teamOf(a)
			const tb = teamOf(b)
			if (!ta && !tb) return name
			if (!ta) return 1
			if (!tb) return -1
			const prim = ta.localeCompare(tb)
			return (sort.dir === 'desc' ? -prim : prim) || name
		}

		let prim: number
		if (sort.key === 'name') {
			prim = name
		} else if (sort.key === 'goals') {
			prim = a.goals - b.goals // asc = low→high
		} else {
			// 'status', asc = alive-first then later-eliminated above earlier
			if (a.status === 'alive' && b.status !== 'alive') prim = -1
			else if (a.status !== 'alive' && b.status === 'alive') prim = 1
			else if (a.status === 'eliminated' && b.status === 'eliminated')
				prim = (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0)
			else prim = 0
		}

		return (sort.dir === 'desc' ? -prim : prim) || name
	})
}

/** Whether a grid cell represents a submitted classic pick. */
export function hasValidClassicPick(cell: GridCell): boolean {
	return cell.result !== 'empty' && cell.result !== 'no_pick' && cell.result !== 'skull'
}

interface CurrentWeekRound {
	id: string
	number: number
	picksLocked: boolean
}

interface CurrentWeekPlayer {
	cellsByRoundId: Record<string, GridCell>
}

/**
 * Which round the "current week" filter/share speaks about.
 *
 * `game.currentRoundId` moves to the next round in the same transaction that
 * settles the one before it (`advanceGame`), so for the whole gap between
 * that instant and the new round's own deadline, the game's current round has
 * no submitted pick from anyone. Reading it verbatim flips the filter from a
 * full house of freshly-revealed results to an empty one exactly when the
 * results are newest — there'd be no way to share what just happened in the
 * gameweek that closed a moment ago.
 *
 * Falls back to the most recent LOCKED round behind the current one when the
 * current one has nothing yet — the same "most recent round with something to
 * show" reasoning `selectRoundSummaryRound` applies to the round summary
 * card. The moment anyone submits a pick for the new round, this reports that
 * round again.
 */
export function resolveCurrentWeekRoundId(
	rounds: CurrentWeekRound[],
	players: CurrentWeekPlayer[],
	currentRoundId: string | null,
): string | null {
	if (currentRoundId == null) return null

	const hasCurrentPick = players.some((p) => {
		const cell = p.cellsByRoundId[currentRoundId]
		return cell != null && hasValidClassicPick(cell)
	})
	if (hasCurrentPick) return currentRoundId

	const currentRound = rounds.find((r) => r.id === currentRoundId)
	if (!currentRound) return currentRoundId

	const fallback = rounds
		.filter((r) => r.number < currentRound.number && r.picksLocked)
		.reduce<CurrentWeekRound | null>(
			(latest, r) => (latest == null || r.number > latest.number ? r : latest),
			null,
		)
	return fallback?.id ?? currentRoundId
}

interface LastCompleteWeekRound {
	id: string
	number: number
	picksLocked: boolean
}

/**
 * Which round the "last complete week" filter/share speaks about: the most
 * recent round whose picks are locked — full stop, never the game's current
 * round even once someone has an advance pick sitting on it.
 *
 * This differs from `resolveCurrentWeekRoundId`'s fallback on purpose. That
 * function reports the current round the moment ANY player has a submitted
 * pick on it, which an advance pick can trigger long before its deadline —
 * so right after a gameweek settles, "current week" can flip to a round
 * whose picks are still hidden from everyone, for the one player who picked
 * ahead. "Last complete week" always names the gameweek that just finished,
 * so a share taken in that gap reports who survived it rather than an
 * almost-empty next round.
 */
export function resolveLastCompleteWeekRoundId<T extends LastCompleteWeekRound>(
	rounds: T[],
): string | null {
	return (
		rounds
			.filter((r) => r.picksLocked)
			.reduce<T | null>(
				(latest, r) => (latest == null || r.number > latest.number ? r : latest),
				null,
			)?.id ?? null
	)
}
