import { describe, expect, it, vi } from 'vitest'
import type { ModeConfig } from './mode-config'
import {
	allFixturesTerminal,
	deriveSettlement,
	isRoundSettled,
	type SettlementCupFixture,
	type SettlementFacts,
	type SettlementPick,
	type SettlementPlayer,
	type SettlementRoundFixture,
} from './settlement-plan'

/**
 * Settlement's rules, as a table. The first unit tests they have ever had —
 * before `deriveSettlement` they were tangled with the queries that fed them,
 * so the only way to exercise the payout path was a real Postgres and the
 * lifecycle smoke suite.
 *
 * Every case is rows in, plan out. No `vi.mock('@/lib/db')`, no `as never`.
 */

const HOME = 'team-home'
const AWAY = 'team-away'
const ROUND = 'round-1'
const FIXTURE = 'fixture-1'

function player(id: string, over: Partial<SettlementPlayer> = {}): SettlementPlayer {
	return {
		id,
		status: 'alive',
		eliminatedReason: null,
		eliminatedRoundId: null,
		livesRemaining: 0,
		...over,
	}
}

function pick(id: string, over: Partial<SettlementPick> = {}): SettlementPick {
	return {
		id,
		gamePlayerId: 'gp-1',
		fixtureId: FIXTURE,
		teamId: HOME,
		confidenceRank: null,
		predictedResult: null,
		result: 'pending',
		goalsScored: null,
		lifeGained: 0,
		lifeSpent: false,
		...over,
	}
}

function roundFixture(
	id: string,
	over: Partial<SettlementRoundFixture> = {},
): SettlementRoundFixture {
	return {
		id,
		homeTeamId: HOME,
		awayTeamId: AWAY,
		homeScore: 2,
		awayScore: 1,
		status: 'finished',
		...over,
	}
}

function cupFixture(id: string, over: Partial<SettlementCupFixture> = {}): SettlementCupFixture {
	return {
		...roundFixture(id),
		homeTeam: { externalIds: {} },
		awayTeam: { externalIds: {} },
		regularHomeScore: null,
		regularAwayScore: null,
		winner: null,
		...over,
	}
}

/**
 * One game, one round, one finished fixture (home 2–1), one alive player whose
 * pending pick is on the home side. Every case below is this, altered.
 */
function facts(modeConfig: ModeConfig, over: Partial<SettlementFacts> = {}): SettlementFacts {
	const thePick = pick('pick-1')
	return {
		game: {
			id: 'game-1',
			status: 'active',
			modeConfig,
			startingRoundId: 'round-0',
			currentRoundId: ROUND,
		},
		competitionType: 'league',
		fixture: {
			id: FIXTURE,
			homeTeamId: HOME,
			awayTeamId: AWAY,
			homeScore: 2,
			awayScore: 1,
			winner: null,
			status: 'finished',
		},
		round: { id: ROUND, number: 5 },
		fixturePicks: [thePick],
		roundFixtures: [roundFixture(FIXTURE)],
		roundPicks: [thePick],
		cupRound: null,
		players: [player('gp-1')],
		gamePicks: [
			{
				id: thePick.id,
				gamePlayerId: 'gp-1',
				teamId: HOME,
				confidenceRank: null,
				result: 'pending',
				goalsScored: null,
				fixture: null,
			},
		],
		hasNextRound: true,
		competitionRounds: [],
		...over,
	}
}

const CLASSIC: ModeConfig = { mode: 'classic', allowRebuys: false }
const TURBO: ModeConfig = { mode: 'turbo', numberOfPicks: 10 }
const CUP: ModeConfig = { mode: 'cup', numberOfPicks: 10, startingLives: 0 }

/* ────────────────────────────────────────────────────────────────────── */

describe('isRoundSettled', () => {
	it('needs every fixture terminal AND no pick left pending', () => {
		const fixtures = [roundFixture('a'), roundFixture('b')]
		expect(isRoundSettled({ fixtures, picks: [{ result: 'win' }] })).toBe(true)
		// A knockout tie can be finished with its pick deliberately pending (#107);
		// the round is not done with while that is true.
		expect(isRoundSettled({ fixtures, picks: [{ result: 'pending' }] })).toBe(false)
	})

	it('counts a cancelled fixture as terminal but an unplayed one as not', () => {
		expect(allFixturesTerminal([roundFixture('a', { status: 'cancelled' })])).toBe(true)
		expect(allFixturesTerminal([roundFixture('a', { status: 'scheduled' })])).toBe(false)
		// A finished fixture with no scores reported is not terminal either.
		expect(allFixturesTerminal([roundFixture('a', { homeScore: null })])).toBe(false)
		// An empty round is never "all done".
		expect(allFixturesTerminal([])).toBe(false)
	})
})

/* ────────────────────────────────────────────────────────────────────── */

describe('deriveSettlement — classic', () => {
	it('settles a winning pick and eliminates nobody', () => {
		const plan = deriveSettlement(facts(CLASSIC))
		expect(plan.pickWrites).toEqual([{ pickId: 'pick-1', set: { result: 'win', goalsScored: 2 } }])
		expect(plan.playerWrites).toEqual([])
		expect(plan.counters.classicSettled).toBe(1)
	})

	it('settles a losing pick and takes the player out, alive-guarded', () => {
		const plan = deriveSettlement(
			facts(CLASSIC, { fixturePicks: [pick('pick-1', { teamId: AWAY })] }),
		)
		expect(plan.pickWrites).toEqual([{ pickId: 'pick-1', set: { result: 'loss', goalsScored: 0 } }])
		expect(plan.playerWrites).toEqual([
			{
				gamePlayerId: 'gp-1',
				set: { status: 'eliminated', eliminatedReason: 'loss', eliminatedRoundId: ROUND },
				requireAlive: true,
				countsAsElimination: true,
			},
		])
	})

	it("exempts a loss on the game's own starting round when rebuys are off (#203)", () => {
		const base = facts(CLASSIC, { fixturePicks: [pick('pick-1', { teamId: AWAY })] })
		base.game.startingRoundId = ROUND
		const plan = deriveSettlement(base)
		expect(plan.pickWrites[0].set.result).toBe('loss')
		expect(plan.playerWrites).toEqual([])
	})

	it('eliminates on that same round once rebuys are switched on', () => {
		const base = facts(
			{ mode: 'classic', allowRebuys: true },
			{ fixturePicks: [pick('pick-1', { teamId: AWAY })] },
		)
		base.game.startingRoundId = ROUND
		expect(deriveSettlement(base).playerWrites).toHaveLength(1)
	})

	it('defers an unresolved knockout tie rather than scoring it a draw (#107)', () => {
		const base = facts(CLASSIC, { competitionType: 'knockout' })
		base.fixture.homeScore = 1
		base.fixture.awayScore = 1
		base.roundFixtures = [roundFixture(FIXTURE, { homeScore: 1, awayScore: 1 })]
		const plan = deriveSettlement(base)
		expect(plan.pickWrites).toEqual([])
		// The pick is still pending, so the round is not settled and nothing moves.
		expect(plan.roundSettled).toBe(false)
		expect(plan.completeRound).toBe(false)
		expect(plan.advance).toBe(false)
	})

	it('reads a tie settled on penalties as a win, not the draw the score shows', () => {
		const base = facts(CLASSIC, {
			competitionType: 'knockout',
			fixturePicks: [pick('pick-1', { teamId: AWAY })],
		})
		base.fixture.homeScore = 1
		base.fixture.awayScore = 1
		base.fixture.winner = 'away'
		base.roundFixtures = [roundFixture(FIXTURE, { homeScore: 1, awayScore: 1 })]
		const plan = deriveSettlement(base)
		expect(plan.pickWrites[0].set.result).toBe('win')
		expect(plan.playerWrites).toEqual([])
	})

	it('closes the round and advances once every fixture and pick is done', () => {
		const plan = deriveSettlement(facts(CLASSIC, { players: [player('gp-1'), player('gp-2')] }))
		expect(plan.roundSettled).toBe(true)
		expect(plan.completeRound).toBe(true)
		expect(plan.advance).toBe(true)
		expect(plan.completion).toBeNull()
	})

	it('lands a late settle in a round the game has moved past without re-advancing', () => {
		const base = facts(CLASSIC, { players: [player('gp-1'), player('gp-2')] })
		base.game.currentRoundId = 'round-9'
		const plan = deriveSettlement(base)
		expect(plan.completeRound).toBe(true)
		expect(plan.advance).toBe(false)
	})

	it('holds the round open while another of its fixtures is unplayed', () => {
		const plan = deriveSettlement(
			facts(CLASSIC, {
				players: [player('gp-1'), player('gp-2')],
				roundFixtures: [roundFixture(FIXTURE), roundFixture('fixture-2', { status: 'scheduled' })],
			}),
		)
		expect(plan.roundSettled).toBe(false)
		expect(plan.completeRound).toBe(false)
	})

	it('crowns the last player standing, and leaves the round to the next settle', () => {
		const plan = deriveSettlement(
			facts(CLASSIC, {
				players: [player('gp-1'), player('gp-2', { status: 'eliminated' })],
			}),
		)
		expect(plan.completion).toEqual({
			completed: true,
			winnerPlayerIds: ['gp-1'],
			reason: 'last-alive',
		})
		expect(plan.gameCompleted).toBe(true)
		expect(plan.completeRound).toBe(false)
		expect(plan.advance).toBe(false)
	})

	it('crowns on rounds-exhausted only once the round is fully settled', () => {
		const settled = facts(CLASSIC, {
			players: [player('gp-1'), player('gp-2')],
			hasNextRound: false,
		})
		expect(deriveSettlement(settled).completion?.reason).toBe('rounds-exhausted')

		const midRound = facts(CLASSIC, {
			players: [player('gp-1'), player('gp-2')],
			hasNextRound: false,
			roundFixtures: [roundFixture(FIXTURE), roundFixture('fixture-2', { status: 'scheduled' })],
		})
		// The dc857c5f MD3 mis-crowning: no next round, but the round is still on.
		expect(deriveSettlement(midRound).completion).toBeNull()
	})

	it('is a no-op on a pick that has already settled', () => {
		const done = pick('pick-1', { result: 'win', goalsScored: 2 })
		const plan = deriveSettlement(
			facts(CLASSIC, {
				fixturePicks: [done],
				roundPicks: [done],
				players: [player('gp-1'), player('gp-2')],
			}),
		)
		expect(plan.pickWrites).toEqual([])
		expect(plan.playerWrites).toEqual([])
		expect(plan.counters.classicSettled).toBe(0)
	})

	it('settles the rows of a game that is over, and decides nothing else', () => {
		const base = facts(CLASSIC, { fixturePicks: [pick('pick-1', { teamId: AWAY })] })
		base.game.status = 'completed'
		const plan = deriveSettlement(base)
		expect(plan.pickWrites[0].set.result).toBe('loss')
		expect(plan.counters.classicSettled).toBe(1)
		// No elimination, no completion, no advancement — there is no game left.
		expect(plan.playerWrites).toEqual([])
		expect(plan.completion).toBeNull()
		expect(plan.completeRound).toBe(false)
	})

	it('voids the pending picks of a cancelled fixture', () => {
		const base = facts(CLASSIC)
		base.fixture.status = 'cancelled'
		base.roundFixtures = [
			roundFixture(FIXTURE, { status: 'cancelled' }),
			roundFixture('fixture-2', { status: 'scheduled' }),
		]
		const plan = deriveSettlement(base)
		expect(plan.pickWrites).toEqual([
			{
				pickId: 'pick-1',
				set: {
					result: 'void',
					cancellationReason: 'cancelled',
					goalsScored: 0,
					lifeGained: 0,
					lifeSpent: false,
				},
			},
		])
		expect(plan.counters.picksVoided).toBe(1)
		expect(plan.voidRound).toBe(false)
	})

	it('tears the round up once over half its fixtures are cancelled', () => {
		const base = facts(CLASSIC)
		base.fixture.status = 'cancelled'
		base.roundFixtures = [
			roundFixture(FIXTURE, { status: 'cancelled' }),
			roundFixture('fixture-2', { status: 'cancelled' }),
			roundFixture('fixture-3', { status: 'scheduled' }),
		]
		expect(deriveSettlement(base).voidRound).toBe(true)
	})

	it('voids an advance pick on a cancelled fixture without judging that round', () => {
		// The round is ten gameweeks out, so it is nobody's current round and has
		// no outcome to reach — but the pick on it is still voided.
		const base = facts(CLASSIC)
		base.fixture.status = 'cancelled'
		base.game.currentRoundId = 'round-0'
		base.roundFixtures = [
			roundFixture(FIXTURE, { status: 'cancelled' }),
			roundFixture('fixture-2', { status: 'cancelled' }),
		]
		const plan = deriveSettlement(base)
		expect(plan.counters.picksVoided).toBe(1)
		expect(plan.voidRound).toBe(false)
		expect(plan.completion).toBeNull()
	})

	it('auto-eliminates a World Cup player with no reachable team left (#113)', () => {
		const base = facts(CLASSIC, {
			competitionType: 'group_knockout',
			players: [player('gp-1'), player('gp-2')],
		})
		// Round 4 is a knockout tie: the side that lost it is out of the tournament.
		base.round = { id: ROUND, number: 4 }
		base.gamePicks = [
			{
				id: 'pick-1',
				gamePlayerId: 'gp-1',
				teamId: HOME,
				confidenceRank: null,
				result: 'pending',
				goalsScored: null,
				fixture: null,
			},
		]
		// The one remaining round pairs the team gp-1 has already used with the one
		// just knocked out, so gp-1 has nothing left to pick.
		base.competitionRounds = [
			{
				id: ROUND,
				number: 4,
				status: 'open',
				fixtures: [
					{
						id: FIXTURE,
						homeTeamId: HOME,
						awayTeamId: AWAY,
						homeScore: 2,
						awayScore: 1,
						status: 'finished',
						winner: null,
					},
				],
			},
			{
				id: 'round-5',
				number: 5,
				status: 'upcoming',
				fixtures: [
					{
						id: 'fixture-ko',
						homeTeamId: HOME,
						awayTeamId: AWAY,
						homeScore: null,
						awayScore: null,
						status: 'scheduled',
						winner: null,
					},
				],
			},
		]
		const plan = deriveSettlement(base)
		const autoElim = plan.playerWrites.find((w) => w.set.eliminatedReason === 'no_remaining_teams')
		expect(autoElim).toEqual({
			gamePlayerId: 'gp-1',
			set: {
				status: 'eliminated',
				eliminatedReason: 'no_remaining_teams',
				eliminatedRoundId: ROUND,
			},
			// No alive guard and not counted: nothing of theirs lost.
			requireAlive: false,
			countsAsElimination: false,
		})
	})
})

/* ────────────────────────────────────────────────────────────────────── */

describe('deriveSettlement — turbo', () => {
	const turboPick = (over: Partial<SettlementPick> = {}) =>
		pick('pick-1', { confidenceRank: 1, predictedResult: 'home_win', ...over })

	it('scores a correct call by the predicted side, and a wrong one at nothing', () => {
		const right = deriveSettlement(
			facts(TURBO, { fixturePicks: [turboPick()], roundPicks: [turboPick()] }),
		)
		expect(right.pickWrites[0].set).toEqual({ result: 'win', goalsScored: 2 })
		expect(right.counters.turboSettled).toBe(1)

		const wrong = deriveSettlement(
			facts(TURBO, {
				fixturePicks: [turboPick({ predictedResult: 'away_win' })],
				roundPicks: [turboPick({ predictedResult: 'away_win' })],
			}),
		)
		expect(wrong.pickWrites[0].set).toEqual({ result: 'loss', goalsScored: 0 })
	})

	it('counts both sides goals on a correct draw call', () => {
		const drawPick = turboPick({ predictedResult: 'draw' })
		const base = facts(TURBO, { fixturePicks: [drawPick], roundPicks: [drawPick] })
		base.fixture.homeScore = 1
		base.fixture.awayScore = 1
		base.roundFixtures = [roundFixture(FIXTURE, { homeScore: 1, awayScore: 1 })]
		expect(deriveSettlement(base).pickWrites[0].set).toEqual({ result: 'win', goalsScored: 2 })
	})

	it('crowns the longest streak once the gameweek is done', () => {
		const plan = deriveSettlement(
			facts(TURBO, { fixturePicks: [turboPick()], roundPicks: [turboPick()] }),
		)
		expect(plan.completion).toMatchObject({
			completed: true,
			reason: 'turbo-single-round',
			winnerPlayerIds: ['gp-1'],
		})
		expect(plan.completeRound).toBe(true)
		// Turbo is single-round: there is nowhere to advance to.
		expect(plan.advance).toBe(false)
	})

	it('refunds everyone on a total wipeout', () => {
		const wrong = turboPick({ predictedResult: 'away_win' })
		const plan = deriveSettlement(facts(TURBO, { fixturePicks: [wrong], roundPicks: [wrong] }))
		expect(plan.completion).toMatchObject({ reason: 'turbo-total-wipeout', refund: true })
	})

	it('refuses to crown while any pick of the round is still pending', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const other = pick('pick-2', {
			gamePlayerId: 'gp-2',
			fixtureId: 'fixture-2',
			confidenceRank: 2,
		})
		const plan = deriveSettlement(
			facts(TURBO, {
				fixturePicks: [turboPick()],
				roundPicks: [turboPick(), other],
				// Both fixtures are terminal, but pick-2 hasn't been settled yet.
				roundFixtures: [roundFixture(FIXTURE), roundFixture('fixture-2')],
				players: [player('gp-1'), player('gp-2')],
			}),
		)
		expect(plan.completion).toBeNull()
		expect(plan.completeRound).toBe(false)
		expect(warn).toHaveBeenCalled()
		warn.mockRestore()
	})

	it('waits for the last fixture of the gameweek before looking at all', () => {
		const plan = deriveSettlement(
			facts(TURBO, {
				fixturePicks: [turboPick()],
				roundPicks: [turboPick()],
				roundFixtures: [roundFixture(FIXTURE), roundFixture('fixture-2', { status: 'scheduled' })],
			}),
		)
		expect(plan.pickWrites).toHaveLength(1)
		expect(plan.completion).toBeNull()
	})
})

/* ────────────────────────────────────────────────────────────────────── */

describe('deriveSettlement — cup', () => {
	/** A cup game: two ranked picks on two fixtures, both played. */
	function cupFacts(over: Partial<SettlementFacts> = {}): SettlementFacts {
		const p1 = pick('pick-1', { confidenceRank: 1, teamId: HOME, fixtureId: FIXTURE })
		const p2 = pick('pick-2', { confidenceRank: 2, teamId: AWAY, fixtureId: 'fixture-2' })
		const fixtures = [cupFixture(FIXTURE), cupFixture('fixture-2')]
		return facts(CUP, {
			roundFixtures: fixtures,
			roundPicks: [p1, p2],
			fixturePicks: [p1],
			cupRound: { id: ROUND, fixtures, picks: [p1, p2] },
			gamePicks: [p1, p2].map((p) => ({
				id: p.id,
				gamePlayerId: p.gamePlayerId,
				teamId: p.teamId,
				confidenceRank: p.confidenceRank,
				result: p.result,
				goalsScored: p.goalsScored,
				fixture: { homeTeamId: HOME, homeScore: 2, awayScore: 1 },
			})),
			...over,
		})
	}

	it('re-evaluates the whole gameweek in rank order and reports that it changed', () => {
		const plan = deriveSettlement(cupFacts())
		expect(plan.pickWrites).toEqual([
			{ pickId: 'pick-1', set: { result: 'win', goalsScored: 2, lifeGained: 0, lifeSpent: false } },
			{
				pickId: 'pick-2',
				set: { result: 'loss', goalsScored: 0, lifeGained: 0, lifeSpent: false },
			},
		])
		expect(plan.counters.cupReevaluated).toBe(true)
	})

	it('writes nothing when the rows already hold what the evaluator says', () => {
		const settled = [
			pick('pick-1', {
				confidenceRank: 1,
				teamId: HOME,
				result: 'win',
				goalsScored: 2,
			}),
			pick('pick-2', {
				confidenceRank: 2,
				teamId: AWAY,
				fixtureId: 'fixture-2',
				result: 'loss',
				goalsScored: 0,
			}),
		]
		const fixtures = [cupFixture(FIXTURE), cupFixture('fixture-2')]
		const plan = deriveSettlement(
			cupFacts({
				roundPicks: settled,
				fixturePicks: [settled[0]],
				cupRound: { id: ROUND, fixtures, picks: settled },
			}),
		)
		expect(plan.pickWrites).toEqual([])
		expect(plan.counters.cupReevaluated).toBe(false)
	})

	it('crowns the longest streak and closes the round, never advancing', () => {
		const plan = deriveSettlement(cupFacts())
		expect(plan.completion).toMatchObject({ completed: true, reason: 'cup-longest-streak' })
		expect(plan.gameCompleted).toBe(true)
		expect(plan.completeRound).toBe(true)
		expect(plan.advance).toBe(false)
	})

	it('stops the confirmed streak at the first pick whose fixture has no score', () => {
		const fixtures = [
			cupFixture(FIXTURE, { homeScore: null, awayScore: null, status: 'scheduled' }),
			cupFixture('fixture-2'),
		]
		const plan = deriveSettlement(
			cupFacts({
				roundFixtures: fixtures,
				cupRound: { id: ROUND, fixtures, picks: cupFacts().cupRound?.picks ?? [] },
			}),
		)
		// Rank 1 hasn't been played, so nothing behind it is confirmed either.
		expect(plan.pickWrites).toEqual([])
		// And the gameweek isn't over, so nobody is crowned.
		expect(plan.completion).toBeNull()
	})

	it('revives a player a previous settle wrongly marked eliminated', () => {
		const plan = deriveSettlement(
			cupFacts({
				players: [player('gp-1', { status: 'eliminated', eliminatedRoundId: ROUND })],
			}),
		)
		expect(plan.playerWrites).toEqual([
			{
				gamePlayerId: 'gp-1',
				set: { livesRemaining: 0, status: 'alive', eliminatedRoundId: null },
				requireAlive: false,
				countsAsElimination: false,
			},
		])
	})

	it('leaves an admin-removed player removed', () => {
		const plan = deriveSettlement(
			cupFacts({
				players: [
					player('gp-1', {
						status: 'eliminated',
						eliminatedReason: 'admin_removed',
						eliminatedRoundId: ROUND,
					}),
				],
			}),
		)
		expect(plan.playerWrites).toEqual([])
	})

	it('settles nothing for a cup game that is over', () => {
		const base = cupFacts()
		base.game.status = 'completed'
		const plan = deriveSettlement(base)
		expect(plan.pickWrites).toEqual([])
		expect(plan.completion).toBeNull()
	})
})
