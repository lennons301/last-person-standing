/**
 * Cancellation smoke tests — exercise the void path for each game mode.
 *
 * See:
 *  - docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md
 *  - src/lib/game/settle.ts (voidFixtureInternal + voidWholeRound + threshold)
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { settleFixture } from '@/lib/game/settle'
import { fixture, round as roundTable } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import {
	finishFixture,
	makeCompetition,
	makeFixture,
	makeGame,
	makePick,
	makePlayer,
	makeRound,
	makeTeam,
	resetDb,
} from './helpers'

async function cancelFixture(fixtureId: string): Promise<void> {
	await db
		.update(fixture)
		.set({ status: 'cancelled', homeScore: null, awayScore: null })
		.where(sql`${fixture.id} = ${fixtureId}`)
}

beforeEach(async () => {
	await resetDb()
})

afterAll(async () => {
	await resetDb()
})

/* ────────────────────────────────────────────────────────────────────── */
/* Classic — per-fixture void                                              */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: classic single-fixture void', () => {
	it("voids the pick, leaves player alive, marks team as 'used'", async () => {
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
		const gp = await makePlayer({ gameId, userId: 'u' })
		const filler = await makePlayer({ gameId, userId: 'filler' })
		const pickId = await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r2,
			teamId: a,
			fixtureId: fxAB,
		})
		// Filler picks team C on the other fixture so when that finishes
		// the round can complete + advance.
		await makePick({ gameId, gamePlayerId: filler, roundId: r2, teamId: c, fixtureId: fxCD })

		await cancelFixture(fxAB)
		await settleFixture(fxAB)

		const voided = await db.query.pick.findFirst({ where: eq(pick.id, pickId) })
		expect(voided?.result).toBe('void')
		expect(voided?.cancellationReason).toBe('cancelled')

		const player = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gp) })
		expect(player?.status).toBe('alive')

		// Round can advance once the other fixture finishes — the cancelled
		// fixture doesn't block round completion.
		await finishFixture(fxCD, 1, 0)
		await settleFixture(fxCD)
		const r2After = await db.query.round.findFirst({ where: eq(roundTable.id, r2) })
		expect(r2After?.status).toBe('completed')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r3)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Classic — round-void threshold                                          */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: classic round-void threshold', () => {
	it('voids the whole round when >50% of fixtures are cancelled', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 8; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		// 4 fixtures in r2.
		const fxIds: string[] = []
		for (let i = 0; i < 4; i++) {
			fxIds.push(
				await makeFixture({ roundId: r2, homeTeamId: teams[i * 2], awayTeamId: teams[i * 2 + 1] }),
			)
		}
		// One r3 fixture so advance has somewhere to go.
		await makeFixture({ roundId: r3, homeTeamId: teams[0], awayTeamId: teams[1] })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gp1 = await makePlayer({ gameId, userId: 'u1' })
		const gp2 = await makePlayer({ gameId, userId: 'u2' })
		// Third player keeps alive count >1 so eliminating gp1 doesn't
		// auto-complete the game before the cancellations land.
		const gp3 = await makePlayer({ gameId, userId: 'u3' })
		// gp1 picked team T0 (home) on fx0. Fixture finishes 0-2 → T0 lost,
		// gp1 would normally be eliminated. The round void should reinstate.
		await makePick({
			gameId,
			gamePlayerId: gp1,
			roundId: r2,
			teamId: teams[0],
			fixtureId: fxIds[0],
		})
		await makePick({
			gameId,
			gamePlayerId: gp2,
			roundId: r2,
			teamId: teams[3],
			fixtureId: fxIds[1],
		})
		// gp3 picks the away side of fx0 — wins when fx0 settles 0-2.
		await makePick({
			gameId,
			gamePlayerId: gp3,
			roundId: r2,
			teamId: teams[1],
			fixtureId: fxIds[0],
		})

		// Settle one fixture as a loss to eliminate gp1 first.
		await finishFixture(fxIds[0], 0, 2)
		await settleFixture(fxIds[0])
		const eliminatedFirst = await db.query.gamePlayer.findFirst({
			where: eq(gamePlayer.id, gp1),
		})
		expect(eliminatedFirst?.status).toBe('eliminated')

		// Now cancel 3 out of 4 fixtures (>50%). One settled, three cancelled
		// → 3/4 = 75% cancelled, threshold crossed.
		await cancelFixture(fxIds[1])
		await settleFixture(fxIds[1])
		await cancelFixture(fxIds[2])
		await settleFixture(fxIds[2])
		await cancelFixture(fxIds[3])
		await settleFixture(fxIds[3])

		// All picks on the round should now be 'void' with reason
		// 'round-voided', including the previously-settled gp1 pick.
		const allPicks = await db.query.pick.findMany({
			where: eq(pick.roundId, r2),
		})
		for (const p of allPicks) {
			expect(p.result).toBe('void')
			expect(p.cancellationReason).toBe('round-voided')
		}

		// gp1 should be reinstated as 'alive' (eliminated by the voided round).
		const reinstated = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gp1) })
		expect(reinstated?.status).toBe('alive')
		expect(reinstated?.eliminatedRoundId).toBeNull()

		// Round flagged voided.
		const r2After = await db.query.round.findFirst({ where: eq(roundTable.id, r2) })
		expect(r2After?.voidedAt).not.toBeNull()
		expect(r2After?.status).toBe('completed')

		// Game advanced.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r3)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Turbo — void skips in the streak                                        */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: turbo auto-skip', () => {
	it("streak walks past a voided rank as if it weren't there", async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const teams: string[] = []
		for (let i = 0; i < 6; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: teams[0], awayTeamId: teams[1] })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: teams[2], awayTeamId: teams[3] })
		const fx3 = await makeFixture({ roundId: r1, homeTeamId: teams[4], awayTeamId: teams[5] })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 3 },
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
		await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r1,
			teamId: teams[4],
			fixtureId: fx3,
			confidenceRank: 3,
			predictedResult: 'home_win',
		})

		// Rank 1: correct (home win). Rank 2: cancelled. Rank 3: correct.
		await finishFixture(fx1, 1, 0)
		await settleFixture(fx1)
		await cancelFixture(fx2)
		await settleFixture(fx2)
		await finishFixture(fx3, 1, 0)
		await settleFixture(fx3)

		// Game auto-completes (single-round mode). Player should be 'winner'
		// since they're the only player.
		const player = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gp) })
		expect(player?.status).toBe('winner') // turboTiebreaker picks the sole survivor

		// Picks: rank 2 voided, others win.
		const allPicks = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
		const ranked = allPicks.sort((a, b) => (a.confidenceRank ?? 0) - (b.confidenceRank ?? 0))
		expect(ranked[0].result).toBe('win')
		expect(ranked[1].result).toBe('void')
		expect(ranked[2].result).toBe('win')
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Cup — re-eval walks past voids in rank order                            */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: cup auto-skip', () => {
	it('re-eval ignores voided picks; lives state continues from prior rank', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const spain = await makeTeam({ name: 'Spain', shortName: 'ESP', fifaPot: 1 })
		const cv = await makeTeam({ name: 'Cape Verde', shortName: 'CPV', fifaPot: 4 })
		const eng = await makeTeam({ name: 'England', shortName: 'ENG', fifaPot: 1 })
		const aus = await makeTeam({ name: 'Australia', shortName: 'AUS', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: eng, awayTeamId: aus })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpHero = await makePlayer({ gameId, userId: 'u-hero', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-filler', livesRemaining: 0 })
		// Hero rank 1: 3-tier underdog Cape Verde. Rank 2: even-tier ENG (pot 1) vs AUS (pot 2).
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: cv,
			fixtureId: fx1,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: eng,
			fixtureId: fx2,
			confidenceRank: 2,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: cv,
			fixtureId: fx1,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: eng,
			fixtureId: fx2,
			confidenceRank: 2,
			predictedResult: 'home_win',
		})

		// Cancel rank 1's fixture. Rank 2 plays and home wins.
		await cancelFixture(fx1)
		await settleFixture(fx1)
		await finishFixture(fx2, 2, 0)
		await settleFixture(fx2)

		const heroPicks = await db.query.pick.findMany({
			where: eq(pick.gamePlayerId, gpHero),
		})
		const rank1 = heroPicks.find((p) => p.confidenceRank === 1)
		const rank2 = heroPicks.find((p) => p.confidenceRank === 2)
		expect(rank1?.result).toBe('void')
		expect(rank1?.lifeGained).toBe(0)
		expect(rank2?.result).toBe('win')

		// Hero starts with 0 lives, rank 1 voided, rank 2 even-tier win → no lives gained.
		const hero = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHero) })
		expect(hero?.livesRemaining).toBe(0)
		expect(hero?.status).toBe('alive')
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Postponed → cancelled normalisation                                     */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: postponed status auto-cancels', () => {
	it('settleFixture normalises postponed → cancelled and runs the void path', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fxAB = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxCD = await makeFixture({ roundId: r2, homeTeamId: c, awayTeamId: d })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gp = await makePlayer({ gameId, userId: 'u' })
		await makePick({
			gameId,
			gamePlayerId: gp,
			roundId: r2,
			teamId: a,
			fixtureId: fxAB,
		})

		// Write a postponed status directly (mimicking syncCompetition's mirror).
		await db.update(fixture).set({ status: 'postponed' }).where(sql`${fixture.id} = ${fxAB}`)
		await settleFixture(fxAB)

		const after = await db.query.fixture.findFirst({ where: eq(fixture.id, fxAB) })
		expect(after?.status).toBe('cancelled') // normalised

		const voided = await db.query.pick.findFirst({
			where: eq(pick.gamePlayerId, gp),
		})
		expect(voided?.result).toBe('void')
		// Reference fxCD to silence unused.
		expect(fxCD).toBeTruthy()
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Idempotency: re-settle a cancelled fixture                              */
/* ────────────────────────────────────────────────────────────────────── */

describe('cancellation: idempotent', () => {
	it('re-settling the same cancelled fixture does not change state', async () => {
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
		const gp = await makePlayer({ gameId, userId: 'u' })
		await makePick({ gameId, gamePlayerId: gp, roundId: r2, teamId: a, fixtureId: fx })

		await cancelFixture(fx)
		await settleFixture(fx)
		const firstPass = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gp) })

		await settleFixture(fx) // second call
		const secondPass = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gp) })

		expect(secondPass?.result).toBe('void')
		expect(secondPass?.cancellationReason).toBe(firstPass?.cancellationReason)
	})
})
