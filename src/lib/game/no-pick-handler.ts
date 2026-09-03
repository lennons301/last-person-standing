import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { pickWorstUnusedTeam } from './auto-pick'
import { eliminationUpdate } from './elimination'
import { isGameStartingRound, resolveRoundAfterStarting } from './starting-round'

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

		for (const g of games) {
			const gameRounds = roundsByCompetition.get(g.competitionId) ?? []
			const isOpeningRound = isGameStartingRound(g, roundId)
			const isSecondRound = resolveRoundAfterStarting(g, gameRounds)?.id === roundId
			const activePlayers = g.players.filter((p) => p.status === 'alive')
			for (const player of activePlayers) {
				const existingPick = await db.query.pick.findFirst({
					where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
				})
				if (existingPick) continue

				if (g.gameMode === 'classic') {
					if (isOpeningRound) {
						const allowRebuys =
							(g.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
						if (allowRebuys) {
							await db
								.update(gamePlayer)
								.set(eliminationUpdate('no_pick_no_fallback', roundId))
								.where(eq(gamePlayer.id, player.id))
							playersEliminated++
						}
						// !allowRebuys: classic.ts exemption applies; no elimination here.
					} else if (isSecondRound) {
						// The round after the opening one holds two kinds of player, and a
						// missed deadline means opposite things to them.
						//
						// A player who is here on merit — the opening pick came off, or the
						// no-rebuys exemption carried a loss — has done nothing to forfeit
						// their entry, so they take the ordinary auto-pick fallback, exactly
						// as they would in any later round. Eliminating them outright was
						// the pre-rebuy-payment behaviour and it took a paid-up survivor out
						// of a game they were still winning.
						//
						// A player who is here because they *bought back in* is the other
						// case: the rebuy was an entry into this round, and missing its
						// deadline means the entry bought nothing. They go out and the money
						// comes back off the pot. A second payment row is what says a rebuy
						// happened — both rebuy routes write one, in a free game too — and
						// it stays the signal here because the rebuy clears
						// `eliminatedRoundId`, so player state alone can't tell the two
						// kinds of survivor apart.
						const prevPayments = await db.query.payment.findMany({
							where: and(eq(payment.gameId, g.id), eq(payment.userId, player.userId)),
						})
						if (prevPayments.length > 1) {
							await db
								.update(gamePlayer)
								.set(eliminationUpdate('missed_rebuy_pick', roundId))
								.where(eq(gamePlayer.id, player.id))
							playersEliminated++
							if (await refundLatestEntry(g.id, player.userId)) paymentsRefunded++
						} else {
							const result = await applyRule2Classic(g.id, player, roundId)
							if (result === 'auto-pick-inserted') autoPicksInserted++
							else if (result === 'eliminated-no-fallback') playersEliminated++
						}
					} else {
						const result = await applyRule2Classic(g.id, player, roundId)
						if (result === 'auto-pick-inserted') autoPicksInserted++
						else if (result === 'eliminated-no-fallback') playersEliminated++
					}
				} else if (g.gameMode === 'turbo' || g.gameMode === 'cup') {
					const result = await applyRule3TurboOrCup(g.id, player, roundId)
					playersEliminated++
					if (result.refunded) paymentsRefunded++
				}
			}
		}
	}

	return { autoPicksInserted, playersEliminated, paymentsRefunded }
}

async function applyRule2Classic(
	gameId: string,
	player: typeof gamePlayer.$inferSelect,
	roundId: string,
): Promise<'auto-pick-inserted' | 'eliminated-no-fallback' | 'already-picked'> {
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
	const usedPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, player.id)),
	})
	const usedTeamIds = new Set(usedPicks.flatMap((p) => (p.teamId ? [p.teamId] : [])))

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
	// contributes nothing rather than a nought, which is what lets the function
	// tell "priced at 8%" apart from "not priced".
	const teamWinProbabilities = new Map<string, number>()
	for (const fx of fixtures) {
		if (!fx.odds) continue
		teamWinProbabilities.set(fx.homeTeamId, fx.odds.homeProbability)
		teamWinProbabilities.set(fx.awayTeamId, fx.odds.awayProbability)
	}

	const teamId = pickWorstUnusedTeam({
		fixtures: fixtures.map((fx) => ({
			id: fx.id,
			homeTeamId: fx.homeTeamId,
			awayTeamId: fx.awayTeamId,
		})),
		usedTeamIds,
		teamPositions,
		teamWinProbabilities,
	})

	if (!teamId) {
		await db
			.update(gamePlayer)
			.set(eliminationUpdate('no_pick_no_fallback', roundId))
			.where(eq(gamePlayer.id, player.id))
		return 'eliminated-no-fallback'
	}

	const chosenFixture = fixtures.find((fx) => fx.homeTeamId === teamId || fx.awayTeamId === teamId)
	if (!chosenFixture) {
		// Defensive — should not happen since teamId came from fixtures.
		return 'eliminated-no-fallback'
	}
	const predictedResult = chosenFixture.homeTeamId === teamId ? 'home_win' : 'away_win'
	// The existing-pick read above makes this idempotent across *sequential*
	// invocations (deadline trigger, daily-sync fallback, crown guard). Two
	// invocations racing each other could both pass that read, so the partial
	// unique index `pick_player_round_classic_idx` is the real arbiter: the
	// loser's insert is a no-op and returns no row. Counting the returned rows
	// (rather than assuming one) keeps `autoPicksInserted` honest.
	const inserted = await db
		.insert(pick)
		.values({
			gameId,
			roundId,
			gamePlayerId: player.id,
			fixtureId: chosenFixture.id,
			teamId,
			predictedResult,
			confidenceRank: null,
			isAuto: true,
		})
		.onConflictDoNothing({
			target: [pick.gamePlayerId, pick.roundId],
			where: sql`${pick.confidenceRank} is null`,
		})
		.returning({ id: pick.id })
	return inserted.length > 0 ? 'auto-pick-inserted' : 'already-picked'
}

async function applyRule3TurboOrCup(
	gameId: string,
	player: typeof gamePlayer.$inferSelect,
	roundId: string,
): Promise<{ refunded: boolean }> {
	await db
		.update(gamePlayer)
		.set(eliminationUpdate('no_pick_no_fallback', roundId))
		.where(eq(gamePlayer.id, player.id))

	return { refunded: await refundLatestEntry(gameId, player.userId) }
}

/**
 * Take a player's most recent live entry back off the pot.
 *
 * Only a `paid` or `claimed` row is money the pot counts (`calculatePot`), so
 * only one of those can be refunded; a `pending` rebuy nobody ever paid is left
 * for the admin's own controls rather than marked refunded, which would claim a
 * refund of money never taken. Returns whether a row was actually reversed.
 */
async function refundLatestEntry(gameId: string, userId: string): Promise<boolean> {
	const refundCandidate = await db.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, userId),
			inArray(payment.status, ['paid', 'claimed']),
		),
		orderBy: (p, { desc }) => desc(p.createdAt),
	})
	if (!refundCandidate) return false

	await db
		.update(payment)
		.set({ status: 'refunded', refundedAt: new Date() })
		.where(eq(payment.id, refundCandidate.id))
	return true
}
