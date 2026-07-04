import { describe, expect, it } from 'vitest'
import { deriveKnockoutTies, type FeederFixture, type KnockoutTie } from './knockout-bracket'

function feeder(
	externalId: string | null,
	homeTeamId: string,
	awayTeamId: string,
	winner: 'home' | 'away' | null,
	status: FeederFixture['status'] = 'finished',
): FeederFixture {
	return { externalId, homeTeamId, awayTeamId, winner, status }
}

// A minimal 4-feeder bracket → 2 next-round ties.
// Sorted by externalId: 101,102,103,104. Pairs (101,102) and (103,104).
// home = advancer of the lower id.
const FEEDERS_4 = [
	feeder('101', 'tA', 'tB', 'home'), // advancer tA
	feeder('102', 'tC', 'tD', 'away'), // advancer tD
	feeder('103', 'tE', 'tF', 'home'), // advancer tE
	feeder('104', 'tG', 'tH', 'away'), // advancer tH
]
const TIE_1: KnockoutTie = { homeTeamId: 'tA', awayTeamId: 'tD' }
const TIE_2: KnockoutTie = { homeTeamId: 'tE', awayTeamId: 'tH' }

describe('deriveKnockoutTies', () => {
	it('derives ties by pairing consecutive feeder IDs, home = advancer of lower ID', () => {
		const result = deriveKnockoutTies(FEEDERS_4, [])
		expect(result.valid).toBe(true)
		if (!result.valid) return
		expect(result.ties).toEqual([TIE_1, TIE_2])
	})

	it('flags selfValidated=false when there are no already-drawn ties to check against', () => {
		const result = deriveKnockoutTies(FEEDERS_4, [])
		expect(result.valid).toBe(true)
		if (!result.valid) return
		expect(result.selfValidated).toBe(false)
	})

	it('self-validates when a drawn tie exactly matches a derived tie', () => {
		const result = deriveKnockoutTies(FEEDERS_4, [TIE_1])
		expect(result.valid).toBe(true)
		if (!result.valid) return
		expect(result.selfValidated).toBe(true)
		expect(result.ties).toEqual([TIE_1, TIE_2])
	})

	it('is not fooled by feeder ordering — sorts by numeric externalId', () => {
		const shuffled = [FEEDERS_4[2], FEEDERS_4[0], FEEDERS_4[3], FEEDERS_4[1]]
		const result = deriveKnockoutTies(shuffled, [TIE_1, TIE_2])
		expect(result.valid).toBe(true)
		if (!result.valid) return
		expect(result.ties).toEqual([TIE_1, TIE_2])
	})

	it('rejects when a drawn tie has home/away flipped vs the derived rule', () => {
		// Source drew the tie with the sides reversed → our home/away convention
		// disagrees with the source; abort rather than seed a wrongly-oriented tie.
		const flipped: KnockoutTie = { homeTeamId: 'tD', awayTeamId: 'tA' }
		const result = deriveKnockoutTies(FEEDERS_4, [flipped])
		expect(result.valid).toBe(false)
	})

	it('rejects when a drawn tie pairs teams that no derived tie contains', () => {
		const bogus: KnockoutTie = { homeTeamId: 'tA', awayTeamId: 'tH' }
		const result = deriveKnockoutTies(FEEDERS_4, [bogus])
		expect(result.valid).toBe(false)
	})

	it('rejects an odd number of feeders', () => {
		const result = deriveKnockoutTies(FEEDERS_4.slice(0, 3), [])
		expect(result.valid).toBe(false)
	})

	it('rejects when a feeder has not finished (bracket not ready)', () => {
		const notReady = [...FEEDERS_4.slice(0, 3), feeder('104', 'tG', 'tH', null, 'live')]
		const result = deriveKnockoutTies(notReady, [])
		expect(result.valid).toBe(false)
	})

	it('rejects when a finished feeder has no recorded winner', () => {
		const noWinner = [...FEEDERS_4.slice(0, 3), feeder('104', 'tG', 'tH', null, 'finished')]
		const result = deriveKnockoutTies(noWinner, [])
		expect(result.valid).toBe(false)
	})

	it('rejects when a feeder is missing an externalId (cannot order it)', () => {
		const unbound = [...FEEDERS_4.slice(0, 3), feeder(null, 'tG', 'tH', 'away')]
		const result = deriveKnockoutTies(unbound, [])
		expect(result.valid).toBe(false)
	})

	it('rejects an empty feeder set', () => {
		expect(deriveKnockoutTies([], []).valid).toBe(false)
	})

	// Mirrors the real R32 → R16 incident: 16 feeders, 5 ties already drawn by the
	// source, derivation must reproduce those 5 and surface the 3 undrawn ties.
	it('reproduces drawn ties and surfaces undrawn ties (R32 → R16 shape)', () => {
		// feeder externalId : advancer (home of its own tie)
		const feeders = [
			feeder('415', 'PAR', 'x', 'home'),
			feeder('416', 'FRA', 'x', 'home'),
			feeder('417', 'CAN', 'x', 'home'),
			feeder('418', 'MAR', 'x', 'home'),
			feeder('419', 'POR', 'x', 'home'),
			feeder('420', 'ESP', 'x', 'home'),
			feeder('421', 'USA', 'x', 'home'),
			feeder('422', 'BEL', 'x', 'home'),
			feeder('423', 'BRA', 'x', 'home'),
			feeder('424', 'NOR', 'x', 'home'),
			feeder('425', 'MEX', 'x', 'home'),
			feeder('426', 'ENG', 'x', 'home'),
			feeder('427', 'ARG', 'x', 'home'),
			feeder('428', 'EGY', 'x', 'home'),
			feeder('429', 'SUI', 'x', 'home'),
			feeder('430', 'COL', 'x', 'home'),
		]
		const drawn: KnockoutTie[] = [
			{ homeTeamId: 'PAR', awayTeamId: 'FRA' },
			{ homeTeamId: 'CAN', awayTeamId: 'MAR' },
			{ homeTeamId: 'USA', awayTeamId: 'BEL' },
			{ homeTeamId: 'BRA', awayTeamId: 'NOR' },
			{ homeTeamId: 'MEX', awayTeamId: 'ENG' },
		]
		const result = deriveKnockoutTies(feeders, drawn)
		expect(result.valid).toBe(true)
		if (!result.valid) return
		expect(result.selfValidated).toBe(true)
		// The three undrawn ties.
		const undrawn = result.ties.filter(
			(t) => !drawn.some((d) => d.homeTeamId === t.homeTeamId && d.awayTeamId === t.awayTeamId),
		)
		expect(undrawn).toEqual([
			{ homeTeamId: 'POR', awayTeamId: 'ESP' },
			{ homeTeamId: 'ARG', awayTeamId: 'EGY' },
			{ homeTeamId: 'SUI', awayTeamId: 'COL' },
		])
	})
})
