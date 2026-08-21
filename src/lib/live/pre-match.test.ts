import { describe, expect, it } from 'vitest'
import { type PreMatchFixtureRow, preMatchWinProbability } from './pre-match'

function fixtures(entries: Array<[string, PreMatchFixtureRow]>): Map<string, PreMatchFixtureRow> {
	return new Map(entries)
}

const PRICED: PreMatchFixtureRow = {
	homeTeamId: 'team-home',
	awayTeamId: 'team-away',
	odds: { homeProbability: 0.62, awayProbability: 0.22 },
}

describe('preMatchWinProbability', () => {
	it('is the picked team’s own win chance, whichever side of the fixture it is', () => {
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(preMatchWinProbability({ fixtureId: 'fx-1', teamId: 'team-home' }, byFixture)).toBe(0.62)
		expect(preMatchWinProbability({ fixtureId: 'fx-1', teamId: 'team-away' }, byFixture)).toBe(0.22)
	})

	it('is absent, never zero, for a fixture we hold no market for', () => {
		const byFixture = fixtures([
			['fx-1', { homeTeamId: 'team-home', awayTeamId: 'team-away', odds: null }],
		])

		expect(preMatchWinProbability({ fixtureId: 'fx-1', teamId: 'team-home' }, byFixture)).toBeNull()
	})

	it('is absent for a fixture the round does not hold', () => {
		expect(
			preMatchWinProbability({ fixtureId: 'fx-elsewhere', teamId: 'team-home' }, fixtures([])),
		).toBeNull()
	})

	it('carries nothing for a hidden pick, whose fixture and team are stripped', () => {
		// The live payload nulls both fields on every pick whose round has not
		// passed its deadline. Nothing to attach a probability to, so nothing is
		// attached — even with the priced fixture sitting right there.
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(preMatchWinProbability({ fixtureId: null, teamId: null }, byFixture)).toBeNull()
	})

	it('is absent for a pick whose team is not in the fixture', () => {
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(
			preMatchWinProbability({ fixtureId: 'fx-1', teamId: 'team-other' }, byFixture),
		).toBeNull()
	})
})
