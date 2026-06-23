import { describe, expect, it } from 'vitest'
import { type GridSort, sortGridPlayers } from './grid-sort'

interface P {
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	eliminatedRoundNumber?: number
	goals: number
	cellsByRoundId?: Record<string, { teamShortName?: string } | undefined>
}
const p = (over: Partial<P> & { name: string }): P => ({
	status: 'alive',
	goals: 0,
	...over,
})

const order = (players: P[], sort: GridSort) => sortGridPlayers(players, sort).map((x) => x.name)

describe('sortGridPlayers', () => {
	describe("'status'", () => {
		it('asc: alive before eliminated, later-eliminated above earlier, then name A–Z', () => {
			const players = [
				p({ name: 'Zoe', status: 'eliminated', eliminatedRoundNumber: 1 }),
				p({ name: 'Bob', status: 'alive' }),
				p({ name: 'Amy', status: 'alive' }),
				p({ name: 'Max', status: 'eliminated', eliminatedRoundNumber: 3 }),
			]
			expect(order(players, { key: 'status', dir: 'asc' })).toEqual(['Amy', 'Bob', 'Max', 'Zoe'])
		})

		it('desc: reverses the status ordering, name still A–Z within ties', () => {
			const players = [
				p({ name: 'Bob', status: 'alive' }),
				p({ name: 'Amy', status: 'alive' }),
				p({ name: 'Zoe', status: 'eliminated', eliminatedRoundNumber: 1 }),
			]
			expect(order(players, { key: 'status', dir: 'desc' })).toEqual(['Zoe', 'Amy', 'Bob'])
		})
	})

	describe("'goals'", () => {
		it('desc: highest first, ties by name', () => {
			const players = [
				p({ name: 'Amy', goals: 4 }),
				p({ name: 'Bob', goals: 9 }),
				p({ name: 'Cas', goals: 4 }),
			]
			expect(order(players, { key: 'goals', dir: 'desc' })).toEqual(['Bob', 'Amy', 'Cas'])
		})

		it('asc: lowest first', () => {
			const players = [p({ name: 'Bob', goals: 9 }), p({ name: 'Amy', goals: 4 })]
			expect(order(players, { key: 'goals', dir: 'asc' })).toEqual(['Amy', 'Bob'])
		})
	})

	describe("'name'", () => {
		it('asc: A–Z regardless of status/goals', () => {
			const players = [
				p({ name: 'Cas', status: 'eliminated', eliminatedRoundNumber: 2, goals: 9 }),
				p({ name: 'Amy' }),
				p({ name: 'Bob', goals: 3 }),
			]
			expect(order(players, { key: 'name', dir: 'asc' })).toEqual(['Amy', 'Bob', 'Cas'])
		})

		it('desc: Z–A', () => {
			const players = [p({ name: 'Amy' }), p({ name: 'Cas' }), p({ name: 'Bob' })]
			expect(order(players, { key: 'name', dir: 'desc' })).toEqual(['Cas', 'Bob', 'Amy'])
		})
	})

	describe("'round' (by picked team)", () => {
		const cell = (team?: string) => ({ r1: team ? { teamShortName: team } : undefined })

		it('asc: groups by picked team A–Z, ties by name; no-pick sinks to the bottom', () => {
			const players = [
				p({ name: 'Carol', cellsByRoundId: cell('CHE') }),
				p({ name: 'Bob', cellsByRoundId: cell('ARS') }),
				p({ name: 'Dan', cellsByRoundId: cell(undefined) }), // no pick
				p({ name: 'Alice', cellsByRoundId: cell('ARS') }),
			]
			expect(order(players, { key: 'round', roundId: 'r1', dir: 'asc' })).toEqual([
				'Alice', // ARS
				'Bob', // ARS
				'Carol', // CHE
				'Dan', // no pick → last
			])
		})

		it('desc: team Z–A, but no-pick STILL sinks to the bottom', () => {
			const players = [
				p({ name: 'Bob', cellsByRoundId: cell('ARS') }),
				p({ name: 'Dan', cellsByRoundId: cell(undefined) }),
				p({ name: 'Carol', cellsByRoundId: cell('CHE') }),
			]
			expect(order(players, { key: 'round', roundId: 'r1', dir: 'desc' })).toEqual([
				'Carol', // CHE
				'Bob', // ARS
				'Dan', // no pick → last
			])
		})
	})

	it('does not mutate the input array', () => {
		const players = [p({ name: 'Bob' }), p({ name: 'Amy' })]
		const before = players.map((x) => x.name)
		sortGridPlayers(players, { key: 'name', dir: 'asc' })
		expect(players.map((x) => x.name)).toEqual(before)
	})
})
