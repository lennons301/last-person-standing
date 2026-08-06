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
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import {
	ensureCurrentPlSeasonCompetition,
	mergeFootballDataIds,
	SeasonDetectionError,
	syncCompetition,
} from '@/lib/game/bootstrap-competitions'
import { getCupLadderData, getCupStandingsData } from '@/lib/game/cup-standings-queries'
import {
	getLivePayload,
	getProgressGridData,
	getTurboStandingsData,
} from '@/lib/game/detail-queries'
import { processDeadlineLock } from '@/lib/game/no-pick-handler'
import { reconcileAllActiveGames, reconcileGameState } from '@/lib/game/reconcile'
import { settleFixture } from '@/lib/game/settle'
import {
	competition,
	fixture as fixtureTable,
	round as roundTable,
	team as teamTable,
} from '@/lib/schema/competition'
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

	it('winner-lag: an unresolved knockout tie is deferred (pending), then settles when the winner lands', async () => {
		// Regression (prod game dc857c5f, R32): a knockout tie finished level while
		// football-data's `winner` still lagged at null. Scoring it a draw wrongly
		// eliminated the backer, and that elimination then completed/advanced the game
		// irreversibly. It must instead be DEFERRED — pick pending, player alive —
		// until the winner lands, then settle correctly. The genuine loser goes out
		// only once the result is known.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const fx = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxPending = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpHome = await makePlayer({ gameId, userId: 'u-home' })
		const gpAway = await makePlayer({ gameId, userId: 'u-away' })
		// Two safe players on the still-pending fixture keep >=2 alive throughout,
		// so the game never auto-completes (last-alive) during the test.
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpHome, roundId: r4, teamId: home, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpAway, roundId: r4, teamId: away, fixtureId: fx })
		await makePick({
			gameId,
			gamePlayerId: gpSafe1,
			roundId: r4,
			teamId: home,
			fixtureId: fxPending,
		})
		await makePick({
			gameId,
			gamePlayerId: gpSafe2,
			roundId: r4,
			teamId: away,
			fixtureId: fxPending,
		})

		// Winner-lag moment: finished, level score, no winner yet.
		await finishFixture(fx, 1, 1, null)
		await settleFixture(fx)
		{
			const picks = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
			const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
			// Deferred: both picks on the tie stay pending, both players stay alive.
			expect(picks.find((p) => p.gamePlayerId === gpHome)?.result).toBe('pending')
			expect(picks.find((p) => p.gamePlayerId === gpAway)?.result).toBe('pending')
			expect(players.find((p) => p.id === gpHome)?.status).toBe('alive')
			expect(players.find((p) => p.id === gpAway)?.status).toBe('alive')
		}

		// Correct result arrives (home advanced 2-1). Re-settle the same fixture.
		await finishFixture(fx, 2, 1, 'home')
		await settleFixture(fx)

		const picks = await db.query.pick.findMany({ where: eq(pick.gameId, gameId) })
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		// Home backer: pick heals to a win (goals = picked team's goals) and revived.
		expect(picks.find((p) => p.gamePlayerId === gpHome)?.result).toBe('win')
		expect(picks.find((p) => p.gamePlayerId === gpHome)?.goalsScored).toBe(2)
		expect(players.find((p) => p.id === gpHome)?.status).toBe('alive')
		expect(players.find((p) => p.id === gpHome)?.eliminatedRoundId).toBeNull()
		// Away backer genuinely lost the tie: stays a loss, stays eliminated.
		expect(picks.find((p) => p.gamePlayerId === gpAway)?.result).toBe('loss')
		expect(players.find((p) => p.id === gpAway)?.status).toBe('eliminated')
	})

	it('winner-only-lag: a level penalty tie settles as a win when only the winner is corrected', async () => {
		// The shootout leaves the score level (1-1); only the `winner` field arrives
		// late. Deferred while level+winnerless, then settles to a win (goals from the
		// level score) once the winner lands.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const fx = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxPending = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpHome = await makePlayer({ gameId, userId: 'u-home' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpHome, roundId: r4, teamId: home, fixtureId: fx })
		await makePick({
			gameId,
			gamePlayerId: gpSafe1,
			roundId: r4,
			teamId: home,
			fixtureId: fxPending,
		})
		await makePick({
			gameId,
			gamePlayerId: gpSafe2,
			roundId: r4,
			teamId: away,
			fixtureId: fxPending,
		})

		await finishFixture(fx, 1, 1, null)
		await settleFixture(fx)
		// Deferred: pick pending, player alive (not scored a draw).
		expect(
			(
				await db.query.pick.findFirst({
					where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gpHome)),
				})
			)?.result,
		).toBe('pending')
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHome) }))?.status,
		).toBe('alive')

		// Only the winner arrives; score stays level at 1-1.
		await finishFixture(fx, 1, 1, 'home')
		await settleFixture(fx)

		const homePick = await db.query.pick.findFirst({
			where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gpHome)),
		})
		const homePlayer = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHome) })
		expect(homePick?.result).toBe('win')
		expect(homePick?.goalsScored).toBe(1)
		expect(homePlayer?.status).toBe('alive')
	})

	it('group-stage draw still eliminates — deferral is knockout-rounds only', async () => {
		// A group-stage (round <= 3) draw is a genuine result; deferral must NOT
		// apply, so the backer is still eliminated after the starting round.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const fx = await makeFixture({ roundId: r2, homeTeamId: home, awayTeamId: away })
		const fxPending = await makeFixture({ roundId: r2, homeTeamId: home, awayTeamId: away })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpDraw = await makePlayer({ gameId, userId: 'u-draw' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpDraw, roundId: r2, teamId: home, fixtureId: fx })
		await makePick({
			gameId,
			gamePlayerId: gpSafe1,
			roundId: r2,
			teamId: home,
			fixtureId: fxPending,
		})
		await makePick({
			gameId,
			gamePlayerId: gpSafe2,
			roundId: r2,
			teamId: away,
			fixtureId: fxPending,
		})

		await finishFixture(fx, 1, 1, null) // genuine group draw, no winner
		await settleFixture(fx)

		const drawPick = await db.query.pick.findFirst({
			where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gpDraw)),
		})
		const drawPlayer = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpDraw) })
		expect(drawPick?.result).toBe('draw')
		expect(drawPlayer?.status).toBe('eliminated')
	})

	it('a deferred knockout tie does not complete a two-player game (no premature wrong crown)', async () => {
		// Finding-2 regression: A's tie finishes level+winnerless while B wins. If A
		// were scored a draw and eliminated, B (last alive) would be crowned on the
		// fixture-derived allFinished — an irreversible wrong payout. Deferral + the
		// pending-pick guard must keep the game active until A's tie resolves.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const win = await makeTeam({ name: 'Win', shortName: 'WIN' })
		const lose = await makeTeam({ name: 'Lose', shortName: 'LOS' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const fxTie = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxB = await makeFixture({ roundId: r4, homeTeamId: win, awayTeamId: lose })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpA = await makePlayer({ gameId, userId: 'u-a' })
		const gpB = await makePlayer({ gameId, userId: 'u-b' })
		await makePick({ gameId, gamePlayerId: gpA, roundId: r4, teamId: home, fixtureId: fxTie })
		await makePick({ gameId, gamePlayerId: gpB, roundId: r4, teamId: win, fixtureId: fxB })

		// B wins outright; A's tie is level with no winner yet.
		await finishFixture(fxB, 3, 0, 'home')
		await settleFixture(fxB)
		await finishFixture(fxTie, 1, 1, null)
		await settleFixture(fxTie)

		// A's tie is unresolved → game stays active, A stays alive, B not crowned.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.find((p) => p.id === gpA)?.status).toBe('alive')
		expect(players.find((p) => p.id === gpB)?.status).toBe('alive')
	})

	it('re-settling a finished fixture does not re-eliminate a reinstated player', async () => {
		// Guards finding-1: settleFixture skips already-settled picks, so a player
		// reinstated after a loss (rebuy / admin) is NOT silently re-eliminated when a
		// reconcile sweep re-runs settleFixture on the finished fixture.
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxPending = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: true },
		})
		const gpReinstated = await makePlayer({ gameId, userId: 'u-re' })
		// Two safe players keep >=2 alive so eliminating gpReinstated doesn't complete.
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpReinstated, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpSafe1, roundId: r2, teamId: a, fixtureId: fxPending })
		await makePick({ gameId, gamePlayerId: gpSafe2, roundId: r2, teamId: b, fixtureId: fxPending })

		// A loses 0-2 → gpReinstated (picked A) eliminated.
		await finishFixture(fx, 0, 2)
		await settleFixture(fx)
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpReinstated) }))?.status,
		).toBe('eliminated')

		// Reinstate (as a rebuy / admin make-pick would): alive again, loss pick persists.
		await db
			.update(gamePlayer)
			.set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
			.where(eq(gamePlayer.id, gpReinstated))

		// Reconcile-style re-run of settleFixture on the same finished fixture.
		await settleFixture(fx)

		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpReinstated) }))?.status,
		).toBe('alive')
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

	it('progress grid keeps the eliminating pick visible with a skull marker (not a bare skull)', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const r2 = await makeRound(compId, { number: 2, status: 'open' })
		const fx = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })
		const fxSafe = await makeFixture({ roundId: r2, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r2,
			modeConfig: { allowRebuys: false },
		})
		const gpOut = await makePlayer({ gameId, userId: 'u-out' })
		// Two safe players keep >=2 alive so the game doesn't auto-complete.
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpOut, roundId: r2, teamId: a, fixtureId: fx })
		await makePick({ gameId, gamePlayerId: gpSafe1, roundId: r2, teamId: a, fixtureId: fxSafe })
		await makePick({ gameId, gamePlayerId: gpSafe2, roundId: r2, teamId: b, fixtureId: fxSafe })

		// A loses 0-2 → gpOut (picked A) is eliminated in round 2.
		await finishFixture(fx, 0, 2)
		await settleFixture(fx)

		const grid = await getProgressGridData(gameId, 'u-out')
		const cell = grid?.players.find((p) => p.id === gpOut)?.cellsByRoundId[r2]
		// The cell shows the pick + result, not a bare skull — plus the marker flag.
		expect(cell?.result).not.toBe('skull')
		expect(cell?.result).toBe('loss')
		expect(cell?.teamShortName).toBe('A')
		expect(cell?.eliminatedHere).toBe(true)
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

	it('does NOT complete mid-round when the terminal seeded round is only partially finished — the dc857c5f MD3 mis-crowning', async () => {
		// MD3 is the LAST seeded round (knockout rounds not yet created). Settling
		// just ONE of its fixtures must not end the game: "rounds exhausted" cannot
		// be concluded while the round is still in progress. This is the exact
		// shape that wrongly crowned a winner mid-MD3.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const ger = await makeTeam({ name: 'Germany', shortName: 'GER', fifaPot: 1 })
		const kor = await makeTeam({ name: 'South Korea', shortName: 'KOR', fifaPot: 3 })
		const mar = await makeTeam({ name: 'Morocco', shortName: 'MAR', fifaPot: 2 })
		const civ = await makeTeam({ name: 'Ivory Coast', shortName: 'CIV', fifaPot: 3 })
		const md3 = await makeRound(compId, { number: 3, status: 'open' })
		const fxFinished = await makeFixture({ roundId: md3, homeTeamId: ger, awayTeamId: kor })
		const fxPending = await makeFixture({ roundId: md3, homeTeamId: mar, awayTeamId: civ })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: md3,
			modeConfig: { allowRebuys: false },
		})
		const winner = await makePlayer({ gameId, userId: 'u-win' })
		const loser = await makePlayer({ gameId, userId: 'u-lose' })
		const waiting = await makePlayer({ gameId, userId: 'u-wait' })
		await makePick({
			gameId,
			gamePlayerId: winner,
			roundId: md3,
			teamId: ger,
			fixtureId: fxFinished,
		})
		await makePick({
			gameId,
			gamePlayerId: loser,
			roundId: md3,
			teamId: kor,
			fixtureId: fxFinished,
		})
		await makePick({
			gameId,
			gamePlayerId: waiting,
			roundId: md3,
			teamId: mar,
			fixtureId: fxPending,
		})

		// Germany beat South Korea; Morocco's fixture is still to play.
		await finishFixture(fxFinished, 2, 0)
		await settleFixture(fxFinished)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active') // NOT completed mid-round
		expect(g?.currentRoundId).toBe(md3) // still on MD3
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts).toHaveLength(0) // nobody crowned

		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		const byId = Object.fromEntries(players.map((p) => [p.id, p]))
		expect(byId[loser].status).toBe('eliminated') // the loss still eliminates
		expect(byId[winner].status).toBe('alive')
		expect(byId[waiting].status).toBe('alive')
	})

	it('waits at the group→knockout boundary: MD3 fully settles with a TBD knockout round seeded → no completion, no auto-elim', async () => {
		// With the knockout round seeded (a round row exists, fixtures TBD), the
		// fully-finished group stage must NOT auto-complete (nextRoundExists is
		// true) and must NOT auto-eliminate everyone (the bracket is unpublished).
		// The game waits, pointed at the just-completed MD3, until the draw lands.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const ger = await makeTeam({ name: 'Germany', shortName: 'GER', fifaPot: 1 })
		const kor = await makeTeam({ name: 'South Korea', shortName: 'KOR', fifaPot: 3 })
		const mar = await makeTeam({ name: 'Morocco', shortName: 'MAR', fifaPot: 2 })
		const civ = await makeTeam({ name: 'Ivory Coast', shortName: 'CIV', fifaPot: 3 })
		const md3 = await makeRound(compId, { number: 3, status: 'open' })
		// Round of 32 seeded but TBD — exists as a round row, no fixtures yet.
		await makeRound(compId, { number: 4, status: 'upcoming' })
		const fxA = await makeFixture({ roundId: md3, homeTeamId: ger, awayTeamId: kor })
		const fxB = await makeFixture({ roundId: md3, homeTeamId: mar, awayTeamId: civ })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: md3,
			modeConfig: { allowRebuys: false },
		})
		const p1 = await makePlayer({ gameId, userId: 'u-1' })
		const p2 = await makePlayer({ gameId, userId: 'u-2' })
		await makePick({ gameId, gamePlayerId: p1, roundId: md3, teamId: ger, fixtureId: fxA })
		await makePick({ gameId, gamePlayerId: p2, roundId: md3, teamId: mar, fixtureId: fxB })

		await finishFixture(fxA, 2, 0)
		await finishFixture(fxB, 1, 0)
		await settleFixture(fxA)
		await settleFixture(fxB) // MD3 now fully finished

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active') // did NOT wrongly complete via rounds-exhausted
		expect(g?.currentRoundId).toBe(md3) // stays put awaiting the bracket
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts).toHaveLength(0)

		const players = await db.query.gamePlayer.findMany({ where: eq(gamePlayer.gameId, gameId) })
		expect(players.every((p) => p.status === 'alive')).toBe(true) // no wrongful auto-elim

		const md3row = await db.query.round.findFirst({ where: eq(roundTable.id, md3) })
		expect(md3row?.status).toBe('completed') // round itself is done
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

	it('knockout: a +1 underdog level at 90 minutes survives (draw_success) even if the tie is lost on penalties', async () => {
		// Cup scores on the 90-minute result, not qualification. A +1 underdog that
		// is level at 90 minutes survives the round even though the favourite then
		// wins the shootout — the behaviour Sean asked for. Classic (separate) still
		// scores knockouts by the qualification `winner`.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const fav = await makeTeam({ name: 'Favourite', shortName: 'FAV', fifaPot: 1 })
		const dog = await makeTeam({ name: 'Underdog', shortName: 'DOG', fifaPot: 2 }) // +1 underdog
		const o1 = await makeTeam({ name: 'Other One', shortName: 'OON', fifaPot: 2 })
		const o2 = await makeTeam({ name: 'Other Two', shortName: 'OTW', fifaPot: 2 })
		const r = await makeRound(compId, { number: 4, status: 'open' }) // R32
		const tie = await makeFixture({ roundId: r, homeTeamId: fav, awayTeamId: dog })
		const unplayed = await makeFixture({ roundId: r, homeTeamId: o1, awayTeamId: o2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		const gpDog = await makePlayer({ gameId, userId: 'u-dog', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-fill', livesRemaining: 0 })
		const dogPick = await makePick({
			gameId,
			gamePlayerId: gpDog,
			roundId: r,
			teamId: dog,
			fixtureId: tie,
			confidenceRank: 1,
		})
		// filler keeps the gameweek incomplete (unplayed fixture) so we assert the
		// pick result rather than completion.
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r,
			teamId: o1,
			fixtureId: unplayed,
			confidenceRank: 1,
		})

		// 1-1 at 90 minutes; favourite (home) wins on penalties — full-time carries
		// the shootout-inflated score + winner=home, but regularTime is 1-1.
		await finishFixture(tie, 4, 2, 'home', { home: 1, away: 1 })
		await settleFixture(tie)

		// draw_success persists as 'draw'; the player survives (NOT 'loss'/eliminated).
		const p = await db.query.pick.findFirst({ where: eq(pick.id, dogPick) })
		expect(p?.result).toBe('draw')
		const player = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpDog) })
		expect(player?.status).toBe('alive')
	})

	it('knockout: a +1 underdog that QUALIFIES on penalties from a 90-min draw → win + 1 life', async () => {
		// The "to qualify" rule (NED v MAR R32): Morocco (+1 underdog) drew 1-1 at 90
		// and won the shootout. The pick must be a WIN earning the underdog its life —
		// NOT merely a draw_success. The 90-minute score is level; the qualification
		// `winner` (away) makes it a win.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const fav = await makeTeam({ name: 'Favourite', shortName: 'FAV', fifaPot: 1 })
		const dog = await makeTeam({ name: 'Underdog', shortName: 'DOG', fifaPot: 2 }) // +1 underdog
		const o1 = await makeTeam({ name: 'Other One', shortName: 'OON', fifaPot: 2 })
		const o2 = await makeTeam({ name: 'Other Two', shortName: 'OTW', fifaPot: 2 })
		const r = await makeRound(compId, { number: 4, status: 'open' }) // R32
		const tie = await makeFixture({ roundId: r, homeTeamId: fav, awayTeamId: dog })
		const unplayed = await makeFixture({ roundId: r, homeTeamId: o1, awayTeamId: o2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		const gpDog = await makePlayer({ gameId, userId: 'u-dog', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-fill', livesRemaining: 0 })
		const dogPick = await makePick({
			gameId,
			gamePlayerId: gpDog,
			roundId: r,
			teamId: dog,
			fixtureId: tie,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r,
			teamId: o1,
			fixtureId: unplayed,
			confidenceRank: 1,
		})

		// 1-1 at 90 minutes; underdog (away) wins on penalties — full-time carries the
		// shootout-inflated score (2-4) + winner=away, regularTime stays 1-1.
		await finishFixture(tie, 2, 4, 'away', { home: 1, away: 1 })
		await settleFixture(tie)

		const p = await db.query.pick.findFirst({ where: eq(pick.id, dogPick) })
		expect(p?.result).toBe('win')
		expect(p?.lifeGained).toBe(1)
		const player = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpDog) })
		expect(player?.status).toBe('alive')
		expect(player?.livesRemaining).toBe(1)
	})

	it('knockout: derives the qualify-win from full-time when football-data winner lags (winner=null)', async () => {
		// football-data leaves `winner` null on some finished shootouts. The
		// penalty-inclusive full-time score (2-4, away ahead) still tells us the
		// underdog advanced → win + life, even with no `winner`.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const fav = await makeTeam({ name: 'Favourite', shortName: 'FAV', fifaPot: 1 })
		const dog = await makeTeam({ name: 'Underdog', shortName: 'DOG', fifaPot: 2 })
		const o1 = await makeTeam({ name: 'Other One', shortName: 'OON', fifaPot: 2 })
		const o2 = await makeTeam({ name: 'Other Two', shortName: 'OTW', fifaPot: 2 })
		const r = await makeRound(compId, { number: 4, status: 'open' })
		const tie = await makeFixture({ roundId: r, homeTeamId: fav, awayTeamId: dog })
		const unplayed = await makeFixture({ roundId: r, homeTeamId: o1, awayTeamId: o2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r,
			modeConfig: { numberOfPicks: 1, startingLives: 0 },
		})
		const gpDog = await makePlayer({ gameId, userId: 'u-dog', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-fill', livesRemaining: 0 })
		const dogPick = await makePick({
			gameId,
			gamePlayerId: gpDog,
			roundId: r,
			teamId: dog,
			fixtureId: tie,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r,
			teamId: o1,
			fixtureId: unplayed,
			confidenceRank: 1,
		})

		// winner deliberately null; full-time 2-4 (away advanced), regulation 1-1.
		await finishFixture(tie, 2, 4, null, { home: 1, away: 1 })
		await settleFixture(tie)

		const p = await db.query.pick.findFirst({ where: eq(pick.id, dogPick) })
		expect(p?.result).toBe('win')
		expect(p?.lifeGained).toBe(1)
	})

	it('does NOT crown while a higher-confidence pick is unplayed — the 1f0d292d mis-crowning', async () => {
		// Mirrors the incident: rank-1 pick on an UNPLAYED fixture, rank-2 on a
		// played one. The gameweek is incomplete → no winner, no payout, game stays
		// active. Guards against premature cup completion (e.g. stale code).
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'Aaa', shortName: 'AAA', fifaPot: 2 })
		const b = await makeTeam({ name: 'Bbb', shortName: 'BBB', fifaPot: 2 })
		const c = await makeTeam({ name: 'Ccc', shortName: 'CCC', fifaPot: 2 })
		const d = await makeTeam({ name: 'Ddd', shortName: 'DDD', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxPlayed = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const fxUnplayed = await makeFixture({ roundId: r1, homeTeamId: c, awayTeamId: d })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gp1 = await makePlayer({ gameId, userId: 'u-1', livesRemaining: 0 })
		const gp2 = await makePlayer({ gameId, userId: 'u-2', livesRemaining: 0 })
		// rank-1 on the UNPLAYED fixture for both; rank-2 on the played one.
		await makePick({
			gameId,
			gamePlayerId: gp1,
			roundId: r1,
			teamId: c,
			fixtureId: fxUnplayed,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gp1,
			roundId: r1,
			teamId: a,
			fixtureId: fxPlayed,
			confidenceRank: 2,
		})
		await makePick({
			gameId,
			gamePlayerId: gp2,
			roundId: r1,
			teamId: d,
			fixtureId: fxUnplayed,
			confidenceRank: 1,
		})
		await makePick({
			gameId,
			gamePlayerId: gp2,
			roundId: r1,
			teamId: b,
			fixtureId: fxPlayed,
			confidenceRank: 2,
		})

		await finishFixture(fxPlayed, 1, 0)
		await settleFixture(fxPlayed)

		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active') // gameweek incomplete → not crowned
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts).toHaveLength(0)
		// the rank-2 (played) pick stays pending behind the unplayed rank-1.
		const r2 = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gp1), eq(pick.confidenceRank, 2)),
		})
		expect(r2?.result).toBe('pending')
	})

	it('does NOT eliminate a player whose streak breaks — a frozen streak still competes', async () => {
		// The 1f0d292d "Feargal" incident: a played losing pick broke his streak,
		// so he was marked eliminated mid-gameweek. But cup is won by the LONGEST
		// streak (checkCupCompletion counts every player, broken or not), and other
		// still-unplayed results may leave his frozen streak the winner. Cup must
		// never eliminate on a streak break — it ranks by streak, like turbo.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'Aaa', shortName: 'AAA', fifaPot: 2 })
		const b = await makeTeam({ name: 'Bbb', shortName: 'BBB', fifaPot: 2 })
		const c = await makeTeam({ name: 'Ccc', shortName: 'CCC', fifaPot: 2 })
		const d = await makeTeam({ name: 'Ddd', shortName: 'DDD', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxPlayed = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const fxUnplayed = await makeFixture({ roundId: r1, homeTeamId: c, awayTeamId: d })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpHero = await makePlayer({ gameId, userId: 'u-hero', livesRemaining: 0 })
		const gpFiller = await makePlayer({ gameId, userId: 'u-filler', livesRemaining: 0 })
		// hero rank-1 on the PLAYED fixture (will LOSE → streak breaks at rank 1);
		// rank-2 on the unplayed fixture keeps the gameweek incomplete.
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: a,
			fixtureId: fxPlayed,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpHero,
			roundId: r1,
			teamId: c,
			fixtureId: fxUnplayed,
			confidenceRank: 2,
		})
		await makePick({
			gameId,
			gamePlayerId: gpFiller,
			roundId: r1,
			teamId: d,
			fixtureId: fxUnplayed,
			confidenceRank: 1,
		})

		// AAA (hero's rank-1) LOSES 0-2 → streak broken at rank 1.
		await finishFixture(fxPlayed, 0, 2)
		await settleFixture(fxPlayed)

		const heroPick = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gpHero), eq(pick.confidenceRank, 1)),
		})
		expect(heroPick?.result).toBe('loss') // the streak did break...
		const hero = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpHero) })
		expect(hero?.status).toBe('alive') // ...but the player is NOT eliminated
	})

	it('self-heals: re-settle revives a cup player wrongly eliminated by a streak break, but keeps admin removals', async () => {
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const a = await makeTeam({ name: 'Aaa', shortName: 'AAA', fifaPot: 2 })
		const b = await makeTeam({ name: 'Bbb', shortName: 'BBB', fifaPot: 2 })
		const r1 = await makeRound(compId, { number: 1, status: 'open' })
		const fxPlayed = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })
		const fxUnplayed = await makeFixture({ roundId: r1, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'cup',
			currentRoundId: r1,
			modeConfig: { numberOfPicks: 2, startingLives: 0 },
		})
		const gpStreak = await makePlayer({ gameId, userId: 'u-streak', livesRemaining: 0 })
		const gpAdmin = await makePlayer({ gameId, userId: 'u-admin-rm', livesRemaining: 0 })
		// Simulate the old buggy state: both pre-marked eliminated. Only the
		// admin-removed one should stay eliminated after re-settle.
		await db
			.update(gamePlayer)
			.set({ status: 'eliminated', eliminatedRoundId: r1, eliminatedReason: null })
			.where(eq(gamePlayer.id, gpStreak))
		await db
			.update(gamePlayer)
			.set({ status: 'eliminated', eliminatedRoundId: r1, eliminatedReason: 'admin_removed' })
			.where(eq(gamePlayer.id, gpAdmin))
		await makePick({
			gameId,
			gamePlayerId: gpStreak,
			roundId: r1,
			teamId: a,
			fixtureId: fxPlayed,
			confidenceRank: 1,
			predictedResult: 'home_win',
		})
		await makePick({
			gameId,
			gamePlayerId: gpStreak,
			roundId: r1,
			teamId: a,
			fixtureId: fxUnplayed,
			confidenceRank: 2,
		})

		await finishFixture(fxPlayed, 2, 0)
		await settleFixture(fxPlayed)

		const streak = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStreak) })
		expect(streak?.status).toBe('alive') // streak-break elimination undone
		expect(streak?.eliminatedRoundId).toBeNull()
		const admin = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpAdmin) })
		expect(admin?.status).toBe('eliminated') // admin removal preserved
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

/* ────────────────────────────────────────────────────────────────────── */
/* WC knockout bracket self-heal (Tier 2 derive + Tier 1 team-pair adopt)  */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Runs the REAL syncCompetition against Postgres with a mocked football-data
 * `fetch`, proving the end-to-end bracket self-heal that the R16 pre-draw
 * incident needed:
 *   - Tier 2: undrawn knockout ties are derived from finished feeders and
 *     seeded as UNBOUND fixtures, so all teams are pickable before the deadline.
 *   - deadline: the knockout round carries a deadline from the (TBD) schedule.
 *   - Tier 1: when the source later draws a tie, the provisional fixture is
 *     bound by team pair (externalId set) — no duplicate.
 */
describe('lifecycle: WC knockout bracket self-heal', () => {
	// 16 R32 matches (ids 415..430), home team wins each. Consecutive winner
	// pairs form the 8 R16 ties. We draw 5 in the source and leave 3 TBD.
	const R32 = Array.from({ length: 16 }, (_, i) => ({
		id: 415 + i,
		matchday: null,
		stage: 'LAST_32',
		homeTeam: { id: 900 + i, name: `SmokeW${i}`, tla: `W${i}`, crest: '' },
		awayTeam: { id: 950 + i, name: `SmokeL${i}`, tla: `L${i}`, crest: '' },
		utcDate: `2026-06-2${8 + (i % 2)}T1${i % 8}:00:00Z`,
		status: 'FINISHED',
		score: { winner: 'HOME_TEAM', fullTime: { home: 1, away: 0 } },
	}))
	// tie j = winners of R32 pair (2j, 2j+1) → home W(2j), away W(2j+1).
	const tieTeams = (j: number) => ({
		home: { id: 900 + 2 * j, name: `SmokeW${2 * j}`, tla: `W${2 * j}`, crest: '' },
		away: { id: 900 + 2 * j + 1, name: `SmokeW${2 * j + 1}`, tla: `W${2 * j + 1}`, crest: '' },
	})
	const TBD = { id: null, name: null, tla: null, crest: null }
	// Ties drawn by the source below are 0,1,3,4,6 → undrawn (seeded) are 2,5,7.
	function r16Match(slotIndex: number, tieIndex: number, drawn: boolean) {
		const t = tieTeams(tieIndex)
		return {
			id: 537375 + slotIndex,
			matchday: null,
			stage: 'LAST_16',
			homeTeam: drawn ? t.home : TBD,
			awayTeam: drawn ? t.away : TBD,
			utcDate: `2026-07-0${4 + (slotIndex % 4)}T17:00:00Z`,
			status: 'TIMED',
			score: { fullTime: { home: null, away: null } },
		}
	}
	// slot→tie assignment: drawn slots carry a real tie; TBD slots carry no teams.
	const R16 = [
		r16Match(0, 0, true),
		r16Match(1, 1, true),
		r16Match(2, 2, false),
		r16Match(3, 3, true),
		r16Match(4, 4, true),
		r16Match(5, 5, false),
		r16Match(6, 6, true),
		r16Match(7, 7, false),
	]

	function mockFetch(matches: unknown[]) {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const s = typeof url === 'string' ? url : url.toString()
			if (s.includes('/standings'))
				return Promise.resolve(new Response(JSON.stringify({ standings: [] })))
			return Promise.resolve(new Response(JSON.stringify({ matches })))
		})
	}

	async function wcComp(): Promise<string> {
		const [c] = await db
			.insert(competition)
			.values({
				name: 'Smoke WC',
				type: 'group_knockout',
				dataSource: 'football_data',
				externalId: 'WC',
				status: 'active',
			})
			.returning()
		return c.id
	}

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('derives + seeds the 3 undrawn R16 ties (unbound) with a real deadline', async () => {
		const compId = await wcComp()
		mockFetch([...R32, ...R16])
		const [c] = await db.select().from(competition).where(eq(competition.id, compId))

		await syncCompetition(c, { footballDataApiKey: 'test-key' })

		const [r16] = await db
			.select()
			.from(roundTable)
			.where(and(eq(roundTable.competitionId, compId), eq(roundTable.name, 'Round of 16')))
		expect(r16).toBeDefined()
		// Round has a deadline even though only some ties were drawn.
		expect(r16.deadline).not.toBeNull()

		const fixtures = await db.select().from(fixtureTable).where(eq(fixtureTable.roundId, r16.id))
		expect(fixtures).toHaveLength(8)
		const provisional = fixtures.filter((f) => f.externalId == null)
		expect(provisional).toHaveLength(3)

		// The provisional fixtures are exactly the undrawn ties (2,5,7) → winner
		// pairs (W4,W5),(W10,W11),(W14,W15).
		const teams = await db.select().from(teamTable)
		const tla = (id: string | null) => teams.find((t) => t.id === id)?.shortName
		const provPairs = provisional
			.map((f) => [tla(f.homeTeamId), tla(f.awayTeamId)].sort().join('-'))
			.sort()
		expect(provPairs).toEqual(['W10-W11', 'W14-W15', 'W4-W5'].sort())
	})

	it('binds a provisional tie to the real match by team pair when the source draws it (no duplicate)', async () => {
		const compId = await wcComp()
		mockFetch([...R32, ...R16])
		const [c] = await db.select().from(competition).where(eq(competition.id, compId))
		await syncCompetition(c, { footballDataApiKey: 'test-key' })

		// Source now draws slot 2 (id 537377) as tie 2 = (W4,W5).
		const R16drawn2 = R16.map((m, i) => (i === 2 ? r16Match(2, 2, true) : m))
		mockFetch([...R32, ...R16drawn2])
		await syncCompetition(c, { footballDataApiKey: 'test-key' })

		const [r16] = await db
			.select()
			.from(roundTable)
			.where(and(eq(roundTable.competitionId, compId), eq(roundTable.name, 'Round of 16')))
		const fixtures = await db.select().from(fixtureTable).where(eq(fixtureTable.roundId, r16.id))
		// No duplicate — still 8 fixtures.
		expect(fixtures).toHaveLength(8)
		// The (W4,W5) tie is now bound to 537377, and only 2 provisional remain.
		expect(fixtures.filter((f) => f.externalId == null)).toHaveLength(2)
		const bound537377 = fixtures.find((f) => f.externalId === '537377')
		expect(bound537377).toBeDefined()
		const teams = await db.select().from(teamTable)
		const tla = (id: string | null) => teams.find((t) => t.id === id)?.shortName
		expect(
			[tla(bound537377?.homeTeamId ?? null), tla(bound537377?.awayTeamId ?? null)].sort(),
		).toEqual(['W4', 'W5'].sort())
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* PL season rollover — season-safe sync identity                          */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Runs the REAL syncCompetition + mergeFootballDataIds against Postgres,
 * proving a second-season sync is structurally unable to touch the first
 * season's rows (the 2026/27 silent-corruption incident):
 *   - FPL fixture ids restart every season (1..380) — the upsert must only
 *     ever find rows inside the competition being synced.
 *   - FPL team ids restart too and get reassigned across clubs, so team
 *     resolution must go through the current payload, never per-season ids
 *     stored on team rows from an earlier season.
 *   - Promoted clubs are new rows whose badge comes from the football-data
 *     crest (the FPL badge CDN 404s for newly promoted clubs); relegated
 *     clubs' rows are left dormant.
 *
 * The first-season competition deliberately stays ACTIVE — the scoping must
 * hold structurally, not by leaning on the archived-status guard.
 */
describe('lifecycle: PL season rollover sync identity', () => {
	// Season 1 clubs, FPL ids assigned alphabetically. Dorne/Elm/Fern are
	// relegated after season 1; Grove/Holt/Isley come up. FPL then reassigns
	// ids alphabetically again, so ids 4-6 point at DIFFERENT clubs in season
	// 2 — the stale-id trap.
	const S1_CLUBS = [
		{ id: 1, name: 'Alder FC', short_name: 'ALD', code: 11, fdId: 101 },
		{ id: 2, name: 'Birch FC', short_name: 'BIR', code: 12, fdId: 102 },
		{ id: 3, name: 'Cedar FC', short_name: 'CED', code: 13, fdId: 103 },
		{ id: 4, name: 'Dorne FC', short_name: 'DOR', code: 14, fdId: 104 },
		{ id: 5, name: 'Elm FC', short_name: 'ELM', code: 15, fdId: 105 },
		{ id: 6, name: 'Fern FC', short_name: 'FER', code: 16, fdId: 106 },
	]
	const S2_CLUBS = [
		{ id: 1, name: 'Alder FC', short_name: 'ALD', code: 11, fdId: 101 },
		{ id: 2, name: 'Birch FC', short_name: 'BIR', code: 12, fdId: 102 },
		{ id: 3, name: 'Cedar FC', short_name: 'CED', code: 13, fdId: 103 },
		{ id: 4, name: 'Grove FC', short_name: 'GRO', code: 24, fdId: 107 },
		{ id: 5, name: 'Holt FC', short_name: 'HOL', code: 25, fdId: 108 },
		{ id: 6, name: 'Isley FC', short_name: 'ISL', code: 26, fdId: 109 },
	]

	// Season 1: one finished gameweek, fixture ids 1-3, with final scores.
	const S1_FPL = {
		bootstrap: {
			teams: S1_CLUBS.map(({ fdId: _fdId, ...t }) => t),
			events: [
				{ id: 1, name: 'Gameweek 1', deadline_time: '2025-08-15T17:30:00Z', finished: true },
			],
		},
		fixtures: [
			{ id: 1, event: 1, team_h: 1, team_a: 2, kickoff_time: '2025-08-16T14:00:00Z', h: 2, a: 0 },
			{ id: 2, event: 1, team_h: 3, team_a: 4, kickoff_time: '2025-08-16T16:30:00Z', h: 1, a: 1 },
			{ id: 3, event: 1, team_h: 5, team_a: 6, kickoff_time: '2025-08-17T13:00:00Z', h: 0, a: 3 },
		].map((f) => ({
			id: f.id,
			event: f.event,
			team_h: f.team_h,
			team_a: f.team_a,
			kickoff_time: f.kickoff_time,
			started: true,
			finished: true,
			finished_provisional: true,
			team_h_score: f.h,
			team_a_score: f.a,
		})),
	}

	// Season 2: fixture ids RESTART at 1, scheduled, no scores. Payload team
	// id 4 is now the promoted Grove FC (was Dorne FC in season 1).
	const S2_FPL = {
		bootstrap: {
			teams: S2_CLUBS.map(({ fdId: _fdId, ...t }) => t),
			events: [
				{ id: 1, name: 'Gameweek 1', deadline_time: '2026-08-21T17:30:00Z', finished: false },
			],
		},
		fixtures: [
			{ id: 1, event: 1, team_h: 1, team_a: 4, kickoff_time: '2026-08-22T14:00:00Z' },
			{ id: 2, event: 1, team_h: 2, team_a: 5, kickoff_time: '2026-08-22T16:30:00Z' },
			{ id: 3, event: 1, team_h: 3, team_a: 6, kickoff_time: '2026-08-23T13:00:00Z' },
		].map((f) => ({
			id: f.id,
			event: f.event,
			team_h: f.team_h,
			team_a: f.team_a,
			kickoff_time: f.kickoff_time,
			started: false,
			finished: false,
			finished_provisional: false,
			team_h_score: null,
			team_a_score: null,
		})),
	}

	const fdCrest = (tla: string) => `https://crests.example/${tla.toLowerCase()}.png`
	const fdTeam = (club: (typeof S1_CLUBS)[number]) => ({
		id: club.fdId,
		name: club.name,
		tla: club.short_name,
		crest: fdCrest(club.short_name),
	})
	const clubByFplId = (clubs: typeof S1_CLUBS, id: number) => {
		const club = clubs.find((c) => c.id === id)
		if (!club) throw new Error(`no club with fpl id ${id}`)
		return club
	}

	// football-data mirror of each season, for the merge step. fd match ids
	// are globally unique across seasons (unlike FPL's).
	const S1_FD_MATCHES = S1_FPL.fixtures.map((f, i) => ({
		id: 9001 + i,
		matchday: 1,
		homeTeam: fdTeam(clubByFplId(S1_CLUBS, f.team_h)),
		awayTeam: fdTeam(clubByFplId(S1_CLUBS, f.team_a)),
		utcDate: f.kickoff_time,
		status: 'FINISHED',
		score: { fullTime: { home: f.team_h_score, away: f.team_a_score } },
	}))
	const S2_FD_MATCHES = S2_FPL.fixtures.map((f, i) => ({
		id: 9101 + i,
		matchday: 1,
		homeTeam: fdTeam(clubByFplId(S2_CLUBS, f.team_h)),
		awayTeam: fdTeam(clubByFplId(S2_CLUBS, f.team_a)),
		utcDate: f.kickoff_time,
		status: 'TIMED',
		score: { fullTime: { home: null, away: null } },
	}))

	function mockFdFetch(matches: unknown[]) {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const s = typeof url === 'string' ? url : url.toString()
			if (s.includes('/standings'))
				return Promise.resolve(new Response(JSON.stringify({ standings: [] })))
			return Promise.resolve(new Response(JSON.stringify({ matches })))
		})
	}

	async function makeSeasonComp(name: string): Promise<typeof competition.$inferSelect> {
		const [c] = await db
			.insert(competition)
			.values({ name, type: 'league', dataSource: 'fpl', status: 'active' })
			.returning()
		return c
	}

	/** Sync + merge season 1, snapshot its rows, then sync + merge season 2. */
	async function runRollover() {
		const c1 = await makeSeasonComp('Smoke PL 2025/26')
		await syncCompetition(c1, { fplData: S1_FPL })
		mockFdFetch(S1_FD_MATCHES)
		await mergeFootballDataIds(c1, 'test-key')

		const s1Rounds = await db
			.select()
			.from(roundTable)
			.where(eq(roundTable.competitionId, c1.id))
			.orderBy(roundTable.number)
		const s1Fixtures = await db
			.select()
			.from(fixtureTable)
			.where(
				inArray(
					fixtureTable.roundId,
					s1Rounds.map((r) => r.id),
				),
			)
			.orderBy(fixtureTable.externalId)
		const s1Teams = await db.select().from(teamTable).orderBy(teamTable.name)

		const c2 = await makeSeasonComp('Smoke PL 2026/27')
		const syncSecondSeason = async () => {
			await syncCompetition(c2, { fplData: S2_FPL })
		}
		const mergeSecondSeason = async () => {
			mockFdFetch(S2_FD_MATCHES)
			await mergeFootballDataIds(c2, 'test-key')
		}
		return { c1, c2, s1Rounds, s1Fixtures, s1Teams, syncSecondSeason, mergeSecondSeason }
	}

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('leaves the first season’s fixture and round rows byte-for-byte untouched', async () => {
		const { c1, s1Rounds, s1Fixtures, syncSecondSeason, mergeSecondSeason } = await runRollover()
		await syncSecondSeason()
		await mergeSecondSeason()

		const roundsAfter = await db
			.select()
			.from(roundTable)
			.where(eq(roundTable.competitionId, c1.id))
			.orderBy(roundTable.number)
		const fixturesAfter = await db
			.select()
			.from(fixtureTable)
			.where(
				inArray(
					fixtureTable.roundId,
					roundsAfter.map((r) => r.id),
				),
			)
			.orderBy(fixtureTable.externalId)
		expect(roundsAfter).toEqual(s1Rounds)
		expect(fixturesAfter).toEqual(s1Fixtures)
	})

	it('cannot collide restarted external ids — the upsert only finds in-competition rows', async () => {
		const { c1, c2, syncSecondSeason } = await runRollover()
		await syncSecondSeason()

		// Both seasons hold fixtures with external ids 1-3, on distinct rows.
		for (const comp of [c1, c2]) {
			const rounds = await db.select().from(roundTable).where(eq(roundTable.competitionId, comp.id))
			const fixtures = await db
				.select()
				.from(fixtureTable)
				.where(
					inArray(
						fixtureTable.roundId,
						rounds.map((r) => r.id),
					),
				)
			expect(fixtures.map((f) => f.externalId).sort()).toEqual(['1', '2', '3'])
		}
	})

	it('attaches new-season fixtures to the correct club rows via the payload, not stale team ids', async () => {
		const { c2, s1Teams, syncSecondSeason } = await runRollover()
		await syncSecondSeason()

		const teams = await db.select().from(teamTable)
		const byName = (name: string) => {
			const t = teams.find((row) => row.name === name)
			if (!t) throw new Error(`missing team row: ${name}`)
			return t
		}
		const [r2] = await db.select().from(roundTable).where(eq(roundTable.competitionId, c2.id))
		const fixtures = await db.select().from(fixtureTable).where(eq(fixtureTable.roundId, r2.id))
		const byExternalId = (id: string) => {
			const f = fixtures.find((row) => row.externalId === id)
			if (!f) throw new Error(`missing season-2 fixture ${id}`)
			return f
		}

		// Payload id 4 is Grove FC this season. A stale-id lookup would resolve
		// it to Dorne FC (relegated, still holding fpl id 4 from season 1).
		expect(byExternalId('1').homeTeamId).toBe(byName('Alder FC').id)
		expect(byExternalId('1').awayTeamId).toBe(byName('Grove FC').id)
		expect(byExternalId('1').awayTeamId).not.toBe(byName('Dorne FC').id)
		expect(byExternalId('2').awayTeamId).toBe(byName('Holt FC').id)
		expect(byExternalId('3').awayTeamId).toBe(byName('Isley FC').id)

		// Promoted clubs are NEW rows — no season-1 row was renamed or reused.
		const s1Ids = new Set(s1Teams.map((t) => t.id))
		for (const name of ['Grove FC', 'Holt FC', 'Isley FC']) {
			expect(s1Ids.has(byName(name).id)).toBe(false)
		}
	})

	it('creates promoted clubs with football-data crest badges and leaves relegated rows dormant', async () => {
		const { s1Teams, syncSecondSeason, mergeSecondSeason } = await runRollover()
		await syncSecondSeason()

		// After the sync (before the fd merge) a promoted club must NOT carry
		// the FPL badge CDN URL — it 404s for newly promoted clubs. It stays
		// empty until the merge lands the crest, so the UI colour fallback
		// applies rather than a broken image.
		const teamsAfterSync = await db.select().from(teamTable)
		for (const name of ['Grove FC', 'Holt FC', 'Isley FC']) {
			const t = teamsAfterSync.find((row) => row.name === name)
			expect(t?.badgeUrl ?? null).toBeNull()
		}

		await mergeSecondSeason()

		const teams = await db.select().from(teamTable)
		expect(teams.find((t) => t.name === 'Grove FC')?.badgeUrl).toBe(fdCrest('GRO'))
		expect(teams.find((t) => t.name === 'Holt FC')?.badgeUrl).toBe(fdCrest('HOL'))
		expect(teams.find((t) => t.name === 'Isley FC')?.badgeUrl).toBe(fdCrest('ISL'))

		// A later daily sync (without its merge step — the merge is exactly what
		// fails loudly on a new-season tla gap) must not stomp the crest with
		// the 404ing FPL badge URL.
		await syncSecondSeason()
		const teamsAfterResync = await db.select().from(teamTable)
		for (const name of ['Grove FC', 'Holt FC', 'Isley FC']) {
			const club = S2_CLUBS.find((c) => c.name === name)
			if (!club) throw new Error(`unknown club ${name}`)
			expect(teamsAfterResync.find((t) => t.name === name)?.badgeUrl).toBe(fdCrest(club.short_name))
		}

		// Relegated clubs' rows are untouched by the whole second-season run —
		// stale external ids and all.
		for (const name of ['Dorne FC', 'Elm FC', 'Fern FC']) {
			const before = s1Teams.find((t) => t.name === name)
			const after = teams.find((t) => t.name === name)
			expect(after).toEqual(before)
		}
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* PL season rollover: automatic detection + competition archival          */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: PL season rollover auto-detection', () => {
	// Two seasons of pre-fetched FPL payloads. Season 2 relegates Cedar/Dorne,
	// promotes Grove/Holt, and — the FPL trap — restarts fixture and team ids.
	const S1_CLUBS = [
		{ id: 1, name: 'Alder FC', short_name: 'ALD', code: 11 },
		{ id: 2, name: 'Birch FC', short_name: 'BIR', code: 12 },
		{ id: 3, name: 'Cedar FC', short_name: 'CED', code: 13 },
		{ id: 4, name: 'Dorne FC', short_name: 'DOR', code: 14 },
	]
	const S2_CLUBS = [
		{ id: 1, name: 'Alder FC', short_name: 'ALD', code: 11 },
		{ id: 2, name: 'Birch FC', short_name: 'BIR', code: 12 },
		{ id: 3, name: 'Grove FC', short_name: 'GRO', code: 24 },
		{ id: 4, name: 'Holt FC', short_name: 'HOL', code: 25 },
	]

	const fplPayload = (clubs: typeof S1_CLUBS, gw1Deadline: string, kickoffs: [string, string]) => ({
		bootstrap: {
			teams: clubs,
			events: [{ id: 1, name: 'Gameweek 1', deadline_time: gw1Deadline, finished: false }],
		},
		fixtures: [
			{ id: 1, team_h: 1, team_a: 3, kickoff_time: kickoffs[0] },
			{ id: 2, team_h: 2, team_a: 4, kickoff_time: kickoffs[1] },
		].map((f) => ({
			...f,
			event: 1,
			started: false,
			finished: false,
			finished_provisional: false,
			team_h_score: null,
			team_a_score: null,
		})),
	})

	// FPL still on 2025/26 (GW1 deadline in 2025)…
	const S1_FPL = fplPayload(S1_CLUBS, '2025-08-15T17:30:00Z', [
		'2025-08-16T14:00:00Z',
		'2025-08-16T16:30:00Z',
	])
	// …and the 2026/27 payload after the sources flip.
	const S2_FPL = fplPayload(S2_CLUBS, '2026-08-21T17:30:00Z', [
		'2026-08-22T14:00:00Z',
		'2026-08-22T16:30:00Z',
	])

	/** Serve football-data's competition-detail endpoint (season detection). */
	function mockFdCurrentSeason(currentSeason: { startDate: string; endDate: string } | null) {
		vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
			const s = typeof url === 'string' ? url : url.toString()
			if (s.endsWith('/competitions/PL'))
				return Promise.resolve(new Response(JSON.stringify({ currentSeason })))
			return Promise.resolve(new Response('Not found', { status: 404 }))
		})
	}

	async function seedPredecessor(): Promise<typeof competition.$inferSelect> {
		const [c] = await db
			.insert(competition)
			.values({
				name: 'Premier League 2025/26',
				type: 'league',
				dataSource: 'fpl',
				season: '2025/26',
				status: 'active',
			})
			.returning()
		return c
	}

	const compRounds = (competitionId: string) =>
		db.select().from(roundTable).where(eq(roundTable.competitionId, competitionId))
	const roundFixtures = (roundIds: string[]) =>
		roundIds.length === 0
			? Promise.resolve([])
			: db.select().from(fixtureTable).where(inArray(fixtureTable.roundId, roundIds))

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('rolls over: creates "Premier League 2026/27", archives the predecessor, and populates the new competition only', async () => {
		const predecessor = await seedPredecessor()
		await syncCompetition(predecessor, { fplData: S1_FPL })
		const s1Rounds = await compRounds(predecessor.id)
		const s1Fixtures = await roundFixtures(s1Rounds.map((r) => r.id))
		expect(s1Fixtures).toHaveLength(2)

		mockFdCurrentSeason({ startDate: '2026-08-14', endDate: '2027-05-23' })
		const current = await ensureCurrentPlSeasonCompetition({
			footballDataApiKey: 'test-key',
			fplData: S2_FPL,
		})

		expect(current.name).toBe('Premier League 2026/27')
		expect(current.season).toBe('2026/27')
		expect(current.status).toBe('active')
		expect(current.id).not.toBe(predecessor.id)

		const archived = await db.query.competition.findFirst({
			where: eq(competition.id, predecessor.id),
		})
		expect(archived?.status).toBe('archived')

		// The sync lands rounds/fixtures/teams on the NEW competition only.
		await syncCompetition(current, { fplData: S2_FPL })
		const s2Rounds = await compRounds(current.id)
		expect(s2Rounds).toHaveLength(1)
		const s2Fixtures = await roundFixtures(s2Rounds.map((r) => r.id))
		expect(s2Fixtures).toHaveLength(2)
		const teams = await db.select().from(teamTable)
		expect(teams.map((t) => t.name).sort()).toEqual([
			'Alder FC',
			'Birch FC',
			'Cedar FC',
			'Dorne FC',
			'Grove FC',
			'Holt FC',
		])

		// The archived predecessor's rows are byte-for-byte untouched.
		expect(await compRounds(predecessor.id)).toEqual(s1Rounds)
		expect(await roundFixtures(s1Rounds.map((r) => r.id))).toEqual(s1Fixtures)
	})

	it('re-running the sync after rollover is idempotent — no duplicate competitions', async () => {
		const predecessor = await seedPredecessor()
		mockFdCurrentSeason({ startDate: '2026-08-14', endDate: '2027-05-23' })

		const first = await ensureCurrentPlSeasonCompetition({
			footballDataApiKey: 'test-key',
			fplData: S2_FPL,
		})
		await syncCompetition(first, { fplData: S2_FPL })

		const again = await ensureCurrentPlSeasonCompetition({
			footballDataApiKey: 'test-key',
			fplData: S2_FPL,
		})
		await syncCompetition(again, { fplData: S2_FPL })

		expect(again.id).toBe(first.id)
		const fplComps = await db.select().from(competition).where(eq(competition.dataSource, 'fpl'))
		expect(fplComps).toHaveLength(2) // predecessor + current, nothing else
		expect(fplComps.find((c) => c.id === predecessor.id)?.status).toBe('archived')
		expect(fplComps.filter((c) => c.season === '2026/27')).toHaveLength(1)
		// Re-sync did not duplicate rounds or fixtures either.
		const rounds = await compRounds(first.id)
		expect(rounds).toHaveLength(1)
		expect(await roundFixtures(rounds.map((r) => r.id))).toHaveLength(2)
	})

	it('a source season disagreement aborts loudly with no writes', async () => {
		const predecessor = await seedPredecessor()
		// football-data has flipped to 2026/27 but FPL still serves 2025/26.
		mockFdCurrentSeason({ startDate: '2026-08-14', endDate: '2027-05-23' })

		await expect(
			ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'test-key', fplData: S1_FPL }),
		).rejects.toThrow(SeasonDetectionError)

		const comps = await db.select().from(competition)
		expect(comps).toEqual([predecessor]) // untouched: still active, still alone
		expect(await db.select().from(roundTable)).toHaveLength(0)
		expect(await db.select().from(teamTable)).toHaveLength(0)
	})

	it('a missing football-data currentSeason aborts loudly with no writes', async () => {
		const predecessor = await seedPredecessor()
		mockFdCurrentSeason(null)

		await expect(
			ensureCurrentPlSeasonCompetition({ footballDataApiKey: 'test-key', fplData: S2_FPL }),
		).rejects.toThrow(SeasonDetectionError)

		const comps = await db.select().from(competition)
		expect(comps).toEqual([predecessor])
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* deadline no-pick lock + crown guard                                     */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: deadline no-pick lock + crown guard', () => {
	/**
	 * The Barry race (WC LPS final incident): the last round's fixture finishes
	 * minutes after the deadline while an alive player has made no pick AND has
	 * no unused team left to auto-pick. Without deadline-time no-pick
	 * processing, rounds-exhausted completion crowned the pickless player as a
	 * co-winner (the daily sync that would have eliminated them ran hours after
	 * the final settled). The crown guard must run the lock before evaluating
	 * winners, so the pickless finalist is eliminated in that round and the
	 * sole survivor is crowned alone — the split outcome cannot occur.
	 */
	it('the Barry race: pickless finalist with no legal team is eliminated, sole survivor crowned alone', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const e = await makeTeam({ name: 'E', shortName: 'E' })
		const f = await makeTeam({ name: 'F', shortName: 'F' })

		// Two completed history rounds, then round 3 is the FINAL round — no
		// round 4 exists, so completing r3 evaluates rounds-exhausted.
		const r1 = await makeRound(compId, { number: 1, status: 'completed' })
		const r2 = await makeRound(compId, { number: 2, status: 'completed' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'open',
			deadline: new Date(Date.now() - 3_600_000), // deadline an hour ago
		})
		const fxR1 = await makeFixture({
			roundId: r1,
			homeTeamId: a,
			awayTeamId: d,
			status: 'finished',
			homeScore: 2,
			awayScore: 0,
		})
		const fxR2be = await makeFixture({
			roundId: r2,
			homeTeamId: b,
			awayTeamId: e,
			status: 'finished',
			homeScore: 2,
			awayScore: 0,
		})
		const fxR2cf = await makeFixture({
			roundId: r2,
			homeTeamId: c,
			awayTeamId: f,
			status: 'finished',
			homeScore: 1,
			awayScore: 0,
		})
		const fxFinal = await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r3,
			modeConfig: { allowRebuys: false },
		})
		const gpWin = await makePlayer({ gameId, userId: 'u-win' })
		const gpPickless = await makePlayer({ gameId, userId: 'u-pickless' })
		await makePayment({ gameId, userId: 'u-win' })
		await makePayment({ gameId, userId: 'u-pickless' })

		// History: both players won rounds 1 + 2 with EQUAL total winning goals,
		// so a wrong rounds-exhausted completion would split the pot between
		// them (the production outcome this scenario locks out).
		const winR1 = await makePick({
			gameId,
			gamePlayerId: gpWin,
			roundId: r1,
			teamId: a,
			fixtureId: fxR1,
		})
		const picklessR1 = await makePick({
			gameId,
			gamePlayerId: gpPickless,
			roundId: r1,
			teamId: a,
			fixtureId: fxR1,
		})
		const winR2 = await makePick({
			gameId,
			gamePlayerId: gpWin,
			roundId: r2,
			teamId: c,
			fixtureId: fxR2cf,
		})
		const picklessR2 = await makePick({
			gameId,
			gamePlayerId: gpPickless,
			roundId: r2,
			teamId: b,
			fixtureId: fxR2be,
		})
		await db.update(pick).set({ result: 'win', goalsScored: 2 }).where(eq(pick.id, winR1))
		await db.update(pick).set({ result: 'win', goalsScored: 2 }).where(eq(pick.id, picklessR1))
		await db.update(pick).set({ result: 'win', goalsScored: 1 }).where(eq(pick.id, winR2))
		await db.update(pick).set({ result: 'win', goalsScored: 2 }).where(eq(pick.id, picklessR2))

		// Final round: the survivor picked B (their only unused finalist).
		// The pickless finalist made no pick — and has already used both A and B, so no legal
		// auto-pick exists.
		await makePick({ gameId, gamePlayerId: gpWin, roundId: r3, teamId: b, fixtureId: fxFinal })

		// The final finishes minutes after the deadline: B wins 1-0 away.
		await finishFixture(fxFinal, 0, 1)
		await settleFixture(fxFinal)

		// The pickless finalist is eliminated in the final round — not crowned.
		const pickless = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpPickless) })
		expect(pickless?.status).toBe('eliminated')
		expect(pickless?.eliminatedReason).toBe('no_pick_no_fallback')
		expect(pickless?.eliminatedRoundId).toBe(r3)
		// No auto-pick was possible — no pick row appears for them in r3.
		const picklessFinalPick = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gpPickless), eq(pick.roundId, r3)),
		})
		expect(picklessFinalPick).toBeUndefined()

		// The sole survivor is crowned alone with the full pot — no split.
		const winner = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpWin) })
		expect(winner?.status).toBe('winner')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('completed')
		const payouts = await db.query.payout.findMany({ where: eq(payout.gameId, gameId) })
		expect(payouts).toHaveLength(1)
		expect(payouts[0].userId).toBe('u-win')
		expect(payouts[0].amount).toBe('20.00')
		expect(payouts[0].isSplit).toBe(false)
	})

	it('does nothing before the deadline — a rescheduled fixture finishing early cannot trigger the lock', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A' })
		const b = await makeTeam({ name: 'B', shortName: 'B' })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000), // deadline tomorrow
		})
		const fxAB = await makeFixture({ roundId: r3, homeTeamId: a, awayTeamId: b })
		await makeFixture({ roundId: r3, homeTeamId: c, awayTeamId: d })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r3,
			modeConfig: { allowRebuys: false },
		})
		const gpPicked = await makePlayer({ gameId, userId: 'u-picked' })
		const gpNoPick = await makePlayer({ gameId, userId: 'u-nopick' })
		await makePick({ gameId, gamePlayerId: gpPicked, roundId: r3, teamId: a, fixtureId: fxAB })

		// The lock invoked directly (QStash clock skew, manual ops call) is a
		// no-op while the deadline is in the future.
		const direct = await processDeadlineLock([r3])
		expect(direct).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })

		// A fixture moved EARLIER than the round deadline (rescheduled PL match)
		// finishing must not fire the lock via the crown guard either.
		await finishFixture(fxAB, 2, 0)
		await settleFixture(fxAB)

		const noPickPlayer = await db.query.gamePlayer.findFirst({
			where: eq(gamePlayer.id, gpNoPick),
		})
		expect(noPickPlayer?.status).toBe('alive')
		const autoPick = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gpNoPick), eq(pick.roundId, r3)),
		})
		expect(autoPick).toBeUndefined()
	})

	it('assigns the worst-placed UNUSED team at deadline time, before any fixture kicks off', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A', leaguePosition: 2 })
		const b = await makeTeam({ name: 'B', shortName: 'B', leaguePosition: 18 })
		const c = await makeTeam({ name: 'C', shortName: 'C', leaguePosition: 9 })
		const d = await makeTeam({ name: 'D', shortName: 'D', leaguePosition: 14 })
		const r2 = await makeRound(compId, { number: 2, status: 'completed' })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'open',
			deadline: new Date(Date.now() - 60_000), // deadline just passed
		})
		const fxR2 = await makeFixture({
			roundId: r2,
			homeTeamId: b,
			awayTeamId: c,
			status: 'finished',
			homeScore: 1,
			awayScore: 0,
		})
		// Every round-3 fixture kicks off in the future — the lock fires at the
		// deadline, well before any result is known.
		const fxAB = await makeFixture({
			roundId: r3,
			homeTeamId: a,
			awayTeamId: b,
			kickoff: new Date(Date.now() + 2 * 3_600_000),
		})
		const fxCD = await makeFixture({
			roundId: r3,
			homeTeamId: c,
			awayTeamId: d,
			kickoff: new Date(Date.now() + 3 * 3_600_000),
		})

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r3,
			modeConfig: { allowRebuys: false },
		})
		const gpPicked = await makePlayer({ gameId, userId: 'u-picked' })
		const gpForgot = await makePlayer({ gameId, userId: 'u-forgot' })
		await makePick({ gameId, gamePlayerId: gpPicked, roundId: r3, teamId: a, fixtureId: fxAB })
		// The forgetful player already used B (the overall worst-placed team) in
		// round 2 — the auto-pick must fall to the worst-placed UNUSED team, D.
		const usedB = await makePick({
			gameId,
			gamePlayerId: gpForgot,
			roundId: r2,
			teamId: b,
			fixtureId: fxR2,
		})
		await db.update(pick).set({ result: 'win', goalsScored: 1 }).where(eq(pick.id, usedB))

		const result = await processDeadlineLock([r3])
		expect(result.autoPicksInserted).toBe(1)
		expect(result.playersEliminated).toBe(0)

		const autoPick = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gpForgot), eq(pick.roundId, r3)),
		})
		expect(autoPick?.teamId).toBe(d)
		expect(autoPick?.fixtureId).toBe(fxCD)
		expect(autoPick?.isAuto).toBe(true)
		expect(autoPick?.predictedResult).toBe('away_win')
		expect(autoPick?.result).toBe('pending')

		// Player stays alive; nothing has kicked off, let alone settled.
		const forgot = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpForgot) })
		expect(forgot?.status).toBe('alive')
		const r3Fixtures = await db.query.fixture.findMany({
			where: eq(fixtureTable.roundId, r3),
		})
		expect(r3Fixtures.every((fx) => fx.status === 'scheduled')).toBe(true)
	})

	it('is idempotent across the deadline trigger, daily-sync fallback and crown-guard invocations', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A', leaguePosition: 1 })
		const b = await makeTeam({ name: 'B', shortName: 'B', leaguePosition: 20 })
		const e = await makeTeam({ name: 'E', shortName: 'E', leaguePosition: 10 })
		const f = await makeTeam({ name: 'F', shortName: 'F', leaguePosition: 11 })
		const c = await makeTeam({ name: 'C', shortName: 'C' })
		const d = await makeTeam({ name: 'D', shortName: 'D' })
		const teamG = await makeTeam({ name: 'G', shortName: 'G' })
		const h = await makeTeam({ name: 'H', shortName: 'H' })

		// Four completed history rounds so one player can have consumed every
		// team appearing in the current round (A, B, E, F).
		const historyIds: string[] = []
		const historyRounds: Array<[string, string]> = [
			[a, c],
			[b, d],
			[e, teamG],
			[f, h],
		]
		const historyFixtures: string[] = []
		const rounds: string[] = []
		for (const [num, [home, away]] of historyRounds.entries()) {
			const r = await makeRound(compId, { number: num + 1, status: 'completed' })
			rounds.push(r)
			const fx = await makeFixture({
				roundId: r,
				homeTeamId: home,
				awayTeamId: away,
				status: 'finished',
				homeScore: 1,
				awayScore: 0,
			})
			historyFixtures.push(fx)
		}
		const r5 = await makeRound(compId, {
			number: 5,
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		const fxAB = await makeFixture({ roundId: r5, homeTeamId: a, awayTeamId: b })
		const fxEF = await makeFixture({
			roundId: r5,
			homeTeamId: e,
			awayTeamId: f,
			kickoff: new Date(Date.now() + 3 * 3_600_000),
		})

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r5,
			modeConfig: { allowRebuys: false },
		})
		// gpAuto used C, D, G, H → every current-round team unused → auto-pick B
		// (worst-placed). gpNoTeam used A, B, E, F → no legal team → eliminated.
		// gpPicked made their own pick (E) on the later fixture.
		const gpAuto = await makePlayer({ gameId, userId: 'u-auto' })
		const gpNoTeam = await makePlayer({ gameId, userId: 'u-noteam' })
		const gpPicked = await makePlayer({ gameId, userId: 'u-own-pick' })
		const autoUsed = [c, d, teamG, h]
		const noTeamUsed = [a, b, e, f]
		for (const [i, r] of rounds.entries()) {
			historyIds.push(
				await makePick({
					gameId,
					gamePlayerId: gpAuto,
					roundId: r,
					teamId: autoUsed[i],
					fixtureId: historyFixtures[i],
				}),
				await makePick({
					gameId,
					gamePlayerId: gpNoTeam,
					roundId: r,
					teamId: noTeamUsed[i],
					fixtureId: historyFixtures[i],
				}),
			)
		}
		await db.update(pick).set({ result: 'win', goalsScored: 1 }).where(inArray(pick.id, historyIds))
		await makePick({ gameId, gamePlayerId: gpPicked, roundId: r5, teamId: e, fixtureId: fxEF })

		// Invocation 1 — the deadline-time QStash trigger.
		const first = await processDeadlineLock([r5])
		expect(first.autoPicksInserted).toBe(1)
		expect(first.playersEliminated).toBe(1)

		// Invocation 2 — the daily-sync fallback re-fires the same round.
		const second = await processDeadlineLock([r5])
		expect(second).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })

		// Invocation 3 — the crown guard inside the settle path.
		await finishFixture(fxAB, 0, 1) // B wins away → the auto-pick wins
		await settleFixture(fxAB)

		// Exactly one auto-pick row, settled as a win; no duplicates anywhere.
		const autoPicks = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, gpAuto), eq(pick.roundId, r5)),
		})
		expect(autoPicks).toHaveLength(1)
		expect(autoPicks[0].teamId).toBe(b)
		expect(autoPicks[0].isAuto).toBe(true)
		expect(autoPicks[0].result).toBe('win')

		// The no-team player is eliminated exactly once, in the current round.
		const noTeam = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpNoTeam) })
		expect(noTeam?.status).toBe('eliminated')
		expect(noTeam?.eliminatedReason).toBe('no_pick_no_fallback')
		expect(noTeam?.eliminatedRoundId).toBe(r5)
		const noTeamPicks = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, gpNoTeam), eq(pick.roundId, r5)),
		})
		expect(noTeamPicks).toHaveLength(0)

		// Round not fully settled (E–F still scheduled) → game stays active with
		// two alive players; nobody was crowned by the repeated invocations.
		const gAfter = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(gAfter?.status).toBe('active')
		const alive = await db.query.gamePlayer.findMany({
			where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
		})
		expect(alive.map((p) => p.id).sort()).toEqual([gpAuto, gpPicked].sort())
	})

	/**
	 * Sequential idempotency (above) rests on a read-then-insert: check for an
	 * existing pick, then insert one. Two *concurrent* invocations can both pass
	 * that read, and the pick unique index doesn't catch classic picks because it
	 * includes confidence_rank, which is NULL there (Postgres treats NULLs as
	 * distinct). The partial index `pick_player_round_classic_idx` is what closes
	 * it — this exercises the real database, so it also proves the migration
	 * landed and that the ON CONFLICT clause infers that index.
	 */
	it('two concurrent lock invocations insert exactly one auto-pick', async () => {
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const a = await makeTeam({ name: 'A', shortName: 'A', leaguePosition: 3 })
		const b = await makeTeam({ name: 'B', shortName: 'B', leaguePosition: 17 })
		const r3 = await makeRound(compId, {
			number: 3,
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		const fxAB = await makeFixture({
			roundId: r3,
			homeTeamId: a,
			awayTeamId: b,
			kickoff: new Date(Date.now() + 3_600_000),
		})
		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r3,
			modeConfig: { allowRebuys: false },
		})
		const gp = await makePlayer({ gameId, userId: 'u-race' })

		// The deadline trigger and the daily-sync fallback firing at the same
		// instant: both read "no pick", both try to insert.
		const [first, second] = await Promise.all([
			processDeadlineLock([r3]),
			processDeadlineLock([r3]),
		])

		const picks = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, gp), eq(pick.roundId, r3)),
		})
		expect(picks).toHaveLength(1)
		expect(picks[0].teamId).toBe(b) // worst-placed unused team
		expect(picks[0].isAuto).toBe(true)
		// Whoever lost the race must not report an insert it didn't make.
		expect(first.autoPicksInserted + second.autoPicksInserted).toBe(1)
		expect(first.playersEliminated + second.playersEliminated).toBe(0)

		// And the invariant holds against any writer, not just this code path.
		await expect(async () => {
			await db.insert(pick).values({
				gameId,
				gamePlayerId: gp,
				roundId: r3,
				teamId: a,
				fixtureId: fxAB,
			})
		}).rejects.toThrow() // duplicate key value violates pick_player_round_classic_idx
		const afterRawInsert = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, gp), eq(pick.roundId, r3)),
		})
		expect(afterRawInsert).toHaveLength(1)
	})
})

/* ────────────────────────────────────────────────────────────────────── */
/* Stuck-pick recovery — pending-pick advancement gate + all-rounds sweep  */
/* ────────────────────────────────────────────────────────────────────── */

describe('lifecycle: stuck-pick recovery', () => {
	it('reconcile does NOT advance a game whose data-source-completed round has a deferred pending pick', async () => {
		// The production incident's first half: a knockout tie finishes level with
		// winner-lag, so its pick is deferred pending. The data source then marks
		// the round completed (all its fixtures are finished). The reconcile
		// advancement path must refuse to advance the game past its own
		// unresolved pick — advancing here is what stranded the R16 pick forever.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const win = await makeTeam({ name: 'Win', shortName: 'WIN' })
		const lose = await makeTeam({ name: 'Lose', shortName: 'LOS' })
		const next1 = await makeTeam({ name: 'Next1', shortName: 'NX1' })
		const next2 = await makeTeam({ name: 'Next2', shortName: 'NX2' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const r5 = await makeRound(compId, {
			number: 5,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fxTie = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxSafe = await makeFixture({ roundId: r4, homeTeamId: win, awayTeamId: lose })
		await makeFixture({ roundId: r5, homeTeamId: next1, awayTeamId: next2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpBacker = await makePlayer({ gameId, userId: 'u-backer' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpBacker, roundId: r4, teamId: home, fixtureId: fxTie })
		await makePick({ gameId, gamePlayerId: gpSafe1, roundId: r4, teamId: win, fixtureId: fxSafe })
		await makePick({ gameId, gamePlayerId: gpSafe2, roundId: r4, teamId: win, fixtureId: fxSafe })

		await finishFixture(fxSafe, 2, 0, 'home')
		await settleFixture(fxSafe)
		// Winner-lag: finished level, no winner → the backer's pick is deferred.
		await finishFixture(fxTie, 1, 1, null)
		await settleFixture(fxTie)

		// The data source marks the round completed (every fixture finished).
		await db.update(roundTable).set({ status: 'completed' }).where(eq(roundTable.id, r4))

		const result = await reconcileGameState(gameId)

		// No advancement: the game stays on r4 with the pick still pending.
		expect(result.ok).toBe(true)
		expect(result.ok && result.action).toBe('noop')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.currentRoundId).toBe(r4)
		expect(g?.status).toBe('active')
		const backerPick = await db.query.pick.findFirst({
			where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gpBacker)),
		})
		expect(backerPick?.result).toBe('pending')
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpBacker) }))?.status,
		).toBe('alive')
	})

	it('daily reconcile sweeps the deferred pick once the winner lands — elimination in the original round, game unblocked', async () => {
		// Second half of the scenario: the round is completed at the data layer
		// with the backer's pick still deferred, and the winner then arrives
		// WITHOUT an inline settle observing it (the poll chain has moved on).
		// The daily-sync reconcile pass must find the finished-but-pending
		// fixture, settle the pick, eliminate the backer in the round the tie
		// belongs to, and only then let the game advance.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const win = await makeTeam({ name: 'Win', shortName: 'WIN' })
		const lose = await makeTeam({ name: 'Lose', shortName: 'LOS' })
		const next1 = await makeTeam({ name: 'Next1', shortName: 'NX1' })
		const next2 = await makeTeam({ name: 'Next2', shortName: 'NX2' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const r5 = await makeRound(compId, {
			number: 5,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		const fxTie = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxSafe = await makeFixture({ roundId: r4, homeTeamId: win, awayTeamId: lose })
		await makeFixture({ roundId: r5, homeTeamId: next1, awayTeamId: next2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpBacker = await makePlayer({ gameId, userId: 'u-backer' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		await makePick({ gameId, gamePlayerId: gpBacker, roundId: r4, teamId: home, fixtureId: fxTie })
		await makePick({ gameId, gamePlayerId: gpSafe1, roundId: r4, teamId: win, fixtureId: fxSafe })
		await makePick({ gameId, gamePlayerId: gpSafe2, roundId: r4, teamId: win, fixtureId: fxSafe })

		await finishFixture(fxSafe, 2, 0, 'home')
		await settleFixture(fxSafe)
		await finishFixture(fxTie, 1, 1, null)
		await settleFixture(fxTie)
		await db.update(roundTable).set({ status: 'completed' }).where(eq(roundTable.id, r4))

		// The winner lands late — no settleFixture call observes it.
		await finishFixture(fxTie, 1, 1, 'away')

		await reconcileAllActiveGames()

		// The pick settles as a loss and the elimination lands in r4.
		const backerPick = await db.query.pick.findFirst({
			where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gpBacker)),
		})
		expect(backerPick?.result).toBe('loss')
		const backer = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpBacker) })
		expect(backer?.status).toBe('eliminated')
		expect(backer?.eliminatedRoundId).toBe(r4)

		// With the round genuinely settled, the game advances and stays active.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r5)
	})

	it('sweeps a stranded pick in a NON-current round — elimination lands there, game not dragged backwards', async () => {
		// The full production incident: the game advanced past the deferred R16
		// pick (pre-gate) and is now two rounds on. When the tie's winner finally
		// lands, the daily sweep must settle the stranded pick, eliminate the
		// player in the round the tie belongs to, and leave the game's current
		// round exactly where it is — not regress it to the round after the
		// swept one.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const winA = await makeTeam({ name: 'WinA', shortName: 'WNA' })
		const loseA = await makeTeam({ name: 'LoseA', shortName: 'LSA' })
		const winB = await makeTeam({ name: 'WinB', shortName: 'WNB' })
		const loseB = await makeTeam({ name: 'LoseB', shortName: 'LSB' })
		const next1 = await makeTeam({ name: 'Next1', shortName: 'NX1' })
		const next2 = await makeTeam({ name: 'Next2', shortName: 'NX2' })
		// r4 completed with the stranded tie; r5 completed; the game sits on r6.
		const r4 = await makeRound(compId, { number: 4, status: 'completed' })
		const r5 = await makeRound(compId, { number: 5, status: 'completed' })
		const r6 = await makeRound(compId, {
			number: 6,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		// The tie's winner has since landed — away advanced on penalties.
		const fxTie = await makeFixture({
			roundId: r4,
			homeTeamId: home,
			awayTeamId: away,
			status: 'finished',
			homeScore: 1,
			awayScore: 1,
		})
		await db.update(fixtureTable).set({ winner: 'away' }).where(eq(fixtureTable.id, fxTie))
		const fxSafe4 = await makeFixture({
			roundId: r4,
			homeTeamId: winA,
			awayTeamId: loseA,
			status: 'finished',
			homeScore: 2,
			awayScore: 0,
		})
		const fxSafe5 = await makeFixture({
			roundId: r5,
			homeTeamId: winB,
			awayTeamId: loseB,
			status: 'finished',
			homeScore: 1,
			awayScore: 0,
		})
		await makeFixture({ roundId: r6, homeTeamId: next1, awayTeamId: next2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r6,
			modeConfig: { allowRebuys: false },
		})
		const gpStuck = await makePlayer({ gameId, userId: 'u-stuck' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		// r4 history: the stranded pick (still pending) + settled safe picks.
		const stuckPickId = await makePick({
			gameId,
			gamePlayerId: gpStuck,
			roundId: r4,
			teamId: home,
			fixtureId: fxTie,
		})
		const settledR4 = [
			await makePick({
				gameId,
				gamePlayerId: gpSafe1,
				roundId: r4,
				teamId: winA,
				fixtureId: fxSafe4,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpSafe2,
				roundId: r4,
				teamId: winA,
				fixtureId: fxSafe4,
			}),
		]
		// r5 history: everyone (wrongly including the stuck player) survived it.
		const settledR5 = [
			await makePick({
				gameId,
				gamePlayerId: gpStuck,
				roundId: r5,
				teamId: winB,
				fixtureId: fxSafe5,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpSafe1,
				roundId: r5,
				teamId: winB,
				fixtureId: fxSafe5,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpSafe2,
				roundId: r5,
				teamId: winB,
				fixtureId: fxSafe5,
			}),
		]
		await db
			.update(pick)
			.set({ result: 'win', goalsScored: 1 })
			.where(inArray(pick.id, [...settledR4, ...settledR5]))

		await reconcileAllActiveGames()

		// The stranded pick settles and the elimination lands in r4 — the round
		// the tie was played in, not the game's current round.
		const stuckPick = await db.query.pick.findFirst({ where: eq(pick.id, stuckPickId) })
		expect(stuckPick?.result).toBe('loss')
		const stuck = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStuck) })
		expect(stuck?.status).toBe('eliminated')
		expect(stuck?.eliminatedRoundId).toBe(r4)

		// History preserved: the player's later (r5) pick row is untouched.
		const laterPick = await db.query.pick.findFirst({
			where: and(eq(pick.gamePlayerId, gpStuck), eq(pick.roundId, r5)),
		})
		expect(laterPick?.result).toBe('win')

		// The game is NOT dragged backwards: still on r6, still active.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r6)
		const r6After = await db.query.round.findFirst({ where: eq(roundTable.id, r6) })
		expect(r6After?.status).toBe('open')
	})

	it('sweeping an old round does not regress the game when a later round still holds an unresolved deferred pick', async () => {
		// Two stranded rounds behind the game: r4's tie has its winner (sweepable)
		// but r5's tie is STILL unresolved (finished level, winner-lag). Settling
		// r4 must not move the game's pointer at all — re-advancing from r4 would
		// park the game on r5, where the pending-pick gate then (correctly)
		// refuses to advance, leaving the game visibly dragged two rounds back.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home4 = await makeTeam({ name: 'Home4', shortName: 'HM4' })
		const away4 = await makeTeam({ name: 'Away4', shortName: 'AW4' })
		const home5 = await makeTeam({ name: 'Home5', shortName: 'HM5' })
		const away5 = await makeTeam({ name: 'Away5', shortName: 'AW5' })
		const winA = await makeTeam({ name: 'WinA', shortName: 'WNA' })
		const winB = await makeTeam({ name: 'WinB', shortName: 'WNB' })
		const loseA = await makeTeam({ name: 'LoseA', shortName: 'LSA' })
		const loseB = await makeTeam({ name: 'LoseB', shortName: 'LSB' })
		const next1 = await makeTeam({ name: 'Next1', shortName: 'NX1' })
		const next2 = await makeTeam({ name: 'Next2', shortName: 'NX2' })
		const r4 = await makeRound(compId, { number: 4, status: 'completed' })
		const r5 = await makeRound(compId, { number: 5, status: 'completed' })
		const r6 = await makeRound(compId, {
			number: 6,
			status: 'open',
			deadline: new Date(Date.now() + 86_400_000),
		})
		// r4 tie: winner has landed (away advanced) — the sweep can settle it.
		const fxTie4 = await makeFixture({
			roundId: r4,
			homeTeamId: home4,
			awayTeamId: away4,
			status: 'finished',
			homeScore: 1,
			awayScore: 1,
		})
		await db.update(fixtureTable).set({ winner: 'away' }).where(eq(fixtureTable.id, fxTie4))
		const fxSafe4 = await makeFixture({
			roundId: r4,
			homeTeamId: winA,
			awayTeamId: loseA,
			status: 'finished',
			homeScore: 2,
			awayScore: 0,
		})
		// r5 tie: STILL winner-lagged — finished level, no winner. Not sweepable.
		const fxTie5 = await makeFixture({
			roundId: r5,
			homeTeamId: home5,
			awayTeamId: away5,
			status: 'finished',
			homeScore: 0,
			awayScore: 0,
		})
		const fxSafe5 = await makeFixture({
			roundId: r5,
			homeTeamId: winB,
			awayTeamId: loseB,
			status: 'finished',
			homeScore: 1,
			awayScore: 0,
		})
		await makeFixture({ roundId: r6, homeTeamId: next1, awayTeamId: next2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r6,
			modeConfig: { allowRebuys: false },
		})
		const gpStuck4 = await makePlayer({ gameId, userId: 'u-stuck4' })
		const gpStuck5 = await makePlayer({ gameId, userId: 'u-stuck5' })
		const gpSafe = await makePlayer({ gameId, userId: 'u-safe' })
		const stuck4PickId = await makePick({
			gameId,
			gamePlayerId: gpStuck4,
			roundId: r4,
			teamId: home4,
			fixtureId: fxTie4,
		})
		const stuck5PickId = await makePick({
			gameId,
			gamePlayerId: gpStuck5,
			roundId: r5,
			teamId: home5,
			fixtureId: fxTie5,
		})
		const settledIds = [
			await makePick({
				gameId,
				gamePlayerId: gpStuck5,
				roundId: r4,
				teamId: winA,
				fixtureId: fxSafe4,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpSafe,
				roundId: r4,
				teamId: winA,
				fixtureId: fxSafe4,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpStuck4,
				roundId: r5,
				teamId: winB,
				fixtureId: fxSafe5,
			}),
			await makePick({
				gameId,
				gamePlayerId: gpSafe,
				roundId: r5,
				teamId: winB,
				fixtureId: fxSafe5,
			}),
		]
		await db.update(pick).set({ result: 'win', goalsScored: 1 }).where(inArray(pick.id, settledIds))

		const summary = await reconcileAllActiveGames()

		// The summary reports only genuinely settled fixtures: fxTie4 settled;
		// fxTie5 was attempted but its pick stayed deferred (winner-lag).
		expect(summary.stuckFixturesSettled).toBe(1)

		// r4's stranded pick heals; r5's stays deferred (winner still unknown).
		expect((await db.query.pick.findFirst({ where: eq(pick.id, stuck4PickId) }))?.result).toBe(
			'loss',
		)
		const stuck4 = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStuck4) })
		expect(stuck4?.status).toBe('eliminated')
		expect(stuck4?.eliminatedRoundId).toBe(r4)
		expect((await db.query.pick.findFirst({ where: eq(pick.id, stuck5PickId) }))?.result).toBe(
			'pending',
		)
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStuck5) }))?.status,
		).toBe('alive')

		// The game's pointer never moved.
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r6)
	})

	it('sweeps a pending pick left on a CANCELLED fixture — the pinned game unblocks and advances', async () => {
		// The post-gate failure mode: an inline void was missed, so a pick sits
		// pending on a cancelled fixture in a round the data source already
		// completed. reconcileGameState early-returns a completed round straight
		// to the gated advancement, so it never reaches sweepGameSettlement (the
		// only per-game path that handles cancellations) — the pending pick pins
		// the game. The all-rounds sweep has to cover cancelled fixtures too.
		const compId = await makeCompetition({ type: 'league', dataSource: 'fpl' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const win = await makeTeam({ name: 'Win', shortName: 'WIN' })
		const lose = await makeTeam({ name: 'Lose', shortName: 'LOS' })
		const spare1 = await makeTeam({ name: 'Spare1', shortName: 'SP1' })
		const spare2 = await makeTeam({ name: 'Spare2', shortName: 'SP2' })
		const next1 = await makeTeam({ name: 'Next1', shortName: 'NX1' })
		const next2 = await makeTeam({ name: 'Next2', shortName: 'NX2' })
		const r4 = await makeRound(compId, { number: 4, status: 'open' })
		const r5 = await makeRound(compId, {
			number: 5,
			status: 'upcoming',
			deadline: new Date(Date.now() + 86_400_000),
		})
		// Three fixtures so the single cancellation stays under the classic
		// round-void threshold — this is a per-fixture void, not a round void.
		const fxCancel = await makeFixture({ roundId: r4, homeTeamId: home, awayTeamId: away })
		const fxSafe = await makeFixture({ roundId: r4, homeTeamId: win, awayTeamId: lose })
		const fxThird = await makeFixture({ roundId: r4, homeTeamId: spare1, awayTeamId: spare2 })
		await makeFixture({ roundId: r5, homeTeamId: next1, awayTeamId: next2 })

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpBacker = await makePlayer({ gameId, userId: 'u-backer' })
		const gpSafe1 = await makePlayer({ gameId, userId: 'u-safe1' })
		const gpSafe2 = await makePlayer({ gameId, userId: 'u-safe2' })
		const backerPickId = await makePick({
			gameId,
			gamePlayerId: gpBacker,
			roundId: r4,
			teamId: home,
			fixtureId: fxCancel,
		})
		await makePick({ gameId, gamePlayerId: gpSafe1, roundId: r4, teamId: win, fixtureId: fxSafe })
		await makePick({ gameId, gamePlayerId: gpSafe2, roundId: r4, teamId: win, fixtureId: fxSafe })

		await finishFixture(fxSafe, 2, 0, 'home')
		await settleFixture(fxSafe)
		await finishFixture(fxThird, 1, 0, 'home')
		await settleFixture(fxThird)
		// The cancellation lands WITHOUT an inline settle observing it.
		await db.update(fixtureTable).set({ status: 'cancelled' }).where(eq(fixtureTable.id, fxCancel))
		// The data source marks the round completed (every fixture terminal).
		await db.update(roundTable).set({ status: 'completed' }).where(eq(roundTable.id, r4))

		// The pin: the per-game surface can't heal this on its own.
		const pinned = await reconcileGameState(gameId)
		expect(pinned.ok && pinned.action).toBe('noop')
		expect((await db.query.game.findFirst({ where: eq(game.id, gameId) }))?.currentRoundId).toBe(r4)

		const summary = await reconcileAllActiveGames()
		expect(summary.stuckFixturesSettled).toBe(1)

		// The pick voids, the backer stays alive, and the game moves on.
		const backerPick = await db.query.pick.findFirst({ where: eq(pick.id, backerPickId) })
		expect(backerPick?.result).toBe('void')
		expect(backerPick?.cancellationReason).toBe('cancelled')
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpBacker) }))?.status,
		).toBe('alive')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r5)
	})

	it('counts a stuck fixture whose only pending picks belong to a non-active game', async () => {
		// Telemetry-only: those picks settle via the history-completeness path
		// (no elimination, no completion, no advance — the game is done), which
		// used to leave `stuckFixturesSettled` reporting zero work.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r4 = await makeRound(compId, { number: 4, status: 'completed' })
		const fxTie = await makeFixture({
			roundId: r4,
			homeTeamId: home,
			awayTeamId: away,
			status: 'finished',
			homeScore: 1,
			awayScore: 1,
		})
		await db.update(fixtureTable).set({ winner: 'away' }).where(eq(fixtureTable.id, fxTie))

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpStuck = await makePlayer({ gameId, userId: 'u-stuck' })
		const stuckPickId = await makePick({
			gameId,
			gamePlayerId: gpStuck,
			roundId: r4,
			teamId: home,
			fixtureId: fxTie,
		})
		await db.update(game).set({ status: 'completed' }).where(eq(game.id, gameId))

		const summary = await reconcileAllActiveGames()

		expect(summary.checked).toBe(0)
		expect(summary.stuckFixturesSettled).toBe(1)
		// The row settles for history; the finished game is otherwise untouched.
		expect((await db.query.pick.findFirst({ where: eq(pick.id, stuckPickId) }))?.result).toBe(
			'loss',
		)
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStuck) }))?.status,
		).toBe('alive')
	})

	it('never sweeps a stranded pick on an archived competition — archived history is immutable', async () => {
		// The archived-immutability invariant: every recovery surface must leave
		// archived competitions untouched. reconcileGameState already guards, but
		// the all-rounds sweep runs outside the per-game pass — it must filter
		// archived competitions itself or it would re-settle frozen history daily.
		const compId = await makeCompetition({ type: 'group_knockout', dataSource: 'football_data' })
		const home = await makeTeam({ name: 'Home', shortName: 'HOM' })
		const away = await makeTeam({ name: 'Away', shortName: 'AWY' })
		const r4 = await makeRound(compId, { number: 4, status: 'completed' })
		const fxTie = await makeFixture({
			roundId: r4,
			homeTeamId: home,
			awayTeamId: away,
			status: 'finished',
			homeScore: 1,
			awayScore: 1,
		})
		await db.update(fixtureTable).set({ winner: 'away' }).where(eq(fixtureTable.id, fxTie))

		const gameId = await makeGame({
			competitionId: compId,
			gameMode: 'classic',
			currentRoundId: r4,
			modeConfig: { allowRebuys: false },
		})
		const gpStuck = await makePlayer({ gameId, userId: 'u-stuck' })
		const gpOther = await makePlayer({ gameId, userId: 'u-other' })
		const stuckPickId = await makePick({
			gameId,
			gamePlayerId: gpStuck,
			roundId: r4,
			teamId: home,
			fixtureId: fxTie,
		})
		await db.update(competition).set({ status: 'archived' }).where(eq(competition.id, compId))

		await reconcileAllActiveGames()

		// Frozen exactly as archived: pick pending, player alive, game untouched.
		expect((await db.query.pick.findFirst({ where: eq(pick.id, stuckPickId) }))?.result).toBe(
			'pending',
		)
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpStuck) }))?.status,
		).toBe('alive')
		expect(
			(await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gpOther) }))?.status,
		).toBe('alive')
		const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
		expect(g?.status).toBe('active')
		expect(g?.currentRoundId).toBe(r4)
	})
})
