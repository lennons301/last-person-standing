import { describe, expect, it } from 'vitest'
import { roundLabel, roundLabelLong } from './round-label'

describe('roundLabel', () => {
	it('formats league rounds as GW{n}', () => {
		expect(roundLabel('league', 1)).toBe('GW1')
		expect(roundLabel('league', 38)).toBe('GW38')
	})

	it('formats group_knockout group rounds as MD{n}', () => {
		expect(roundLabel('group_knockout', 1)).toBe('MD1')
		expect(roundLabel('group_knockout', 2)).toBe('MD2')
		expect(roundLabel('group_knockout', 3)).toBe('MD3')
	})

	it('formats the WC-2026 48-team knockout rounds (Round of 32 first)', () => {
		expect(roundLabel('group_knockout', 4)).toBe('R32')
		expect(roundLabel('group_knockout', 5)).toBe('R16')
		expect(roundLabel('group_knockout', 6)).toBe('QF')
		expect(roundLabel('group_knockout', 7)).toBe('SF')
		expect(roundLabel('group_knockout', 8)).toBe('F')
	})

	it('formats single-elim knockout rounds as R{n}', () => {
		expect(roundLabel('knockout', 1)).toBe('R1')
		expect(roundLabel('knockout', 2)).toBe('R2')
	})

	it('falls back to R{n} beyond the Final (round 9+)', () => {
		expect(roundLabel('group_knockout', 9)).toBe('R9')
	})
})

describe('roundLabelLong', () => {
	it('formats league rounds with full Gameweek prefix', () => {
		expect(roundLabelLong('league', 12)).toBe('Gameweek 12')
	})

	it('formats group_knockout group rounds as Matchday {n}', () => {
		expect(roundLabelLong('group_knockout', 1)).toBe('Matchday 1')
	})

	it('formats the WC-2026 knockout rounds with full names (Round of 32 first)', () => {
		expect(roundLabelLong('group_knockout', 4)).toBe('Round of 32')
		expect(roundLabelLong('group_knockout', 5)).toBe('Round of 16')
		expect(roundLabelLong('group_knockout', 6)).toBe('Quarter-finals')
		expect(roundLabelLong('group_knockout', 7)).toBe('Semi-finals')
		expect(roundLabelLong('group_knockout', 8)).toBe('Final')
	})
})
