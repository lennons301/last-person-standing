import { describe, expect, it } from 'vitest'
import { determineFixtureOutcome, determinePickResult } from './common'

describe('determineFixtureOutcome', () => {
	it('returns home_win when home score is higher', () => {
		expect(determineFixtureOutcome(2, 1)).toBe('home_win')
	})
	it('returns away_win when away score is higher', () => {
		expect(determineFixtureOutcome(0, 3)).toBe('away_win')
	})
	it('returns draw when scores are equal', () => {
		expect(determineFixtureOutcome(1, 1)).toBe('draw')
	})
	it('handles 0-0 draw', () => {
		expect(determineFixtureOutcome(0, 0)).toBe('draw')
	})
})

describe('determinePickResult', () => {
	it('returns win when picked team is home and home wins', () => {
		expect(
			determinePickResult({
				pickedTeamId: 'a',
				homeTeamId: 'a',
				awayTeamId: 'b',
				homeScore: 2,
				awayScore: 0,
			}),
		).toBe('win')
	})
	it('returns win when picked team is away and away wins', () => {
		expect(
			determinePickResult({
				pickedTeamId: 'b',
				homeTeamId: 'a',
				awayTeamId: 'b',
				homeScore: 0,
				awayScore: 1,
			}),
		).toBe('win')
	})
	it('returns loss when picked team is home and away wins', () => {
		expect(
			determinePickResult({
				pickedTeamId: 'a',
				homeTeamId: 'a',
				awayTeamId: 'b',
				homeScore: 0,
				awayScore: 2,
			}),
		).toBe('loss')
	})
	it('returns loss when picked team is away and home wins', () => {
		expect(
			determinePickResult({
				pickedTeamId: 'b',
				homeTeamId: 'a',
				awayTeamId: 'b',
				homeScore: 3,
				awayScore: 1,
			}),
		).toBe('loss')
	})
	it('returns draw when scores are equal', () => {
		expect(
			determinePickResult({
				pickedTeamId: 'a',
				homeTeamId: 'a',
				awayTeamId: 'b',
				homeScore: 1,
				awayScore: 1,
			}),
		).toBe('draw')
	})
})
