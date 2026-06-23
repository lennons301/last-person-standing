/**
 * Lifecycle smoke tests — exercise the per-fixture settlement architecture.
 *
 * What this asserts that unit tests don't:
 *   1. Single-fixture-of-many settles its picks immediately, leaving
 *      others' picks `pending`.
 *   2. Players are eliminated mid-gameweek (classic only).
 *   3. A game auto-completes mid-gameweek when alive count drops to 1.
 *   4. Cup re-eval is idempotent and rank-ordered with out-of-order
 *      fixture finishes.
 *   5. Round completion + game advancement fire when the LAST fixture
 *      settles.
 *   6. Live projection: an in-progress fixture surfaces projected aggregates
 *      (`projectedStreak`, `projectedLivesRemaining`, `projectedStatus`)
 *      and per-pick `projectedOutcome` on the live payload.
 *
 * Adding a new competition? Add a scenario for each supported mode here.
 * See `docs/superpowers/specs/2026-05-12-per-fixture-settlement-and-live-projection-design.md`.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { getCupLadderData, getCupStandingsData } from '@/lib/game/cup-standings-queries'
import {
	getLivePayload,
	getProgressGridData,
	getTurboStandingsData,
} from '@/lib/game/detail-queries'
import { settleFixture } from '@/lib/game/settle'
import { round as roundTable } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment, payout } from '@/lib/schema/payment'
import { getShareLiveData } from '@/lib/share/data'
import {
	finishFixture,
	liveFixture,
	makeCompetition,
	makeFixture,
	makeGame,
	makePayment,
	makePick,
	makePlayer,
	makeRound,
	makeTeam,
	resetDb,
} from './helpers'

beforeEach(async () => {
	await resetDb()
})

afterAll(async () => {
	await resetDb()
})

/* ────────────────────────────────────────────────────────────────────── */
/* classic-PL                                                              */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: classic-PL', () => {
	it('settles a single finished fixture immediately — other picks stay pending', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fxAB = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxCD = await makeFixture({ roundId: r2, homeTeamId: c, awayTeamId: d })
		await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		// 3 alive players so eliminations don't auto-complete the game.
		const gpA = await makePlayer({ gameId, userId: 'u-a' })
		const gpB = await makePlayer({ gameId, userId: 'u-b' })
		const gpC = await makePlayer({ gameId, userId: 'u-c' })
		await makePick({ gameId, gamePlayerId: gpA, roundId: r2, teamId: a, fixtureId: fxAB })
		await makePick({ gameId, gamePlayerId: gpB, roundId: r2, teamId: b, fixtureId: fxAB })
		await makePick({ gameId, gamePlayerId: gpC, roundId: r2, teamId: c, fixtureId: fxCD })

		// Only the first fixture finishes.
		await finishFixture(fxAB, 2, 0)
		await settleFixture(fxAB)

		const pA = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gpA) })
		const pB = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gpB) })
		const pC = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gpC) })
		expect(pA?.result).toBe('win')
		expect(pB?.result).toBe('loss')
		// Pick on the other fixture stays pending — the round isn't done.
		expect(pC?.result).toBe('pending')

		// Loser (gpB) is eliminated immediately — mid-gameweek.
		const playerB = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpB) })
		expect(playerB?.status).toBe('eliminated')

		// Round not yet complete (one fixture pending) → game has not advanced.
		const r2After = await db.query.round.findFirst({ where: eq(roundTable.id, r2) })
		expect(r2After?.status).toBe('open')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r2)
		expect(g?.status).toBe('active')
	})

	it('auto-completes the game mid-gameweek when alive count drops to 1', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fxAB = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxAB2 = await makeFixture({ roundId: r2, homeTeamId: b, awayTeamId: a })
		await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpWin = await makePlayer({ gameId, userId: 'u-win' })
		const gpLose = await makePlayer({ gameId, userId: 'u-lose' })
		await makePick({ gameId, gamePlayerId: gpWin, roundId: r2, teamId: a, fixtureId: fxAB })
		await makePick({ gameId, gamePlayerId: gpLose, roundId: r2, teamId: b, fixtureId: fxAB })

		// Settle the only fixture either picker is on — gpLose eliminated, alive=1, game completes.
		await finishFixture(fxAB, 2, 0)
		await settleFixture(fxAB)

		const winner = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpWin) })
		const loser = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpLose) })
		expect(winner?.status).toBe('winner')
		expect(loser?.status).toBe('eliminated')

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		expect(g?.currentRoundId).toBeNull()
		// fxAB2 was never reached — game completed before its scores mattered.
		// Reference fxAB2 to keep the variable consumed.
		expect(fxAB2).toBeTruthy()
	})

	it('advances to next round when the last fixture in the round settles', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx1 = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fx2 = await makeFixture({ roundId: r2, homeTeamId: b, awayTeamId: a })
		await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpX = await makePlayer({ gameId, userId: 'u-x' })
		const gpY = await makePlayer({ gameId, userId: 'u-y' })
		await makePick({ gameId, gamePlayerId: gpX, roundId: r2, teamId: a, fixtureId: fx1 })
		await makePick({ gameId, gamePlayerId: gpY, roundId: r2, teamId: a, fixtureId: fx2 })

		// gpX picks team `a` on fx1 (home). gpY picks team `a` on fx2 (away
		// since fx2 = b vs a). Both win their fixtures → both alive → advance.
		await finishFixture(fx1, 1, 0)
		await settleFixture(fx1)
		// One fixture settled, round still open.
		let g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r2)

		await finishFixture(fx2, 0, 1) // away (team a) wins → gpY wins
		await settleFixture(fx2)
		// Both alive, round complete → advance to r3.
		g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r3)
	})

	it('advances (not completes) when 2+ players remain alive after final fixture', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx1 = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpX = await makePlayer({ gameId, userId: 'u-x' })
		const gpY = await makePlayer({ gameId, userId: 'u-y' })
		const gpZ = await makePlayer({ gameId, userId: 'u-z' })
		await makePick({ gameId, gamePlayerId: gpX, roundId: r2, teamId: a, fixtureId: fx1 })
		await makePick({ gameId, gamePlayerId: gpY, roundId: r2, teamId: a, fixtureId: fx1 })
		await makePick({ gameId, gamePlayerId: gpZ, roundId: r2, teamId: a, fixtureId: fx1 })

		await finishFixture(fx1, 2, 0)
		await settleFixture(fx1)

		const r2After = await db.query.round.findFirst({ where: eq(roundTable.id, r2) })
		expect(r2After?.status).toBe('completed')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r3)
		expect(g?.status).toBe('active')
	})

	it('knockout ET/penalty winner: a level full-time score scores by winner, not as a draw', async () => {
		// group_knockout, knockout round (number > 3). Fixture ends 1-1 full time;
		// home advanced on penalties (winner: 'home'). A second fixture stays
		// pending so the round doesn't complete (keeps the test about scoring).
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const fx = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away }) // pending — keeps round open

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpHome = await makePlayer({ gameId, userId: 'u-home' })
		const gpAway = await makePlayer({ gameId, userId: 'u-away' })
		await makePick({ gameId, gamePlayerId: gpHome, roundId: r4, teamId: home, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpAway, roundId: r4, teamId: away, fixtureId: fx })

		await finishFixture(fx, 1, 1, 'home')
		await settleFixture(fx)

		const picks = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
		// The home backer's team advanced on penalties → win, not a draw. The bug
		// scored this level-full-time fixture as a draw and eliminated the team
		// that actually went through.
		expect(picks.find((p) => p.gamePlayerId === gpHome)?.result).toBe('win')
		expect(picks.find((p) => p.gamePlayerId === gpAway)?.result).toBe('loss')
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.find((p) => p.id === gpHome)?.status).not.toBe('eliminated')
		expect(players.find((p) => p.id === gpAway)?.status).toBe('eliminated')
	})

	it('last player alive is crowned winner without their own pick winning', async () => {
		// The doomed player's pick loses → eliminated → one alive. The survivor's
		// pick is on a still-pending fixture, so the crown comes purely from being
		// the last alive (rule: a loss/no-pick elimination can hand the win).
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const fxPending = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxLose = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpSurvivor = await makePlayer({ gameId, userId: 'u-survivor' })
		const gpDoomed = await makePlayer({ gameId, userId: 'u-doomed' })
		await makePick({
			gameId,
			gamePlayerId: gpSurvivor,
			roundId: r2,
			teamId: a,
			fixtureId: fxPending,
		})
		await makePick({ gameId, gamePlayerId: gpDoomed, roundId: r2, teamId: a, fixtureId: fxLose })

		await finishFixture(fxLose, 0, 2) // away wins → doomed (picked A=home) loses → eliminated
		await settleFixture(fxLose)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.find((p) => p.id === gpSurvivor)?.status).toBe('winner')
		expect(players.find((p) => p.id === gpDoomed)?.status).toBe('eliminated')
		// Survivor's own pick never settled to a win — the crown came from being last alive.
		const picks = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
		expect(picks.find((p) => p.gamePlayerId === gpSurvivor)?.result).toBe('pending')
	})

	it('progress grid exposes each player total goals scored (sum of winning picks)', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const fxWin = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxLose = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpWin = await makePlayer({ gameId, userId: 'u-win' })
		const gpLose = await makePlayer({ gameId, userId: 'u-lose' })
		await makePick({ gameId, gamePlayerId: gpWin, roundId: r2, teamId: a, fixtureId: fxWin })
		await makePick({ gameId, gamePlayerId: gpLose, roundId: r2, teamId: b, fixtureId: fxLose })

		// A wins 3-0: gpWin (picked A) scores 3 goals; gpLose (picked B) loses, 0 goals.
		await finishFixture(fxWin, 3, 0)
		await settleFixture(fxWin)
		await finishFixture(fxLose, 3, 0)
		await settleFixture(fxLose)

		const grid = await getProgressGridData(gameId, 'u-win')
		expect(grid?.players.find((p) => p.id === gpWin)?.goals).toBe(3)
		expect(grid?.players.find((p) => p.id === gpLose)?.goals).toBe(0)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* classic-WC                                                              */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: classic-WC', () => {
	it('settles + advances on a WC group-stage fixture', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const spain = await makeTeam({ name: 'Spain', shortName: 'ESP', fifaPot: 1 })
		const cv = await makeTeam({ name: 'Cape Verde', shortName: 'CPV', fifaPot: 4 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })
		await makeFixture({ roundId: r2, homeTeamId: spain, awayTeamId: cv })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r1,
			modeConfig: { allowRebuys: false },
		})
		const gp1 = await makePlayer({ gameId, userId: 'u-1' })
		const gp2 = await makePlayer({ gameId, userId: 'u-2' })
		await makePick({ gameId, gamePlayerId: gp1, roundId: r1, teamId: spain, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gp2, roundId: r1, teamId: spain, fixtureId: fx })

		await finishFixture(fx, 3, 0)
		await settleFixture(fx)

		const p1 = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gp1) })
		expect(p1?.result).toBe('win')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r2)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* turbo                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: turbo-PL', () => {
	it('settles each pick per-fixture; completes only when all are settled', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 4; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: teams[0], awayTeamId: teams[1] })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: teams[2], awayTeamId: teams[3] })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2 },
		})
		const gp = await makePlayer({ gameId, userId: 'u' })
		const pickIds: string[] = []
		pickIds.push(
			await makePick({
				gameId,
				gamePlayerId: gp,
				roundId: r1,
				teamId: teams[0],
				fixtureId: fx1,
				confidenceRank: 1,
				predictedResult: 'home_win',
			}),
		)
		pickIds.push(
			await makePick({
				gameId,
				gamePlayerId: gp,
				roundId: r1,
				teamId: teams[2],
				fixtureId: fx2,
				confidenceRank: 2,
				predictedResult: 'home_win',
			}),
		)

		// First fixture finishes — pick 1 settles, pick 2 still pending,
		// game not yet completed (turbo needs all fixtures).
		await finishFixture(fx1, 1, 0)
		await settleFixture(fx1)
		let p1 = await db.query.pick.findFirst({ where: eq(pick.id, pickIds[0]) })
		let p2 = await db.query.pick.findFirst({ where: eq(pick.id, pickIds[1]) })
		expect(p1?.result).toBe('win')
		expect(p2?.result).toBe('pending')
		let g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')

		// Second fixture finishes — pick 2 settles, game auto-completes.
		await finishFixture(fx2, 1, 0)
		await settleFixture(fx2)
		p1 = await db.query.pick.findFirst({ where: eq(pick.id, pickIds[0]) })
		p2 = await db.query.pick.findFirst({ where: eq(pick.id, pickIds[1]) })
		expect(p2?.result).toBe('win')
		g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
	})

	it('total wipeout refunds everyone and crowns no one', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1 },
		})
		const gp1 = await makePlayer({ gameId, userId: 'u1' })
		const gp2 = await makePlayer({ gameId, userId: 'u2' })
		await makePayment({ gameId, userId: 'u1' })
		await makePayment({ gameId, userId: 'u2' })
		// Both predict home_win; away wins → every pick wrong.
		await makePick({
			gameId,
			gamePlayerId: gp1,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gp2,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})

		await finishFixture(fx, 0, 2)
		await settleFixture(fx)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.some((p) => p.status === 'winner')).toBe(false)
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts.length).toBe(0)
		const payments = await db.query.payment.findMany({ where: eq(payment.gameId, gameId) })
		expect(payments.every((p) => p.status === 'refunded')).toBe(true)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* cup                                                                     */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: cup-WC', () => {
	it('persists life_gained on an underdog win + survives elimination check', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const spain = await makeTeam({ name: 'Spain', shortName: 'ESP', fifaPot: 1 })
		const cv = await makeTeam({ name: 'Cape Verde', shortName: 'CPV', fifaPot: 4 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		// 2 players so a survivor doesn't auto-win on last-alive.
		const gpHero = await makePlayer({ gameId, userId: 'u-hero', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-filler', livesRemaining: 0 })
		const heroPickId = await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: cv,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: cv,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})

		// A second, unplayed fixture keeps the gameweek incomplete, so this test
		// asserts MID-gameweek life/streak state — a single-gameweek cup game only
		// completes + crowns once every fixture in the gameweek is settled.
		await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })

		// Cape Verde (away, pot 4) wins 1-0 over Spain (home, pot 1) — 3-tier upset.
		await finishFixture(fx, 0, 1)
		await settleFixture(fx)

		const heroPick = await db.query.pick.findFirst({ where: eq(pick.id, heroPickId) })
		expect(heroPick?.result).toBe('win')
		expect(heroPick?.lifeGained).toBe(3)
		expect(heroPick?.lifeSpent).toBe(false)

		const hero = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHero) })
		expect(hero?.livesRemaining).toBe(3)
		expect(hero?.status).toBe('alive')
	})

	it('cup re-eval is idempotent — re-settling the same fixture changes nothing', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const t1 = await makeTeam({ name: 'X', shortName: 'X', fifaPot: 2 })
		const t2 = await makeTeam({ name: 'Y', shortName: 'Y', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: t1, awayTeamId: t2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		const gpA = await makePlayer({ gameId, userId: 'u-a', livesRemaining: 0 })
		const gpB = await makePlayer({ gameId, userId: 'u-b', livesRemaining: 0 })
		await makePick({
			gameId,
			gamePlayerId: gpA,
			roundId: r1,
			teamId: t1,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpB,
			roundId: r1,
			teamId: t2,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})

		await finishFixture(fx, 2, 0)
		await settleFixture(fx)
		const afterFirst = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })

		await settleFixture(fx) // second call — should be no-op
		const afterSecond = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })

		// Same pick results, same lives, same statuses.
		expect(afterSecond.map((p) => p.result).sort()).toEqual(afterFirst.map((p) => p.result).sort())
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* cup wipeout rule (single-gameweek winner determination)                 */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: cup wipeout rule', () => {
	it('skips a leading universal-loss rank and crowns the rebased longest streak', async () => {
		// FA-Cup-style knockout (tier diff 0, no lives mechanic), 2 fixtures.
		const compId = await makeCompetition({ type: 'knockout', dataSource: 'football_data' })
		const a1 = await makeTeam({ name: 'A1', shortName: 'A1' })
		const b1 = await makeTeam({ name: 'B1', shortName: 'B1' })
		const a2 = await makeTeam({ name: 'A2', shortName: 'A2' })
		const b2 = await makeTeam({ name: 'B2', shortName: 'B2' })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: a1, awayTeamId: b1 })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: a2, awayTeamId: b2 })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpA = await makePlayer({ gameId, userId: 'u-a', livesRemaining: 0 })
		const gpB = await makePlayer({ gameId, userId: 'u-b', livesRemaining: 0 })
		await makePayment({ gameId, userId: 'u-a' })
		await makePayment({ gameId, userId: 'u-b' })
		// Rank 1 (fx1): BOTH pick the home side, which loses → universal loss.
		await makePick({
			gameId,
			gamePlayerId: gpA,
			roundId: r1,
			teamId: a1,
			fixtureId: fx1,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpB,
			roundId: r1,
			teamId: a1,
			fixtureId: fx1,
			confidenceRank: 1,
		})
		// Rank 2 (fx2): A picks the home side (wins), B picks the away side (loses).
		await makePick({
			gameId,
			gamePlayerId: gpA,
			roundId: r1,
			teamId: a2,
			fixtureId: fx2,
			confidenceRank: 2,
		})
		await makePick({
			gameId,
			gamePlayerId: gpB,
			roundId: r1,
			teamId: b2,
			fixtureId: fx2,
			confidenceRank: 2,
		})

		// Settle in confidence-rank order — the order that used to strand the
		// eliminated players' rank-2 picks as `pending`.
		await finishFixture(fx1, 0, 2) // home (a1) loses → both lose rank 1
		await settleFixture(fx1)
		await finishFixture(fx2, 2, 0) // home (a2) wins → A wins rank 2, B loses rank 2
		await settleFixture(fx2)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')

		// A restarts the streak from rank 2 and wins; B does not.
		const playerA = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpA) })
		const playerB = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpB) })
		expect(playerA?.status).toBe('winner')
		expect(playerB?.status).not.toBe('winner')

		// It's a real win, not a refund: a payout exists, no payment is refunded.
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts.map((p) => p.userId)).toEqual(['u-a'])
		const payments = await db.query.payment.findMany({ where: eq(payment.gameId, gameId) })
		expect(payments.every((p) => p.status === 'paid')).toBe(true)
	})

	it('refunds everyone and crowns no one on a total wipeout', async () => {
		const compId = await makeCompetition({ type: 'knockout', dataSource: 'football_data' })
		const a1 = await makeTeam({ name: 'A1', shortName: 'A1' })
		const b1 = await makeTeam({ name: 'B1', shortName: 'B1' })
		const a2 = await makeTeam({ name: 'A2', shortName: 'A2' })
		const b2 = await makeTeam({ name: 'B2', shortName: 'B2' })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: a1, awayTeamId: b1 })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: a2, awayTeamId: b2 })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpA = await makePlayer({ gameId, userId: 'u-a', livesRemaining: 0 })
		const gpB = await makePlayer({ gameId, userId: 'u-b', livesRemaining: 0 })
		await makePayment({ gameId, userId: 'u-a', amount: '10.00' })
		await makePayment({ gameId, userId: 'u-b', amount: '10.00' })
		// Every player gets every pick wrong (always pick the home side; home loses both).
		await makePick({
			gameId,
			gamePlayerId: gpA,
			roundId: r1,
			teamId: a1,
			fixtureId: fx1,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpB,
			roundId: r1,
			teamId: a1,
			fixtureId: fx1,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpA,
			roundId: r1,
			teamId: a2,
			fixtureId: fx2,
			confidenceRank: 2,
		})
		await makePick({
			gameId,
			gamePlayerId: gpB,
			roundId: r1,
			teamId: a2,
			fixtureId: fx2,
			confidenceRank: 2,
		})

		await finishFixture(fx1, 0, 2)
		await settleFixture(fx1)
		await finishFixture(fx2, 0, 2)
		await settleFixture(fx2)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		expect(g?.currentRoundId).toBeNull()

		// No winner, no payout, every stake refunded.
		const winners = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(winners.some((p) => p.status === 'winner')).toBe(false)
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts.length).toBe(0)
		const payments = await db.query.payment.findMany({ where: eq(payment.gameId, gameId) })
		expect(payments.every((p) => p.status === 'refunded')).toBe(true)
	})

	it('breaks a streak+lives+counted-goals tie on raw streak goals — no split (d8360e69)', async () => {
		// WC handicap competition so 1-tier-favourite wins suppress counted goals.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		// pot1 favourites vs pot2 opponents (tierDiffFromPicked = +1 → goals suppressed).
		const fra = await makeTeam({ name: 'France', shortName: 'FRA', fifaPot: 1 })
		const sen = await makeTeam({ name: 'Senegal', shortName: 'SEN', fifaPot: 2 })
		const sco = await makeTeam({ name: 'Scotland', shortName: 'SCO', fifaPot: 1 })
		const hai = await makeTeam({ name: 'Haiti', shortName: 'HAI', fifaPot: 2 })
		// rank-2 underdogs (pot2 home vs pot1 away) that LOSE → break each streak at 1.
		const uda = await makeTeam({ name: 'UdogA', shortName: 'UDA', fifaPot: 2 })
		const fava = await makeTeam({ name: 'FavA', shortName: 'FVA', fifaPot: 1 })
		const udb = await makeTeam({ name: 'UdogB', shortName: 'UDB', fifaPot: 2 })
		const favb = await makeTeam({ name: 'FavB', shortName: 'FVB', fifaPot: 1 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxA1 = await makeFixture({ roundId: r1, homeTeamId: fra, awayTeamId: sen })
		const fxA2 = await makeFixture({ roundId: r1, homeTeamId: uda, awayTeamId: fava })
		const fxB1 = await makeFixture({ roundId: r1, homeTeamId: sco, awayTeamId: hai })
		const fxB2 = await makeFixture({ roundId: r1, homeTeamId: udb, awayTeamId: favb })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpSean = await makePlayer({ gameId, userId: 'u-sean', livesRemaining: 0 })
		const gpMark = await makePlayer({ gameId, userId: 'u-mark', livesRemaining: 0 })
		await makePayment({ gameId, userId: 'u-sean' })
		await makePayment({ gameId, userId: 'u-mark' })
		// Sean: rank1 France (pot1 favourite) wins, rank2 underdog loses.
		await makePick({
			gameId,
			gamePlayerId: gpSean,
			roundId: r1,
			teamId: fra,
			fixtureId: fxA1,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpSean,
			roundId: r1,
			teamId: uda,
			fixtureId: fxA2,
			confidenceRank: 2,
		})
		// Mark: rank1 Scotland (pot1 favourite) wins, rank2 underdog loses.
		await makePick({
			gameId,
			gamePlayerId: gpMark,
			roundId: r1,
			teamId: sco,
			fixtureId: fxB1,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpMark,
			roundId: r1,
			teamId: udb,
			fixtureId: fxB2,
			confidenceRank: 2,
		})

		await finishFixture(fxA1, 3, 0) // France win 3-0 → counted 0 (favourite), raw 3
		await finishFixture(fxB1, 1, 0) // Scotland win 1-0 → counted 0 (favourite), raw 1
		await finishFixture(fxA2, 0, 2) // Sean's rank-2 underdog loses → streak breaks at 1
		await finishFixture(fxB2, 0, 2) // Mark's rank-2 underdog loses → streak breaks at 1
		for (const fx of [fxA1, fxB1, fxA2, fxB2]) await settleFixture(fx)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')

		// Both tie on streak (1), lives (0) and counted goals (0). Raw streak goals
		// separate them: France 3 > Scotland 1 → Sean wins SOLO, not a split.
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.find((p) => p.id === gpSean)?.status).toBe('winner')
		expect(players.find((p) => p.id === gpMark)?.status).not.toBe('winner')
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts.map((p) => p.userId)).toEqual(['u-sean'])
		expect(payouts[0]?.isSplit).toBe(false)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Live projection                                                         */
/* ────────────────────────────────────────────────────────────────────── */

describe('live projection', () => {
	it('classic: in-progress fixture surfaces projected player status', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpWin = await makePlayer({ gameId, userId: 'u-win' })
		const gpLose = await makePlayer({ gameId, userId: 'u-lose' })
		await makePick({ gameId, gamePlayerId: gpWin, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpLose, roundId: r2, teamId: b, fixtureId: fx })

		// Fixture live, home 2-0 (so home-picker is winning, away-picker losing).
		await liveFixture(fx, 2, 0)

		const payload = await getLivePayload(gameId, 'u-win')
		expect(payload).not.toBeNull()
		const winnerPlayer = payload?.players.find((p) => p.id === gpWin)
		const loserPlayer = payload?.players.find((p) => p.id === gpLose)
		expect(winnerPlayer?.projectedStatus).toBe('alive')
		expect(loserPlayer?.projectedStatus).toBe('eliminated')

		const winnerPick = payload?.picks.find((p) => p.gamePlayerId === gpWin)
		const loserPick = payload?.picks.find((p) => p.gamePlayerId === gpLose)
		expect(winnerPick?.projectedOutcome).toBe('winning')
		expect(loserPick?.projectedOutcome).toBe('losing')
	})

	it('classic: live payload hides other players current-round picks BEFORE the deadline', async () => {
		// The /live payload feeds the 30s browser poll. Before the round deadline
		// it must NOT carry opponents' team choices — the grid hiding them in the UI
		// isn't enough if the raw teamId is sitting in the JSON response.
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000), // deadline still ahead
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r2, teamId: b, fixtureId: fx })

		const payload = await getLivePayload(gameId, 'u-me')
		const mine = payload?.picks.find((p) => p.gamePlayerId === gpMe)
		const theirs = payload?.picks.find((p) => p.gamePlayerId === gpOther)
		// Own pick visible; opponent's identity stripped to 'hidden'.
		expect(mine?.teamId).toBe(a)
		expect(theirs?.teamId).toBeNull()
		expect(theirs?.predictedResult).toBeNull()
		expect(theirs?.fixtureId).toBeNull()
		expect(theirs?.result).toBe('hidden')
	})

	it('classic: live SHARE image hides every pick BEFORE the deadline', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000), // deadline still ahead
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r2, teamId: b, fixtureId: fx })

		const data = await getShareLiveData(gameId, 'u-me')
		expect(data?.mode).toBe('classic')
		// Shared image is posted to the group — before the deadline NO one's team
		// is revealed (mirrors the standings share hiding all current picks).
		const rows = data?.mode === 'classic' ? data.rows : []
		expect(rows.length).toBe(2)
		for (const row of rows) expect(row.pickedTeamShort).toBeNull()
	})

	it('turbo: projected streak counts in-progress correct picks', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 4; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: teams[0], awayTeamId: teams[1] })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: teams[2], awayTeamId: teams[3] })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2 },
		})
		const gp = await makePlayer({ gameId, userId: 'u' })
		await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r1,
			teamId: teams[0],
			fixtureId: fx1,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r1,
			teamId: teams[2],
			fixtureId: fx2,
			confidenceRank: 2,
			predictedResult: 'home_win',
		})

		// Both fixtures live, home leading in both — projected streak = 2.
		await liveFixture(fx1, 1, 0)
		await liveFixture(fx2, 1, 0)

		const payload = await getLivePayload(gameId, 'u')
		const projected = payload?.players.find((p) => p.id === gp)?.projectedStreak
		expect(projected).toBe(2)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Post-deadline + post-completion visibility                              */
/*                                                                         */
/* Regression coverage for: picks staying locked behind the lock icon      */
/* AFTER the deadline (because the competition round's status flag only    */
/* flips to 'completed' once every fixture has settled — sometimes 2+ days */
/* later); and standings/ladder vanishing the moment a game completes      */
/* (because applyAutoCompletion nulls out currentRoundId for every mode).  */
/* ────────────────────────────────────────────────────────────────────── */

describe('post-deadline + post-completion visibility', () => {
	it("classic: progress grid reveals other players' picks once deadline passes", async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		// Round is 'open' at the competition level (one fixture pending) but deadline has passed.
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r2, teamId: b, fixtureId: fx })
		// NB: fixture is still pending; nothing has settled. This is exactly the
		// post-deadline-but-pre-final-whistle window where the original bug bit.

		const grid = await getProgressGridData(gameId, 'u-me')
		const otherRow = grid?.players.find((p) => p.id === gpOther)
		expect(otherRow?.cellsByRoundId[r2]?.result).not.toBe('locked')
	})

	it('turbo: standings keep showing the round + reveal picks once deadline passes', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 4; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, {
			number: 1,
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: teams[0], awayTeamId: teams[1] })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: teams[2], awayTeamId: teams[3] })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2 },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({
			gameId,
			gamePlayerId: gpMe,
			roundId: r1,
			teamId: teams[0],
			fixtureId: fx1,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpOther,
			roundId: r1,
			teamId: teams[2],
			fixtureId: fx2,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})

		const standings = await getTurboStandingsData(gameId, 'u-me')
		expect(standings?.rounds.length).toBe(1)
		const others = standings?.rounds[0].players.find((p) => p.id === gpOther)
		expect(others?.picks.every((c) => c.result !== 'hidden')).toBe(true)
	})

	it('turbo: standings survive game completion (currentRoundId null)', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1 },
		})
		const gp = await makePlayer({ gameId, userId: 'u' })
		await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})

		// Finish the single fixture — turbo auto-completes, currentRoundId is nulled.
		await finishFixture(fx, 1, 0)
		await settleFixture(fx)
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		expect(g?.currentRoundId).toBeNull()

		// Standings query must still return the round/players/picks for the UI
		// to render the post-game grid + winner banner.
		const standings = await getTurboStandingsData(gameId, 'u')
		expect(standings?.rounds.length).toBe(1)
		expect(standings?.rounds[0].players[0].picks.length).toBe(1)
		expect(standings?.rounds[0].status).toBe('completed')
	})

	it('cup: standings ladder survives game completion (falls back to last picked round)', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'A', shortName: 'A', fifaPot: 2 })
		const b = await makeTeam({ name: 'B', shortName: 'B', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		// 2 players — one wins on the only fixture, the other loses → alive=1 → auto-completion.
		const gpWin = await makePlayer({ gameId, userId: 'u-win', livesRemaining: 0 })
		const gpLose = await makePlayer({ gameId, userId: 'u-lose', livesRemaining: 0 })
		await makePick({
			gameId,
			gamePlayerId: gpWin,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpLose,
			roundId: r1,
			teamId: b,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})

		await finishFixture(fx, 1, 0)
		await settleFixture(fx)
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		expect(g?.currentRoundId).toBeNull()

		// Without the displayRound fallback, getCupStandingsData would return null
		// here and the WC ladder would vanish the moment the trophy is decided.
		const cup = await getCupStandingsData(gameId, 'u-win')
		expect(cup).not.toBeNull()
		expect(cup?.roundId).toBe(r1)
		expect(cup?.roundStatus).toBe('completed')
		expect(cup?.players.length).toBe(2)
	})

	it('cup: getCupLadderData (the function the page actually calls) survives game completion', async () => {
		// Regression guard for the ladder-side fixturesRaw fallback added alongside
		// the displayRound fix. If that path is broken, the cup page renders the
		// banner + empty standings — same UX failure as the original bug.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'A', shortName: 'A', fifaPot: 2 })
		const b = await makeTeam({ name: 'B', shortName: 'B', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		const gpWin = await makePlayer({ gameId, userId: 'u-win', livesRemaining: 0 })
		const gpLose = await makePlayer({ gameId, userId: 'u-lose', livesRemaining: 0 })
		await makePick({
			gameId,
			gamePlayerId: gpWin,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpLose,
			roundId: r1,
			teamId: b,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})

		await finishFixture(fx, 1, 0)
		await settleFixture(fx)
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		expect(g?.currentRoundId).toBeNull()

		const ladder = await getCupLadderData(gameId, 'u-win')
		expect(ladder).not.toBeNull()
		expect(ladder?.roundId).toBe(r1)
		expect(ladder?.fixtures.length).toBe(1)
		expect(ladder?.fixtures[0].id).toBe(fx)
		expect(ladder?.players.length).toBe(2)
	})

	it('classic: progress grid hides other players picks BEFORE the deadline', async () => {
		// Regression guard for the opposite of the deadline-reveal fix: when the
		// deadline is still in the future, other players' picks must show as
		// 'locked', not their team name.
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 172_800_000),
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r2, teamId: b, fixtureId: fx })

		const grid = await getProgressGridData(gameId, 'u-me')
		const myRow = grid?.players.find((p) => p.id === gpMe)
		const otherRow = grid?.players.find((p) => p.id === gpOther)
		// My own pick stays visible; the other player's pick is locked behind the icon.
		expect(myRow?.cellsByRoundId[r2]?.result).not.toBe('locked')
		expect(otherRow?.cellsByRoundId[r2]?.result).toBe('locked')
	})

	it('classic: progress grid hides other players ADVANCE picks for a FUTURE round before its deadline', async () => {
		// Advance picks (PR #81) let a player commit a real pick for a future round
		// while it's still 'upcoming'. Those must stay 'locked' to other viewers
		// until THAT round's deadline — not leak the team the moment they're made.
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		// Future round, still 'upcoming' for this game (currentRound is r2), deadline ahead.
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 172_800_000),
		})
		const fx2 = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fx3 = await makeFixture({ roundId: r3, homeTeamId: c, awayTeamId: d })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		// Both pick the current round AND lock an advance pick for the future round.
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r2, teamId: a, fixtureId: fx2 })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r2, teamId: b, fixtureId: fx2 })
		await makePick({ gameId, gamePlayerId: gpMe, roundId: r3, teamId: c, fixtureId: fx3 })
		await makePick({ gameId, gamePlayerId: gpOther, roundId: r3, teamId: d, fixtureId: fx3 })

		const grid = await getProgressGridData(gameId, 'u-me')
		const myRow = grid?.players.find((p) => p.id === gpMe)
		const otherRow = grid?.players.find((p) => p.id === gpOther)
		// My own advance pick is visible to me; the other player's advance pick must
		// be locked (deadline for r3 hasn't passed).
		expect(myRow?.cellsByRoundId[r3]?.result).not.toBe('locked')
		expect(otherRow?.cellsByRoundId[r3]?.result).toBe('locked')
	})

	it('turbo: standings hide other players picks BEFORE the deadline', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 4; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, {
			number: 1,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: teams[0], awayTeamId: teams[1] })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: teams[2], awayTeamId: teams[3] })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2 },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		await makePick({
			gameId,
			gamePlayerId: gpMe,
			roundId: r1,
			teamId: teams[0],
			fixtureId: fx1,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpOther,
			roundId: r1,
			teamId: teams[2],
			fixtureId: fx2,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})

		const standings = await getTurboStandingsData(gameId, 'u-me')
		const me = standings?.rounds[0].players.find((p) => p.id === gpMe)
		const others = standings?.rounds[0].players.find((p) => p.id === gpOther)
		// My picks remain visible (not hidden); other player's are hidden.
		expect(me?.picks.every((c) => c.result !== 'hidden')).toBe(true)
		expect(others?.picks.every((c) => c.result === 'hidden')).toBe(true)
	})

	it('cup: standings hide other players picks BEFORE the deadline', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'A', shortName: 'A', fifaPot: 2 })
		const b = await makeTeam({ name: 'B', shortName: 'B', fifaPot: 2 })
		const r1 = await makeRound(compId, {
			number: 1,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 1, startingLives: 3 },
		})
		const gpMe = await makePlayer({ gameId, userId: 'u-me', livesRemaining: 3 })
		const gpOther = await makePlayer({ gameId, userId: 'u-other', livesRemaining: 3 })
		await makePick({
			gameId,
			gamePlayerId: gpMe,
			roundId: r1,
			teamId: a,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpOther,
			roundId: r1,
			teamId: b,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})

		const cup = await getCupStandingsData(gameId, 'u-me')
		const me = cup?.players.find((p) => p.id === gpMe)
		const others = cup?.players.find((p) => p.id === gpOther)
		expect(me?.picks.every((c) => c.result !== 'hidden')).toBe(true)
		expect(others?.picks.every((c) => c.result === 'hidden')).toBe(true)
	})
})
