import { describe, expect, it } from 'vitest'
import { type GridSortKey, sortGridPlayers } from './grid-sort'

interface P {
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber?: number
	goals: number
}
const p = (over: Partial<P> & { name: string }): P => ({
	status: 'alive',
	goals: 0,
	...over,
})

const sortNames = (players: P[], key: GridSortKey) =>
	sortGridPlayers(players, key).map((x) => x.name)

describe('sortGridPlayers', () => {
	it("'status': alive before eliminated, later-eliminated above earlier, then name A–Z", () => {
		const players = [
			p({ name: 'Zoe', status: 'eliminated', eliminatedRoundNumber: 1 }),
			p({ name: 'Bob', status: 'alive' }),
			p({ name: 'Amy', status: 'alive' }),
			p({ name: 'Max', status: 'eliminated', eliminatedRoundNumber: 3 }),
		]
		expect(sortNames(players, 'status')).toEqual(['Amy', 'Bob', 'Max', 'Zoe'])
	})

	it("'goals': highest first, ties broken by name", () => {
		const players = [
			p({ name: 'Amy', goals: 4 }),
			p({ name: 'Bob', goals: 9 }),
			p({ name: 'Cas', goals: 4 }),
		]
		expect(sortNames(players, 'goals')).toEqual(['Bob', 'Amy', 'Cas'])
	})

	it("'name': alphabetical regardless of status/goals", () => {
		const players = [
			p({ name: 'Cas', status: 'eliminated', eliminatedRoundNumber: 2, goals: 9 }),
			p({ name: 'Amy', goals: 0 }),
			p({ name: 'Bob', goals: 3 }),
		]
		expect(sortNames(players, 'name')).toEqual(['Amy', 'Bob', 'Cas'])
	})

	it('does not mutate the input array', () => {
		const players = [p({ name: 'Bob' }), p({ name: 'Amy' })]
		const before = players.map((x) => x.name)
		sortGridPlayers(players, 'name')
		expect(players.map((x) => x.name)).toEqual(before)
	})
})
