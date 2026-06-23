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
