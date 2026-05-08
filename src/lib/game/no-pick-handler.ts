import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { pickLowestRankedUnusedTeam } from './auto-pick'

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

		const games = await db.query.game.findMany({
			where: and(eq(game.currentRoundId, roundId), ne(game.status, 'completed')),
			with: { players: true },
		})

		for (const g of games) {
			const activePlayers = g.players.filter((p) => p.status === 'alive')
			for (const player of activePlayers) {
				const existingPick = await db.query.pick.findFirst({
					where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
				})
				if (existingPick) continue

				if (g.gameMode === 'classic') {
					if (roundRow.number === 1) {
						const allowRebuys =
							(g.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
						if (allowRebuys) {
							await db
								.update(gamePlayer)
								.set({
									status: 'eliminated',
									eliminatedReason: 'no_pick_no_fallback',
									eliminatedRoundId: roundId,
								})
								.where(eq(gamePlayer.id, player.id))
							playersEliminated++
						}
						// !allowRebuys: classic.ts exemption applies; no elimination here.
					} else if (roundRow.number === 2) {
						const prevPayments = await db.query.payment.findMany({
							where: and(eq(payment.gameId, g.id), eq(payment.userId, player.userId)),
						})
						const reason = prevPayments.length > 1 ? 'missed_rebuy_pick' : 'no_pick_no_fallback'
						await db
							.update(gamePlayer)
							.set({
								status: 'eliminated',
								eliminatedReason: reason,
								eliminatedRoundId: roundId,
							})
							.where(eq(gamePlayer.id, player.id))
						playersEliminated++
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
): Promise<'auto-pick-inserted' | 'eliminated-no-fallback'> {
	const fixtures = await db.query.fixture.findMany({
		where: eq(fixture.roundId, roundId),
		with: { homeTeam: true, awayTeam: true },
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

	const teamId = pickLowestRankedUnusedTeam({
		fixtures: fixtures.map((fx) => ({
			id: fx.id,
			homeTeamId: fx.homeTeamId,
			awayTeamId: fx.awayTeamId,
		})),
		usedTeamIds,
		teamPositions,
	})

	if (!teamId) {
		await db
			.update(gamePlayer)
			.set({
				status: 'eliminated',
				eliminatedReason: 'no_pick_no_fallback',
				eliminatedRoundId: roundId,
			})
			.where(eq(gamePlayer.id, player.id))
		return 'eliminated-no-fallback'
	}

	const chosenFixture = fixtures.find((fx) => fx.homeTeamId === teamId || fx.awayTeamId === teamId)
	if (!chosenFixture) {
		// Defensive — should not happen since teamId came from fixtures.
		return 'eliminated-no-fallback'
	}
	const predictedResult = chosenFixture.homeTeamId === teamId ? 'home_win' : 'away_win'
	await db.insert(pick).values({
		gameId,
		roundId,
		gamePlayerId: player.id,
		fixtureId: chosenFixture.id,
		teamId,
		predictedResult,
		confidenceRank: null,
		isAuto: true,
	})
	return 'auto-pick-inserted'
}

async function applyRule3TurboOrCup(
	gameId: string,
	player: typeof gamePlayer.$inferSelect,
	roundId: string,
): Promise<{ refunded: boolean }> {
	await db
		.update(gamePlayer)
		.set({
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundId: roundId,
		})
		.where(eq(gamePlayer.id, player.id))

	const refundCandidate = await db.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, player.userId),
			inArray(payment.status, ['paid', 'claimed']),
		),
		orderBy: (p, { desc }) => desc(p.createdAt),
	})
	if (!refundCandidate) return { refunded: false }

	await db
		.update(payment)
		.set({ status: 'refunded', refundedAt: new Date() })
		.where(eq(payment.id, refundCandidate.id))
	return { refunded: true }
}
