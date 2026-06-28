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

function cupPlayer(
	id: string,
	startingLives: number,
	picks: [rank: number, fixtureId: string, side: 'home' | 'away', tierDiff: number][],
): ScenarioPlayerInput {
	return {
		gamePlayerId: id,
		livesRemaining: 0,
		startingLives,
		picks: picks.map(([rank, fixtureId, pickedSide, tierDifference]) => ({
			rank,
			fixtureId,
			predictedResult: pickedSide === 'home' ? 'home_win' : 'away_win',
			pickedSide,
			tierDifference,
		})),
	}
}

const cup = { mode: 'cup' as const }

describe('winScenarios (cup)', () => {
	it('CUP-A: a life keeps the streak alive through a loss (turbo would break)', () => {
		// startingLives 1. f1 home win, f2 away win, f3 pending.
		// p1 backs home both played: r1 win, r2 loses-but-saved (life→0). p2 backs away: r1 saved, r2 win.
		// Both bank streak 2 into the pending r3 → f3 decides.
		const fixtures: FixtureOutcomes = { f1: 'home_win', f2: 'away_win', f3: null }
		const res = winScenarios(
			[
				cupPlayer('p1', 1, [
					[1, 'f1', 'home', 0],
					[2, 'f2', 'home', 0],
					[3, 'f3', 'home', 0],
				]),
				cupPlayer('p2', 1, [
					[1, 'f1', 'away', 0],
					[2, 'f2', 'away', 0],
					[3, 'f3', 'away', 0],
				]),
			],
			fixtures,
			cup,
		)
		// streak 2 banked (r2 survived only via the life) → in contention, can reach 3.
		expect(outlook(res, 'p1')).toMatchObject({ floor: 2, ceiling: 3, verdict: 'in_contention' })
		expect(outlook(res, 'p1').pivotalPicks).toEqual([{ rank: 3, fixtureId: 'f3' }])
		expect(branchFor(res, 'f3', 'home_win')?.winners).toEqual(['p1'])
		expect(branchFor(res, 'f3', 'away_win')?.winners).toEqual(['p2'])
		expect(branchFor(res, 'f3', 'draw')?.winners.sort()).toEqual(['p1', 'p2'])
	})

	it('CUP-B: lives break a streak tie — a clear winner, not a goals tie', () => {
		// Both finish on streak 1, but p1 backed an underdog (tierDiff -1) so gained a life.
		// Cup ranks streak then LIVES → p1 wins outright; p2 is out.
		const fixtures: FixtureOutcomes = { f1: 'home_win' }
		const res = winScenarios(
			[
				cupPlayer('p1', 0, [[1, 'f1', 'home', -1]]), // underdog home win → +1 life
				cupPlayer('p2', 0, [[1, 'f1', 'home', 0]]), // even win → no life
			],
			fixtures,
			cup,
		)
		expect(outlook(res, 'p1').verdict).toBe('leading')
		expect(outlook(res, 'p2').verdict).toBe('out')
		expect(res.table).toBeNull() // decided
	})
})
