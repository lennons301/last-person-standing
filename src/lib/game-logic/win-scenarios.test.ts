import { describe, expect, it } from 'vitest'
import {
	type FixtureOutcomes,
	type Outcome,
	type ScenarioPlayerInput,
	winScenarios,
} from './win-scenarios'

function player(
	id: string,
	picks: [rank: number, fixtureId: string, predictedResult: Outcome][],
): ScenarioPlayerInput {
	return {
		gamePlayerId: id,
		livesRemaining: 0,
		picks: picks.map(([rank, fixtureId, predictedResult]) => ({
			rank,
			fixtureId,
			predictedResult,
		})),
	}
}

const turbo = { mode: 'turbo' as const }

function outlook(res: ReturnType<typeof winScenarios>, id: string) {
	const o = res.outlooks.find((x) => x.gamePlayerId === id)
	if (!o) throw new Error(`no outlook for ${id}`)
	return o
}

function branchFor(res: ReturnType<typeof winScenarios>, fixtureId: string, outcome: Outcome) {
	return (res.table ?? []).find(
		(b) =>
			b.conditions.length === 1 &&
			b.conditions[0].fixtureId === fixtureId &&
			b.conditions[0].outcome === outcome,
	)
}

describe('winScenarios (turbo)', () => {
	it('A: fully-played game → leading winner + out loser, no table', () => {
		const fixtures: FixtureOutcomes = { f1: 'home_win', f2: 'home_win' }
		const res = winScenarios(
			[
				player('p1', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'home_win'],
				]), // streak 2
				player('p2', [
					[1, 'f1', 'away_win'],
					[2, 'f2', 'home_win'],
				]), // r1 wrong → streak 0
			],
			fixtures,
			turbo,
		)
		expect(outlook(res, 'p1')).toMatchObject({ floor: 2, ceiling: 2, verdict: 'leading' })
		expect(outlook(res, 'p2')).toMatchObject({ floor: 0, ceiling: 0, verdict: 'out' })
		expect(res.table).toBeNull()
		expect(res.pivotalFixtureIds).toEqual([])
		expect(res.tooManyToEnumerate).toBe(false)
	})

	it('B: one pending fixture decides it → table with a branch per outcome', () => {
		const fixtures: FixtureOutcomes = { f1: 'home_win', f2: null }
		const res = winScenarios(
			[
				player('p1', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'home_win'],
				]),
				player('p2', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'away_win'],
				]),
			],
			fixtures,
			turbo,
		)
		expect(outlook(res, 'p1')).toMatchObject({ floor: 1, ceiling: 2, verdict: 'in_contention' })
		expect(outlook(res, 'p2')).toMatchObject({ floor: 1, ceiling: 2, verdict: 'in_contention' })
		// the pivotal pick for each is their rank-2 pick on f2
		expect(outlook(res, 'p1').pivotalPicks).toEqual([{ rank: 2, fixtureId: 'f2' }])
		expect(res.pivotalFixtureIds).toEqual(['f2'])
		expect(branchFor(res, 'f2', 'home_win')?.winners).toEqual(['p1'])
		expect(branchFor(res, 'f2', 'away_win')?.winners).toEqual(['p2'])
		const draw = branchFor(res, 'f2', 'draw')
		expect(draw?.winners.sort()).toEqual(['p1', 'p2'])
		expect(draw?.tieOnGoals).toBe(true)
	})

	it('C: a guaranteed leader despite an unplayed pick → no table, no pivotal fixtures', () => {
		const fixtures: FixtureOutcomes = { f1: 'home_win', f2: 'home_win', f3: null }
		const res = winScenarios(
			[
				player('p1', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'home_win'],
					[3, 'f3', 'home_win'],
				]),
				player('p2', [
					[1, 'f1', 'away_win'],
					[2, 'f2', 'home_win'],
					[3, 'f3', 'home_win'],
				]),
			],
			fixtures,
			turbo,
		)
		expect(outlook(res, 'p1')).toMatchObject({ floor: 2, ceiling: 3, verdict: 'leading' })
		expect(outlook(res, 'p2').verdict).toBe('out')
		expect(res.table).toBeNull() // winner settled regardless of f3
		expect(res.pivotalFixtureIds).toEqual([])
	})

	it('D: above the enumeration cap → approximate ranges, no table', () => {
		const fixtures: FixtureOutcomes = { f1: null, f2: null }
		const res = winScenarios(
			[
				player('p1', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'home_win'],
				]),
				player('p2', [
					[1, 'f1', 'away_win'],
					[2, 'f2', 'away_win'],
				]),
			],
			fixtures,
			{ mode: 'turbo', cap: 1 },
		)
		expect(res.tooManyToEnumerate).toBe(true)
		expect(res.table).toBeNull()
		// worst case both picks lose → 0; best case both win → 2
		expect(outlook(res, 'p1')).toMatchObject({ floor: 0, ceiling: 2, verdict: 'in_contention' })
		// pivotal picks = reachable unplayed picks, earliest first
		expect(outlook(res, 'p1').pivotalPicks).toEqual([
			{ rank: 1, fixtureId: 'f1' },
			{ rank: 2, fixtureId: 'f2' },
		])
	})

	it('E: a known early loss caps the window — later unplayed picks are not pivotal', () => {
		// p1 rank-1 already lost → streak frozen at 0; rank-2 unplayed is unreachable.
		const fixtures: FixtureOutcomes = { f1: 'away_win', f2: null }
		const res = winScenarios(
			[
				player('p1', [
					[1, 'f1', 'home_win'],
					[2, 'f2', 'home_win'],
				]), // r1 lost
				player('p2', [
					[1, 'f1', 'away_win'],
					[2, 'f2', 'home_win'],
				]), // r1 won, r2 pending
			],
			fixtures,
			turbo,
		)
		expect(outlook(res, 'p1')).toMatchObject({ floor: 0, ceiling: 0 })
		expect(outlook(res, 'p1').pivotalPicks).toEqual([]) // f2 unreachable for p1
		// p2 leads with >=1 and can reach 2; p1 capped at 0 → p2 guaranteed
		expect(outlook(res, 'p2').verdict).toBe('leading')
		expect(res.pivotalFixtureIds).toEqual([])
	})
})
