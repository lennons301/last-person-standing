import { describe, expect, it } from 'vitest'
import {
	type FeederFixture,
	findByTeamPair,
	type PlannerRound,
	planKnockoutSeeding,
} from './knockout-bracket'

function fx(
	externalId: string | null,
	homeTeamId: string,
	awayTeamId: string,
	winner: 'home' | 'away' | null = null,
	status: FeederFixture['status'] = 'scheduled',
): FeederFixture {
	return { externalId, homeTeamId, awayTeamId, winner, status }
}

// A finished R32 feeder: 16 matches whose home team advances (winner:'home').
// externalId 415..430; consecutive pairs form the 8 R16 ties.
const R32_WINNERS = [
	'PAR',
	'FRA',
	'CAN',
	'MAR',
	'POR',
	'ESP',
	'USA',
	'BEL',
	'BRA',
	'NOR',
	'MEX',
	'ENG',
	'ARG',
	'EGY',
	'SUI',
	'COL',
]
function r32Feeders(): FeederFixture[] {
	return R32_WINNERS.map((w, i) => fx(String(415 + i), w, `loser${i}`, 'home', 'finished'))
}
// The 8 R16 ties (home = winner of lower feeder id).
const R16_TIES: Array<[string, string]> = [
	['PAR', 'FRA'],
	['CAN', 'MAR'],
	['POR', 'ESP'],
	['USA', 'BEL'],
	['BRA', 'NOR'],
	['MEX', 'ENG'],
	['ARG', 'EGY'],
	['SUI', 'COL'],
]

describe('findByTeamPair', () => {
	const fixtures = [fx('1', 'A', 'B'), fx('2', 'C', 'D')]
	it('matches on team pair regardless of orientation', () => {
		expect(findByTeamPair('B', 'A', fixtures)?.externalId).toBe('1')
		expect(findByTeamPair('C', 'D', fixtures)?.externalId).toBe('2')
	})
	it('returns undefined when no fixture has both teams', () => {
		expect(findByTeamPair('A', 'C', fixtures)).toBeUndefined()
	})
})

describe('planKnockoutSeeding', () => {
	it('seeds the undrawn R16 ties, validated in-round against the drawn ones', () => {
		// Round 5 (R16) has 5 source-drawn ties (externalId set); 3 are missing.
		const drawnR16 = [
			fx('537375', 'PAR', 'FRA'),
			fx('537376', 'CAN', 'MAR'),
			fx('537380', 'USA', 'BEL'),
			fx('537377', 'BRA', 'NOR'),
			fx('537378', 'MEX', 'ENG'),
		]
		const rounds: PlannerRound[] = [
			{ number: 3, isKnockout: false, fixtures: [] },
			{ number: 4, isKnockout: true, fixtures: r32Feeders() },
			{ number: 5, isKnockout: true, fixtures: drawnR16 },
		]
		const { plan } = planKnockoutSeeding(rounds)
		const r16 = plan.find((p) => p.roundNumber === 5)
		expect(r16).toBeDefined()
		expect(r16?.validation).toBe('in-round')
		expect(r16?.ties).toEqual([
			{ homeTeamId: 'POR', awayTeamId: 'ESP' },
			{ homeTeamId: 'ARG', awayTeamId: 'EGY' },
			{ homeTeamId: 'SUI', awayTeamId: 'COL' },
		])
	})

	it('seeds all QF ties with no drawn ties, validated via the prior R32→R16 transition', () => {
		// R16 fully drawn + finished (its winners feed the QF). QF round empty.
		const r16Finished = R16_TIES.map(([home, away], i) =>
			fx(String(537375 + i), home, away, 'home', 'finished'),
		)
		const rounds: PlannerRound[] = [
			{ number: 4, isKnockout: true, fixtures: r32Feeders() },
			{ number: 5, isKnockout: true, fixtures: r16Finished },
			{ number: 6, isKnockout: true, fixtures: [] },
		]
		const { plan } = planKnockoutSeeding(rounds)
		const qf = plan.find((p) => p.roundNumber === 6)
		expect(qf).toBeDefined()
		expect(qf?.validation).toBe('prior-transition')
		// QF ties = winners of consecutive R16 pairs (home advances in fixtures above).
		expect(qf?.ties).toEqual([
			{ homeTeamId: 'PAR', awayTeamId: 'CAN' },
			{ homeTeamId: 'POR', awayTeamId: 'USA' },
			{ homeTeamId: 'BRA', awayTeamId: 'MEX' },
			{ homeTeamId: 'ARG', awayTeamId: 'SUI' },
		])
	})

	it('does NOT derive the first knockout round (R32) — its feeder is a group round', () => {
		const rounds: PlannerRound[] = [
			{ number: 3, isKnockout: false, fixtures: [fx('1', 'x', 'y', 'home', 'finished')] },
			{ number: 4, isKnockout: true, fixtures: [] },
		]
		const { plan, skipped } = planKnockoutSeeding(rounds)
		expect(plan.find((p) => p.roundNumber === 4)).toBeUndefined()
		expect(skipped.some((s) => s.roundNumber === 4)).toBe(true)
	})

	it('skips a round whose feeder is not yet fully finished', () => {
		const partialR32 = r32Feeders().map((f, i) =>
			i === 0 ? { ...f, status: 'live' as const, winner: null } : f,
		)
		const rounds: PlannerRound[] = [
			{ number: 4, isKnockout: true, fixtures: partialR32 },
			{ number: 5, isKnockout: true, fixtures: [] },
		]
		const { plan } = planKnockoutSeeding(rounds)
		expect(plan.find((p) => p.roundNumber === 5)).toBeUndefined()
	})

	it('seeds nothing when the round is already complete', () => {
		const allR16 = R16_TIES.map(([home, away], i) => fx(String(537375 + i), home, away))
		const rounds: PlannerRound[] = [
			{ number: 4, isKnockout: true, fixtures: r32Feeders() },
			{ number: 5, isKnockout: true, fixtures: allR16 },
		]
		const { plan } = planKnockoutSeeding(rounds)
		const r16 = plan.find((p) => p.roundNumber === 5)
		expect(r16?.ties ?? []).toEqual([])
	})

	it('does not duplicate a tie already present with reversed home/away', () => {
		// Only the POR/ESP tie is missing; ARG/EGY present but reversed orientation.
		const drawn = [
			fx('537375', 'PAR', 'FRA'),
			fx('537376', 'CAN', 'MAR'),
			fx('537380', 'USA', 'BEL'),
			fx('537377', 'BRA', 'NOR'),
			fx('537378', 'MEX', 'ENG'),
			fx('537382', 'SUI', 'COL'),
			fx(null, 'EGY', 'ARG'), // provisional, reversed orientation
		]
		const rounds: PlannerRound[] = [
			{ number: 4, isKnockout: true, fixtures: r32Feeders() },
			{ number: 5, isKnockout: true, fixtures: drawn },
		]
		const { plan } = planKnockoutSeeding(rounds)
		const r16 = plan.find((p) => p.roundNumber === 5)
		expect(r16?.ties).toEqual([{ homeTeamId: 'POR', awayTeamId: 'ESP' }])
	})

	it('skips (does not seed) when the consecutive-pair rule fails in-round validation', () => {
		const drawnBad = [fx('537375', 'PAR', 'COL')] // COL should not be PAR's opponent
		const rounds: PlannerRound[] = [
			{ number: 4, isKnockout: true, fixtures: r32Feeders() },
			{ number: 5, isKnockout: true, fixtures: drawnBad },
		]
		const { plan, skipped } = planKnockoutSeeding(rounds)
		expect(plan.find((p) => p.roundNumber === 5)).toBeUndefined()
		expect(skipped.some((s) => s.roundNumber === 5)).toBe(true)
	})
})
