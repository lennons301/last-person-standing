export type GridSortKey = 'status' | 'goals' | 'name'

interface SortablePlayer {
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber?: number
	goals: number
}

/**
 * Order players for the progress grid. Pure + non-mutating.
 *  - 'status' (default): alive first; among eliminated, the later-eliminated
 *    (survived longer) rank higher; ties by name A–Z.
 *  - 'goals': most goals first; ties by name A–Z.
 *  - 'name': alphabetical.
 */
export function sortGridPlayers<T extends SortablePlayer>(players: T[], key: GridSortKey): T[] {
	const byName = (a: T, b: T) => a.name.localeCompare(b.name)
	return [...players].sort((a, b) => {
		if (key === 'name') return byName(a, b)
		if (key === 'goals') return b.goals - a.goals || byName(a, b)
		// 'status'
		if (a.status === 'alive' && b.status !== 'alive') return -1
		if (a.status !== 'alive' && b.status === 'alive') return 1
		if (a.status === 'eliminated' && b.status === 'eliminated') {
			return (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0) || byName(a, b)
		}
		return byName(a, b)
	})
}
