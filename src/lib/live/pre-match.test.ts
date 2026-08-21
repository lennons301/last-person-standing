import { describe, expect, it } from 'vitest'
import { formatWinChance } from '@/lib/game/round-summary-view'
import {
	formatPreMatchWinChance,
	type PreMatchFixtureRow,
	preMatchWinProbability,
} from './pre-match'

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

	it('carries nothing for a call on the draw, whichever team the row is stored against', () => {
		// Turbo and cup store a draw prediction against the *home* team (the
		// picks route derives `teamId` from the prediction, and only away_win
		// takes the away side). The home side's 62% is a figure about an outcome
		// the player didn't pick, and no label makes that honest — so a draw call
		// carries nothing at all. Resolving it to the draw's own price is turbo
		// work, out of scope here (#222).
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-home', predictedResult: 'draw' },
				byFixture,
			),
		).toBeNull()
	})

	it('carries nothing where the prediction and the stored team disagree', () => {
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-home', predictedResult: 'away_win' },
				byFixture,
			),
		).toBeNull()
		// The column is a varchar, so a value this function doesn't recognise is
		// refused rather than read as a win.
		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-home', predictedResult: 'something_else' },
				byFixture,
			),
		).toBeNull()
	})

	it('is the picked team’s chance where the prediction is that team winning', () => {
		// A classic auto-pick writes `home_win` / `away_win` alongside the team, and
		// so does every turbo or cup call on a side, so the two must agree.
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-home', predictedResult: 'home_win' },
				byFixture,
			),
		).toBe(0.62)
		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-away', predictedResult: 'away_win' },
				byFixture,
			),
		).toBe(0.22)
	})

	it('is the picked team’s chance for a hand-made classic pick, which stores no prediction', () => {
		// Classic inserts a pick with `predictedResult` null — picking the team *is*
		// backing it to win, and the codebase reads a null prediction that way
		// everywhere else (`projectPickOutcome`).
		const byFixture = fixtures([['fx-1', PRICED]])

		expect(
			preMatchWinProbability(
				{ fixtureId: 'fx-1', teamId: 'team-away', predictedResult: null },
				byFixture,
			),
		).toBe(0.22)
	})
})

describe('formatPreMatchWinChance', () => {
	it('labels the figure as pre-match, so it cannot read as a live in-play price', () => {
		// The ticket's own two figures: the 22% shot and the 84% favourite.
		expect(formatPreMatchWinChance(0.2249)).toBe('Pre-match 22%')
		expect(formatPreMatchWinChance(0.8351)).toBe('Pre-match 84%')
	})

	it('rounds a half exactly as the round summary card does', () => {
		// 0.575 lands at 57.499999999999993 in binary; both surfaces of one game
		// must say 58%, so the rule is the summary card's own and not a second one.
		expect(formatPreMatchWinChance(0.575)).toBe('Pre-match 58%')
		expect(formatPreMatchWinChance(0.575)).toBe(`Pre-match ${formatWinChance(0.575)}`)
	})

	it('is nothing at all where there is no probability', () => {
		expect(formatPreMatchWinChance(null)).toBeNull()
		expect(formatPreMatchWinChance(undefined)).toBeNull()
	})
})
