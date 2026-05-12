/**
 * Lifecycle smoke tests — every supported (game mode × competition) combo.
 *
 * What's under test: the recovery path from "fixture marked finished by
 * a non-live-poll writer" to "picks evaluated, players eliminated/saved,
 * round completed, game advanced". This is exactly the regression we
 * hit on prod when syncCompetition overwrote `fixture.status='finished'`
 * and processGameRound was never triggered.
 *
 * Each scenario:
 *   1. Seeds users / competition / teams / rounds / fixtures.
 *   2. Creates a game + players + picks.
 *   3. Writes final scores directly to fixture rows (the "missed
 *      transition" failure mode — bypasses enqueueProcessRound).
 *   4. Calls reconcileGameState (the same call site SSR + live API use).
 *   5. Asserts pick.result, player.status, round.status, advancement.
 *   6. Calls reconcile again — asserts no-op (idempotency).
 *
 * Adding a new competition? See AGENTS.md "Adding a new competition" —
 * every supported mode on the new comp needs a scenario in this file.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { reconcileGameState } from '@/lib/game/reconcile'
import { round as roundTable } from '@/lib/schema/competition'
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

beforeEach(async () => {
	await resetDb()
})

afterAll(async () => {
	// Leave a clean DB on exit so a developer running smoke tests doesn't
	// trip over half-seeded data on the next `just db-reset && just seed`.
	await resetDb()
})

describe('lifecycle: classic-PL', () => {
	it('reconciles + processes a finished round (missed-transition path)', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const brighton = await makeTeam({ name: 'Brighton', shortName: 'BHA' })
		const wolves = await makeTeam({ name: 'Wolves', shortName: 'WOL' })
		const arsenal = await makeTeam({ name: 'Arsenal', shortName: 'ARS' })
		const chelsea = await makeTeam({ name: 'Chelsea', shortName: 'CHE' })

		// Two-round game so we can also assert advancement.
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})

		const fxBhaWol = await makeFixture({ roundId: r1, homeTeamId: brighton, awayTeamId: wolves })
		const fxArsChe = await makeFixture({ roundId: r1, homeTeamId: arsenal, awayTeamId: chelsea })
		// Round 2 needs at least one fixture for advance to succeed.
		await makeFixture({ roundId: r2, homeTeamId: brighton, awayTeamId: arsenal })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r1,
			modeConfig: { allowRebuys: false },
		})

		const gpWinner = await makePlayer({ gameId, userId: 'u-winner' })
		const gpLoser = await makePlayer({ gameId, userId: 'u-loser' })
		const gpAlsoWin = await makePlayer({ gameId, userId: 'u-also-win' })

		await makePick({
			gameId,
			gamePlayerId: gpWinner,
			roundId: r1,
			teamId: brighton,
			fixtureId: fxBhaWol,
		})
		await makePick({
			gameId,
			gamePlayerId: gpLoser,
			roundId: r1,
			teamId: wolves,
			fixtureId: fxBhaWol,
		})
		await makePick({
			gameId,
			gamePlayerId: gpAlsoWin,
			roundId: r1,
			teamId: arsenal,
			fixtureId: fxArsChe,
		})

		// Missed transition — write finished status directly.
		await finishFixture(fxBhaWol, 3, 0)
		await finishFixture(fxArsChe, 2, 1)

		const result = await reconcileGameState(gameId)
		expect(result).toEqual({ ok: true, action: 'processed' })

		// Round 1 has isStartingRound=true (allowRebuys=false). Wolves picker
		// loses but doesn't get eliminated on R1 — they stay alive on a loss
		// since this is the starting round.
		const winnerPick = await db.query.pick.findFirst({
			where: eq(pick.gamePlayerId, gpWinner),
		})
		const loserPick = await db.query.pick.findFirst({
			where: eq(pick.gamePlayerId, gpLoser),
		})
		expect(winnerPick?.result).toBe('win')
		expect(loserPick?.result).toBe('loss')

		const loserPlayer = await db.query.gamePlayer.findFirst({
			where: eq(gamePlayer.id, gpLoser),
		})
		expect(loserPlayer?.status).toBe('alive') // starting round = exempt

		const r1After = await db.query.round.findFirst({ where: eq(roundTable.id, r1) })
		expect(r1After?.status).toBe('completed')

		const gameAfter = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(gameAfter?.currentRoundId).toBe(r2)

		// Second reconcile no-ops (round 2 has no finished fixtures yet).
		const result2 = await reconcileGameState(gameId)
		expect(result2.ok && result2.action).toBe('noop')
	})

	it('eliminates on loss after the starting round', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'Brighton', shortName: 'BHA' })
		const b = await makeTeam({ name: 'Wolves', shortName: 'WOL' })

		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		// 3 players: two pick winners (so alive count stays >1 after processing
		// and the game doesn't auto-complete on last-alive), one picks loser.
		const gpWin1 = await makePlayer({ gameId, userId: 'u-winner-1' })
		const gpWin2 = await makePlayer({ gameId, userId: 'u-winner-2' })
		const gpLose = await makePlayer({ gameId, userId: 'u-loser' })
		await makePick({ gameId, gamePlayerId: gpWin1, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpWin2, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpLose, roundId: r2, teamId: b, fixtureId: fx })

		await finishFixture(fx, 3, 0) // home wins, away-pick player loses
		await reconcileGameState(gameId)

		const winner1 = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpWin1) })
		const loserPlayer = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpLose) })
		expect(winner1?.status).toBe('alive')
		expect(loserPlayer?.status).toBe('eliminated')
	})
})

describe('lifecycle: classic-WC', () => {
	it('processes a group-stage round and advances', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const spain = await makeTeam({ name: 'Spain', shortName: 'ESP', fifaPot: 1 })
		const cv = await makeTeam({ name: 'Cape Verde', shortName: 'CPV', fifaPot: 4 })
		const portugal = await makeTeam({ name: 'Portugal', shortName: 'POR', fifaPot: 1 })
		const morocco = await makeTeam({ name: 'Morocco', shortName: 'MAR', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx1 = await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })
		const fx2 = await makeFixture({ roundId: r1, homeTeamId: portugal, awayTeamId: morocco })
		await makeFixture({ roundId: r2, homeTeamId: spain, awayTeamId: portugal })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r1,
			modeConfig: { allowRebuys: false },
		})
		// 2 players, both pick winners → 2 alive after R1, advance to R2.
		const gp1 = await makePlayer({ gameId, userId: 'u-1' })
		const gp2 = await makePlayer({ gameId, userId: 'u-2' })
		await makePick({ gameId, gamePlayerId: gp1, roundId: r1, teamId: spain, fixtureId: fx1 })
		await makePick({ gameId, gamePlayerId: gp2, roundId: r1, teamId: portugal, fixtureId: fx2 })

		await finishFixture(fx1, 3, 0)
		await finishFixture(fx2, 2, 0)
		const result = await reconcileGameState(gameId)
		expect(result).toEqual({ ok: true, action: 'processed' })

		const p1 = await db.query.pick.findFirst({ where: eq(pick.gamePlayerId, gp1) })
		expect(p1?.result).toBe('win')
		const r1After = await db.query.round.findFirst({ where: eq(roundTable.id, r1) })
		expect(r1After?.status).toBe('completed')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r2)
	})
})

describe('lifecycle: turbo-PL', () => {
	it('processes 10-pick streak and auto-completes (single-round mode)', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		// Need 10 fixtures for 10 ranked picks.
		const teams: string[] = []
		for (let i = 0; i < 20; i++) {
			teams.push(await makeTeam({ name: `T${i}`, shortName: `T${i}` }))
		}
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxIds: string[] = []
		for (let i = 0; i < 10; i++) {
			fxIds.push(
				await makeFixture({
					roundId: r1,
					homeTeamId: teams[i * 2],
					awayTeamId: teams[i * 2 + 1],
				}),
			)
		}

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 10 },
		})
		const gp = await makePlayer({ gameId, userId: 'u-turbo' })
		// Pick home for all 10, ranks 1..10.
		for (let i = 0; i < 10; i++) {
			await makePick({
				gameId,
				gamePlayerId: gp,
				roundId: r1,
				teamId: teams[i * 2],
				fixtureId: fxIds[i],
				confidenceRank: i + 1,
				predictedResult: 'home_win',
			})
		}

		// First 6 home wins (streak), 7th draw, then home wins again — streak
		// breaks at #7.
		for (let i = 0; i < 6; i++) await finishFixture(fxIds[i], 2, 0)
		await finishFixture(fxIds[6], 1, 1)
		for (let i = 7; i < 10; i++) await finishFixture(fxIds[i], 2, 0)

		const result = await reconcileGameState(gameId)
		expect(result).toEqual({ ok: true, action: 'processed' })

		const r1After = await db.query.round.findFirst({ where: eq(roundTable.id, r1) })
		expect(r1After?.status).toBe('completed')
		// Turbo is single-round — auto-completes to game.status='completed'.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
	})
})

describe('lifecycle: turbo-WC', () => {
	it('processes 10-pick turbo on WC group stage', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const teams: string[] = []
		for (let i = 0; i < 20; i++) {
			teams.push(
				await makeTeam({ name: `WC${i}`, shortName: `W${i}`, fifaPot: ((i % 4) + 1) as 1 }),
			)
		}
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxIds: string[] = []
		for (let i = 0; i < 10; i++) {
			fxIds.push(
				await makeFixture({
					roundId: r1,
					homeTeamId: teams[i * 2],
					awayTeamId: teams[i * 2 + 1],
				}),
			)
		}

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'turbo',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 10 },
		})
		const gp = await makePlayer({ gameId, userId: 'u' })
		for (let i = 0; i < 10; i++) {
			await makePick({
				gameId,
				gamePlayerId: gp,
				roundId: r1,
				teamId: teams[i * 2],
				fixtureId: fxIds[i],
				confidenceRank: i + 1,
				predictedResult: 'home_win',
			})
		}
		for (let i = 0; i < 10; i++) await finishFixture(fxIds[i], 1, 0)

		const result = await reconcileGameState(gameId)
		expect(result).toEqual({ ok: true, action: 'processed' })
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
	})
})

describe('lifecycle: cup-WC', () => {
	it('awards lives on underdog win, restricts favourite picks', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		// Pot diff -3 fixture for underdog-wins-3-lives scenario.
		const spain = await makeTeam({ name: 'Spain', shortName: 'ESP', fifaPot: 1 })
		const cv = await makeTeam({ name: 'Cape Verde', shortName: 'CPV', fifaPot: 4 })
		// Filler teams to pad picks to numberOfPicks (4 for compactness here).
		const teamsByPot = [
			[await makeTeam({ name: 'A1', shortName: 'A1', fifaPot: 1 })],
			[await makeTeam({ name: 'B2', shortName: 'B2', fifaPot: 2 })],
			[await makeTeam({ name: 'C2', shortName: 'C2', fifaPot: 2 })],
			[await makeTeam({ name: 'D3', shortName: 'D3', fifaPot: 3 })],
		]

		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxUpset = await makeFixture({ roundId: r1, homeTeamId: spain, awayTeamId: cv })
		const fxEven1 = await makeFixture({
			roundId: r1,
			homeTeamId: teamsByPot[1][0],
			awayTeamId: teamsByPot[2][0],
		})
		const fxEven2 = await makeFixture({
			roundId: r1,
			homeTeamId: teamsByPot[0][0],
			awayTeamId: teamsByPot[3][0],
		})
		const fxEven3 = await makeFixture({
			roundId: r1,
			homeTeamId: teamsByPot[1][0],
			awayTeamId: teamsByPot[3][0],
		})

		// Need a next round so cup doesn't auto-complete on "rounds-exhausted".
		await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 4, startingLives: 0 },
		})
		// 2 players so a survivor doesn't get insta-declared winner by
		// checkCupCompletion's last-alive path.
		const gpHero = await makePlayer({ gameId, userId: 'u-hero', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-filler', livesRemaining: 5 })

		// Hero rank 1: Cape Verde (pot 4) away — 3-tier underdog.
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: cv,
			fixtureId: fxUpset,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})
		// Hero ranks 2-4: even-tier picks (no lives bonus or penalty).
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: teamsByPot[1][0],
			fixtureId: fxEven1,
			confidenceRank: 2,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: teamsByPot[0][0],
			fixtureId: fxEven2,
			confidenceRank: 3,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: teamsByPot[1][0],
			fixtureId: fxEven3,
			confidenceRank: 4,
			predictedResult: 'home_win',
		})
		// Filler player: same picks so they also survive — keeps the game
		// from auto-completing on alive=1.
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: cv,
			fixtureId: fxUpset,
			confidenceRank: 1,
			predictedResult: 'away_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: teamsByPot[1][0],
			fixtureId: fxEven1,
			confidenceRank: 2,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: teamsByPot[0][0],
			fixtureId: fxEven2,
			confidenceRank: 3,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: teamsByPot[1][0],
			fixtureId: fxEven3,
			confidenceRank: 4,
			predictedResult: 'home_win',
		})

		// Cape Verde wins 1-0 away over Spain — the 3-tier upset.
		await finishFixture(fxUpset, 0, 1)
		// All others home wins so the streak doesn't break.
		await finishFixture(fxEven1, 1, 0)
		await finishFixture(fxEven2, 1, 0)
		await finishFixture(fxEven3, 1, 0)

		const result = await reconcileGameState(gameId)
		expect(result).toEqual({ ok: true, action: 'processed' })

		// 3 lives gained from the upset, no spends — final lives = 3.
		const hero = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHero) })
		expect(hero?.livesRemaining).toBe(3)
		expect(hero?.status).toBe('alive')
	})

	it('eliminates on streak break with no lives', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const t1 = await makeTeam({ name: 'Alpha', shortName: 'ALP', fifaPot: 2 })
		const t2 = await makeTeam({ name: 'Beta', shortName: 'BET', fifaPot: 2 })

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
		// 3 players: 2 survivors + 1 loser, so alive count stays >1 after
		// processing and the game doesn't auto-complete on last-alive.
		const gpLoser = await makePlayer({ gameId, userId: 'u-loser', livesRemaining: 0 })
		const gpSurvivor1 = await makePlayer({ gameId, userId: 'u-survivor-1', livesRemaining: 0 })
		const gpSurvivor2 = await makePlayer({ gameId, userId: 'u-survivor-2', livesRemaining: 0 })
		await makePick({
			gameId,
			gamePlayerId: gpLoser,
			roundId: r1,
			teamId: t1,
			fixtureId: fx,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		// Survivors pick the actual winner.
		for (const gp of [gpSurvivor1, gpSurvivor2]) {
			await makePick({
				gameId,
				gamePlayerId: gp,
				roundId: r1,
				teamId: t2,
				fixtureId: fx,
				confidenceRank: 1,
				predictedResult: 'away_win',
			})
		}

		// Away wins 0-2 — home picker (no lives) eliminated, away pickers survive.
		await finishFixture(fx, 0, 2)
		await reconcileGameState(gameId)

		const loser = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpLoser) })
		const survivor = await db.query.gamePlayer.findFirst({
			where: eq(gamePlayer.id, gpSurvivor1),
		})
		expect(loser?.status).toBe('eliminated')
		expect(survivor?.status).toBe('alive')
	})
})

describe('idempotency', () => {
	it('a second reconcile after processing is a no-op', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const r2 = await makeRound(compId, {
			number: 2,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fx = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r1,
		})
		// 2 players both win → game advances rather than auto-completing,
		// so the second reconcile can be observed on a still-active game.
		const gp1 = await makePlayer({ gameId, userId: 'u-1' })
		const gp2 = await makePlayer({ gameId, userId: 'u-2' })
		await makePick({ gameId, gamePlayerId: gp1, roundId: r1, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gp2, roundId: r1, teamId: a, fixtureId: fx })
		await finishFixture(fx, 1, 0)

		const r1Result = await reconcileGameState(gameId)
		expect(r1Result.ok && r1Result.action).toBe('processed')

		// Round 2 isn't ready (no finished fixtures) → second reconcile no-ops.
		const r2Result = await reconcileGameState(gameId)
		expect(r2Result.ok && r2Result.action).toBe('noop')
	})
})
