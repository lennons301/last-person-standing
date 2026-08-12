import { describe, expect, it } from 'vitest'
import { formGuidePath, safeBackHref } from './form-guide-link'
import { type FormGuideResult, perGame, summariseResults } from './team-form-guide'

function result(
	home: boolean,
	goalsFor: number,
	goalsAgainst: number,
	roundNumber = 1,
): FormGuideResult {
	return {
		fixtureId: `fx-${roundNumber}-${home ? 'h' : 'a'}`,
		roundNumber,
		roundLabel: `GW${roundNumber}`,
		kickoff: null,
		opponent: { id: 'opp', name: 'Opponent', shortName: 'OPP', badgeUrl: null },
		home,
		goalsFor,
		goalsAgainst,
		result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
	}
}

describe('summariseResults', () => {
	it('tallies W/D/L and goals both ways', () => {
		expect(
			summariseResults([result(true, 3, 1, 1), result(false, 0, 0, 2), result(true, 1, 2, 3)]),
		).toEqual({ played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 4, goalsAgainst: 3 })
	})

	it('returns a zeroed record for an unplayed slice — the home/away split before a home game', () => {
		expect(summariseResults([])).toEqual({
			played: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			goalsFor: 0,
			goalsAgainst: 0,
		})
	})
})

describe('perGame', () => {
	it('averages over games played', () => {
		expect(perGame(21, 12)).toBeCloseTo(1.75)
	})

	it('is null with nothing played, so the UI can say so rather than divide by zero', () => {
		expect(perGame(0, 0)).toBeNull()
	})
})

describe('formGuidePath', () => {
	it('is competition-scoped, with no game in the URL', () => {
		expect(formGuidePath('comp-1', 'team-1')).toBe('/competition/comp-1/team/team-1')
	})

	it('carries the opponent when the guide was opened from a fixture', () => {
		expect(formGuidePath('comp-1', 'team-1', { opponent: 'team-2' })).toBe(
			'/competition/comp-1/team/team-1?opponent=team-2',
		)
	})

	it('carries the return path so the guide can offer a way back', () => {
		expect(formGuidePath('comp-1', 'team-1', { opponent: 'team-2', from: '/game/g1' })).toBe(
			'/competition/comp-1/team/team-1?opponent=team-2&from=%2Fgame%2Fg1',
		)
	})

	it('omits absent context rather than emitting empty params', () => {
		expect(formGuidePath('comp-1', 'team-1', { opponent: null, from: null })).toBe(
			'/competition/comp-1/team/team-1',
		)
	})
})

describe('safeBackHref', () => {
	it('accepts an in-app path', () => {
		expect(safeBackHref('/game/g1')).toBe('/game/g1')
		expect(safeBackHref('/game/g1?round=2')).toBe('/game/g1?round=2')
	})

	it('is null without a return path', () => {
		expect(safeBackHref(undefined)).toBeNull()
		expect(safeBackHref('')).toBeNull()
	})

	it('rejects absolute URLs', () => {
		expect(safeBackHref('https://evil.com')).toBeNull()
		expect(safeBackHref('javascript:alert(1)')).toBeNull()
	})

	it('rejects protocol-relative and backslash off-site paths', () => {
		// Both resolve off-site once the browser parses them: the WHATWG parser
		// normalises a backslash after the leading slash to a second slash.
		expect(safeBackHref('//evil.com')).toBeNull()
		expect(safeBackHref('/\\evil.com')).toBeNull()
	})
})
