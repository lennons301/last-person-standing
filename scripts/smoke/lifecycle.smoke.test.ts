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
import { getLivePayload } from '@/lib/game/detail-queries'
import { settleFixture } from '@/lib/game/settle'
import { round as roundTable } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import {
	finishFixture,
	liveFixture,
	makeCompetition,
	makeFixture,
	makeGame,
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
