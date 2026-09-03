import { describe, expect, it } from 'vitest'
import {
	type ClassicSurvivalGame,
	type ClassicSurvivalRoundFixture,
	isKnockoutRound,
	settleClassicPick,
} from './classic-survival'

const HOME = 'team-home'
const AWAY = 'team-away'

/** A knockout tie, level at full time — the shape the winner-lag incident had. */
function tie(overrides: Partial<ClassicSurvivalRoundFixture> = {}): ClassicSurvivalRoundFixture {
	return {
		roundId: 'r-ko',
		homeTeamId: HOME,
		awayTeamId: AWAY,
		homeScore: 1,
		awayScore: 1,
		winner: null,
		status: 'finished',
		knockout: true,
		...overrides,
	}
}

/** A game that began on some other round, so nothing here is exempt. */
const GAME: ClassicSurvivalGame = {
	startingRoundId: 'r-opening',
	modeConfig: { mode: 'classic', allowRebuys: false },
}

describe('settleClassicPick', () => {
	it('scores a penalty-decided tie by the winner, not by the level score', () => {
		// The divergence the live view showed as a loss while settlement scored a
		// win: level on score, `winner` populated (#242).
		expect(settleClassicPick({ teamId: HOME }, tie({ winner: 'home' }), GAME)).toEqual({
			result: 'win',
			goalsScored: 1,
			eliminates: false,
			defer: false,
		})
	})

	it('defers an unresolved knockout tie rather than scoring it a draw', () => {
		// #107: a knockout tie finished level with no winner reported is
		// football-data's winner-lag, not a draw. Nothing is written until it
		// resolves — scoring it a draw eliminates a backer who went through.
		expect(settleClassicPick({ teamId: HOME }, tie(), GAME)).toEqual({
			result: null,
			goalsScored: 0,
			eliminates: false,
			defer: true,
		})
	})

	it('scores a league draw as a draw, and a draw puts the player out', () => {
		expect(
			settleClassicPick({ teamId: HOME }, tie({ roundId: 'r-league', knockout: false }), GAME),
		).toEqual({ result: 'draw', goalsScored: 0, eliminates: true, defer: false })
	})

	it('exempts a loss on the game’s own starting round, whatever gameweek that is', () => {
		// The exemption hangs off `game.starting_round_id`, not `round.number === 1`
		// — a game created in November opens on gameweek 12 (#203).
		const midSeasonOpener = tie({ roundId: 'r-gw12', knockout: false, awayScore: 3 })
		const game: ClassicSurvivalGame = {
			startingRoundId: 'r-gw12',
			modeConfig: { mode: 'classic', allowRebuys: false },
		}
		expect(settleClassicPick({ teamId: HOME }, midSeasonOpener, game)).toEqual({
			result: 'loss',
			goalsScored: 0,
			eliminates: false,
			defer: false,
		})
	})

	it('defers a fixture with no scores yet rather than reading it as goalless', () => {
		const notKickedOff = tie({ status: 'scheduled', homeScore: null, awayScore: null })
		expect(settleClassicPick({ teamId: HOME }, notKickedOff, GAME)).toEqual({
			result: null,
			goalsScored: 0,
			eliminates: false,
			defer: true,
		})
	})

	it('has no exemption when the game allows rebuys', () => {
		const midSeasonOpener = tie({ roundId: 'r-gw12', knockout: false, awayScore: 3 })
		const game: ClassicSurvivalGame = {
			startingRoundId: 'r-gw12',
			modeConfig: { mode: 'classic', allowRebuys: true },
		}
		expect(settleClassicPick({ teamId: HOME }, midSeasonOpener, game).eliminates).toBe(true)
	})

	it('resolves nothing for a pick whose team is unknown', () => {
		// The live payload strips the team from a pick whose deadline hasn't
		// passed. There is no side to score, so there is no result — and never a
		// silent reading of it as the away team.
		expect(settleClassicPick({ teamId: null }, tie({ winner: 'away' }), GAME)).toEqual({
			result: null,
			goalsScored: 0,
			eliminates: false,
			defer: true,
		})
	})

	it('reads a knockout tie still in play as a draw, not a deferral', () => {
		// Only a finished tie defers: level at half time is the live view's
		// "drawing", and the player is projected out on it like any other draw.
		expect(settleClassicPick({ teamId: HOME }, tie({ status: 'live' }), GAME)).toEqual({
			result: 'draw',
			goalsScored: 0,
			eliminates: true,
			defer: false,
		})
	})
})

describe('isKnockoutRound', () => {
	it('is false for a league round, whatever its number', () => {
		expect(isKnockoutRound('league', 38)).toBe(false)
	})

	it('is true for every round of a knockout competition', () => {
		expect(isKnockoutRound('knockout', 1)).toBe(true)
	})

	it('splits a group-knockout competition at the end of the group stage', () => {
		// The World Cup: rounds 1–3 are the group stage, 4 onwards the bracket.
		expect(isKnockoutRound('group_knockout', 3)).toBe(false)
		expect(isKnockoutRound('group_knockout', 4)).toBe(true)
	})
})
