import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { pickWorstUnusedTeam } from './auto-pick'
import { eliminationUpdate } from './elimination'
import { resolveModeConfig } from './mode-config'
import { decideNoPickOutcome, type NoPickOutcome } from './no-pick-decision'

/** A transaction handle, as drizzle hands one to `db.transaction`'s callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The round's fixtures and the two measures the fallback is chosen on. */
interface RoundBoard {
	fixtures: Array<{ id: string; homeTeamId: string; awayTeamId: string }>
	teamPositions: Map<string, number>
	teamWinProbabilities: Map<string, number>
}

/** A fallback pick, resolved to the row the insert would write. */
interface FallbackPick {
	teamId: string
	fixtureId: string
	predictedResult: 'home_win' | 'away_win'
}

/**
 * The deadline lock: what happens to the players a round's deadline caught with
 * nothing in.
 *
 * Three halves, in order. **Gather** reads the rows — the round, the games on
 * it, the competition's round sequence, each no-picker's payment rows and the
 * fallback team the round leaves them. **Decide** is `decideNoPickOutcome`,
 * pure, and is where the whole rule lives. **Apply** writes what was decided,
 * inside a transaction so an elimination and its refund land together.
 */
export async function processDeadlineLock(roundIds: string[]): Promise<{
	autoPicksInserted: number
	playersEliminated: number
	paymentsRefunded: number
}> {
	let autoPicksInserted = 0
	let playersEliminated = 0
	let paymentsRefunded = 0

	for (const roundId of roundIds) {
		const roundRow = await db.query.round.findFirst({ where: eq(round.id, roundId) })
		if (!roundRow) continue
		// The lock only ever fires after the round's deadline. Gating here (not
		// at the call sites) makes the lock safe to invoke from ANY surface —
		// the QStash deadline trigger, the daily-sync fallback, and the crown
		// guard in the settle path all call it unconditionally; a round whose
		// deadline hasn't passed (e.g. a rescheduled fixture finishing early,
		// or an early-fired job) is a no-op.
		if (roundRow.deadline == null || roundRow.deadline.getTime() > Date.now()) continue

		const games = await db.query.game.findMany({
			where: and(eq(game.currentRoundId, roundId), ne(game.status, 'completed')),
			with: { players: true },
		})

		// Every round of every competition these games play, so each game's own
		// opening round — and the round after it — can be resolved. A game created
		// mid-season has its round one at, say, gameweek 12, and gameweek 13 is its
		// round two; branching on the competition's round numbers put a mid-season
		// game's opening round on the ordinary auto-pick path (#203).
		const competitionIds = Array.from(new Set(games.map((g) => g.competitionId)))
		const competitionRounds =
			competitionIds.length === 0
				? []
				: await db.query.round.findMany({
						where: inArray(round.competitionId, competitionIds),
					})
		const roundsByCompetition = new Map<string, typeof competitionRounds>()
		for (const r of competitionRounds) {
			const list = roundsByCompetition.get(r.competitionId) ?? []
			list.push(r)
			roundsByCompetition.set(r.competitionId, list)
		}

		// The round's board is a property of the round, not of a player or a game,
		// so it is read once and shared — but only once a classic no-picker is
		// actually found, so a round nobody missed costs nothing.
		let boardPromise: Promise<RoundBoard> | null = null
		const roundBoard = () => {
			boardPromise ??= loadRoundBoard(roundId)
			return boardPromise
		}

		for (const g of games) {
			const gameRounds = roundsByCompetition.get(g.competitionId) ?? []
			const noPickers: (typeof g.players)[number][] = []
			for (const player of g.players) {
				if (player.status !== 'alive') continue
				const existingPick = await db.query.pick.findFirst({
					where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
				})
				if (!existingPick) noPickers.push(player)
			}
			if (noPickers.length === 0) continue

			const paymentRowCounts = await countPaymentRowsByUser(g.id)

			for (const player of noPickers) {
				// Resolved before the decision rather than inside it: the team choice
				// is already the pure `pickWorstUnusedTeam`, so the fallback reaches the
				// rule as a fact — "a team remains, and it is this one" — and outcome 5
				// stops hiding inside the auto-pick path.
				const fallback =
					g.gameMode === 'classic'
						? await resolveFallback(await roundBoard(), g.id, player.id)
						: null

				const outcome = decideNoPickOutcome({
					game: {
						startingRoundId: g.startingRoundId,
						modeConfig: resolveModeConfig(g),
					},
					roundId,
					competitionRounds: gameRounds,
					paymentRowCount: paymentRowCounts.get(player.userId) ?? 0,
					fallbackTeamId: fallback?.teamId ?? null,
				})

				const applied = await applyNoPickOutcome({
					outcome,
					gameId: g.id,
					roundId,
					player,
					fallback,
				})
				autoPicksInserted += applied.autoPicksInserted
				playersEliminated += applied.playersEliminated
				paymentsRefunded += applied.paymentsRefunded
			}
		}
	}

	return { autoPicksInserted, playersEliminated, paymentsRefunded }
}

/* ── gather ────────────────────────────────────────────────────────────── */

/** How many payment rows each player of the game has — the rebuy signal. */
async function countPaymentRowsByUser(gameId: string): Promise<Map<string, number>> {
	const rows = await db.query.payment.findMany({ where: eq(payment.gameId, gameId) })
	const counts = new Map<string, number>()
	for (const row of rows) counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
	return counts
}

async function loadRoundBoard(roundId: string): Promise<RoundBoard> {
	const fixtures = await db.query.fixture.findMany({
		where: eq(fixture.roundId, roundId),
		// `odds` is the fixture's own `fixture_odds` row, written by the daily
		// sync and frozen at the round's deadline — a join, never a request, the
		// same way the live view's pre-match chip reads it. The fallback picks the
		// longest-odds team out of it, falling back to the table for a round that
		// carries no prices at all.
		with: { homeTeam: true, awayTeam: true, odds: true },
		orderBy: [asc(fixture.kickoff)],
	})

	const allTeamIds = new Set<string>()
	for (const fx of fixtures) {
		allTeamIds.add(fx.homeTeamId)
		allTeamIds.add(fx.awayTeamId)
	}
	const teamRows = allTeamIds.size
		? await db.query.team.findMany({ where: inArray(team.id, Array.from(allTeamIds)) })
		: []
	const teamPositions = new Map(
		teamRows.map((t) => [t.id, t.leaguePosition ?? Number.POSITIVE_INFINITY] as const),
	)

	// Each side's own end of its fixture's market. A fixture with no odds row
	// contributes nothing rather than a nought, which is what lets the choice
	// tell "priced at 8%" apart from "not priced".
	const teamWinProbabilities = new Map<string, number>()
	for (const fx of fixtures) {
		if (!fx.odds) continue
		teamWinProbabilities.set(fx.homeTeamId, fx.odds.homeProbability)
		teamWinProbabilities.set(fx.awayTeamId, fx.odds.awayProbability)
	}

	return {
		fixtures: fixtures.map((fx) => ({
			id: fx.id,
			homeTeamId: fx.homeTeamId,
			awayTeamId: fx.awayTeamId,
		})),
		teamPositions,
		teamWinProbabilities,
	}
}

/**
 * The worst unused team the round leaves this player, as the pick row it would
 * become. Null when every team in the round is already used — and, defensively,
 * when the chosen team can't be found in a fixture, which can't happen since it
 * came out of these fixtures.
 */
async function resolveFallback(
	board: RoundBoard,
	gameId: string,
	gamePlayerId: string,
): Promise<FallbackPick | null> {
	const usedPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gamePlayerId)),
	})
	const usedTeamIds = new Set(usedPicks.flatMap((p) => (p.teamId ? [p.teamId] : [])))

	const teamId = pickWorstUnusedTeam({
		fixtures: board.fixtures,
		usedTeamIds,
		teamPositions: board.teamPositions,
		teamWinProbabilities: board.teamWinProbabilities,
	})
	if (!teamId) return null

	const chosenFixture = board.fixtures.find(
		(fx) => fx.homeTeamId === teamId || fx.awayTeamId === teamId,
	)
	if (!chosenFixture) return null

	return {
		teamId,
		fixtureId: chosenFixture.id,
		predictedResult: chosenFixture.homeTeamId === teamId ? 'home_win' : 'away_win',
	}
}

/* ── apply ─────────────────────────────────────────────────────────────── */

async function applyNoPickOutcome(args: {
	outcome: NoPickOutcome
	gameId: string
	roundId: string
	player: { id: string; userId: string }
	fallback: FallbackPick | null
}): Promise<{ autoPicksInserted: number; playersEliminated: number; paymentsRefunded: number }> {
	const { outcome, gameId, roundId, player, fallback } = args
	const nothing = { autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 }

	if (outcome.kind === 'exempt') return nothing

	if (outcome.kind === 'auto-pick') {
		if (!fallback) return nothing
		// The existing-pick read in the gather half makes this idempotent across
		// *sequential* invocations (deadline trigger, daily-sync fallback, crown
		// guard). Two invocations racing each other could both pass that read, so
		// the partial unique index `pick_player_round_classic_idx` is the real
		// arbiter: the loser's insert is a no-op and returns no row. Counting the
		// returned rows (rather than assuming one) keeps `autoPicksInserted` honest.
		const inserted = await db.transaction((tx) =>
			tx
				.insert(pick)
				.values({
					gameId,
					roundId,
					gamePlayerId: player.id,
					fixtureId: fallback.fixtureId,
					teamId: outcome.teamId,
					predictedResult: fallback.predictedResult,
					confidenceRank: null,
					isAuto: true,
				})
				.onConflictDoNothing({
					target: [pick.gamePlayerId, pick.roundId],
					where: sql`${pick.confidenceRank} is null`,
				})
				.returning({ id: pick.id }),
		)
		return { ...nothing, autoPicksInserted: inserted.length > 0 ? 1 : 0 }
	}

	// An elimination and the refund that goes with it are one act: the money only
	// comes off the pot because the player went out, so they land together.
	const refunded = await db.transaction(async (tx) => {
		await tx
			.update(gamePlayer)
			.set(eliminationUpdate(outcome.reason, roundId))
			.where(eq(gamePlayer.id, player.id))

		return outcome.refund ? await refundLatestEntry(tx, gameId, player.userId) : false
	})

	return { ...nothing, playersEliminated: 1, paymentsRefunded: refunded ? 1 : 0 }
}

/**
 * Take a player's most recent live entry back off the pot.
 *
 * Only a `paid` or `claimed` row is money the pot counts (`calculatePot`), so
 * only one of those can be refunded; a `pending` rebuy nobody ever paid is left
 * for the admin's own controls rather than marked refunded, which would claim a
 * refund of money never taken. Returns whether a row was actually reversed.
 */
async function refundLatestEntry(tx: Tx, gameId: string, userId: string): Promise<boolean> {
	const refundCandidate = await tx.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, userId),
			inArray(payment.status, ['paid', 'claimed']),
		),
		orderBy: (p, { desc }) => desc(p.createdAt),
	})
	if (!refundCandidate) return false

	await tx
		.update(payment)
		.set({ status: 'refunded', refundedAt: new Date() })
		.where(eq(payment.id, refundCandidate.id))
	return true
}
