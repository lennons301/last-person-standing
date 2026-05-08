import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { validateWcClassicPick, wcRoundStage } from '@/lib/game-logic/wc-classic'
import { validateClassicPick, validateTurboPicks } from '@/lib/picks/validate'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'

type Params = Promise<{ gameId: string; roundId: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
	await requireSession()
	const { gameId, roundId } = await params

	const picks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
		with: { team: true, gamePlayer: true },
	})

	return NextResponse.json(picks)
}

export async function POST(request: Request, { params }: { params: Params }) {
	const session = await requireSession()
	const { gameId, roundId } = await params
	const body = (await request.json()) as {
		teamId?: string
		picks?: unknown[]
		actingAs?: string
	}

	// Get game and player
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: { competition: true },
	})
	if (!gameData) {
		return NextResponse.json({ error: 'Game not found' }, { status: 404 })
	}

	// Resolve target player. Default is the session user's own gamePlayer, but
	// admins can pick on behalf of another player via `actingAs` (Phase 4c2).
	let targetGamePlayer = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})

	if (body.actingAs) {
		// Admin is picking for another player.
		if (gameData.createdBy !== session.user.id) {
			return NextResponse.json({ error: 'forbidden' }, { status: 403 })
		}
		const actingAsPlayer = await db.query.gamePlayer.findFirst({
			where: and(eq(gamePlayer.id, body.actingAs), eq(gamePlayer.gameId, gameId)),
		})
		if (!actingAsPlayer) {
			return NextResponse.json({ error: 'actingAs-not-in-game' }, { status: 404 })
		}
		targetGamePlayer = actingAsPlayer
	}

	if (!targetGamePlayer) {
		return NextResponse.json({ error: 'Not a member of this game' }, { status: 403 })
	}

	// Get round (with team relations so cup-mode validation can inspect tiers)
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: {
				with: { homeTeam: true, awayTeam: true },
				orderBy: (fx, { asc }) => asc(fx.kickoff),
			},
		},
	})
	if (!roundData) {
		return NextResponse.json({ error: 'Round not found' }, { status: 404 })
	}

	const now = new Date()

	// Helper: check if we need to un-eliminate. Returns true if conditions are met.
	function shouldUnEliminate(): boolean {
		if (!body.actingAs) return false
		if (!targetGamePlayer) return false
		if (targetGamePlayer.eliminatedReason !== 'missed_rebuy_pick') return false
		return true
	}

	if (gameData.gameMode === 'classic') {
		const { teamId } = body as { teamId: string }

		// Get previously used teams (for the TARGET player, not the admin)
		const previousPicks = await db.query.pick.findMany({
			where: and(eq(pick.gamePlayerId, targetGamePlayer.id), eq(pick.gameId, gameId)),
		})
		const usedTeamIds = previousPicks.filter((p) => p.roundId !== roundId).map((p) => p.teamId)

		const fixtureTeamIds = roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])

		const allowEliminatedRebuy = Boolean(
			body.actingAs && targetGamePlayer.eliminatedReason === 'missed_rebuy_pick',
		)

		const validation = validateClassicPick(
			{
				teamId,
				playerStatus: targetGamePlayer.status,
				isCurrentRound: gameData.currentRoundId === roundId,
				deadline: roundData.deadline,
				now,
				usedTeamIds,
				fixtureTeamIds,
			},
			{ allowEliminatedRebuy },
		)

		if (!validation.valid) {
			return NextResponse.json({ error: validation.reason }, { status: 400 })
		}

		if (gameData.competition.type === 'group_knockout') {
			// Load all rounds + fixtures for the competition to check tournament elimination
			const allRounds = await db.query.round.findMany({
				where: eq(round.competitionId, gameData.competitionId),
				with: {
					fixtures: {
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			})
			const finishedKnockoutFixtures = allRounds.flatMap((r) =>
				r.fixtures.map((f) => ({
					id: f.id,
					roundId: r.id,
					homeTeamId: f.homeTeamId,
					awayTeamId: f.awayTeamId,
					homeScore: f.homeScore,
					awayScore: f.awayScore,
					status: f.status,
					stage: wcRoundStage(r.number),
				})),
			)
			const wcResult = validateWcClassicPick({
				teamId,
				roundFixtures: roundData.fixtures.map((f) => ({
					id: f.id,
					roundId: f.roundId,
					homeTeamId: f.homeTeamId,
					awayTeamId: f.awayTeamId,
					homeScore: f.homeScore,
					awayScore: f.awayScore,
					status: f.status,
					stage: wcRoundStage(roundData.number),
				})),
				finishedKnockoutFixtures,
			})
			if (!wcResult.valid) {
				return NextResponse.json({ error: wcResult.reason }, { status: 400 })
			}
		}

		// Find the fixture this team is in
		const teamFixture = roundData.fixtures.find(
			(f) => f.homeTeamId === teamId || f.awayTeamId === teamId,
		)

		// Delete existing pick for this player+round if it exists, then insert new one.
		// We cannot use onConflictDoUpdate because the unique index includes confidenceRank,
		// which is null for classic picks, and PostgreSQL treats nulls as distinct.
		const existingPick = previousPicks.find((p) => p.roundId === roundId)
		if (existingPick) {
			await db.delete(pick).where(eq(pick.id, existingPick.id))
		}

		let newPick!: typeof pick.$inferSelect
		let unEliminated = false

		await db.transaction(async (tx) => {
			const picks = await tx
				.insert(pick)
				.values({
					gameId,
					gamePlayerId: targetGamePlayer.id,
					roundId,
					teamId,
					fixtureId: teamFixture?.id,
				})
				.returning()
			newPick = picks[0]

			// If the admin was acting-as a player who was eliminated via `missed_rebuy_pick`,
			// flip them back to alive (Phase 4c2 rule 1: rebuy is implicit on first admin pick).
			if (shouldUnEliminate()) {
				await tx
					.update(gamePlayer)
					.set({ status: 'alive', eliminatedReason: null, eliminatedRoundId: null })
					.where(eq(gamePlayer.id, targetGamePlayer.id))
				unEliminated = true
			}
		})

		return NextResponse.json({ ...newPick, unEliminated }, { status: 201 })
	}

	// Turbo and Cup modes
	const pickEntries = (body.picks ?? []) as Array<{
		fixtureId: string
		confidenceRank: number
		predictedResult: 'home_win' | 'draw' | 'away_win'
	}>
	const numberOfPicks = (gameData.modeConfig as { numberOfPicks?: number })?.numberOfPicks ?? 10

	const allowEliminatedRebuyMulti = Boolean(
		body.actingAs && targetGamePlayer.eliminatedReason === 'missed_rebuy_pick',
	)

	const validation = validateTurboPicks(
		{
			playerStatus: targetGamePlayer.status,
			isCurrentRound: gameData.currentRoundId === roundId,
			deadline: roundData.deadline,
			now,
			numberOfPicks,
			fixtureIds: roundData.fixtures.map((f) => f.id),
			picks: pickEntries,
		},
		{ allowEliminatedRebuy: allowEliminatedRebuyMulti },
	)

	if (!validation.valid) {
		return NextResponse.json({ error: validation.reason }, { status: 400 })
	}

	// Cup mode: reject submissions that include any restricted pick (picking a team
	// more than 1 tier below its opponent). The UI already hides these, but the API
	// must enforce it defensively.
	if (gameData.gameMode === 'cup') {
		for (const entry of pickEntries as Array<{
			fixtureId: string
			predictedResult: string
		}>) {
			const fx = roundData.fixtures.find((f) => f.id === entry.fixtureId)
			if (!fx) continue
			if (entry.predictedResult !== 'home_win' && entry.predictedResult !== 'away_win') continue
			const tierDiff = computeTierDifference(fx.homeTeam, fx.awayTeam, gameData.competition.type)
			// A positive tierDiff means the home team is in a worse (higher-pot) tier.
			// Picking the home side when tierDiff > 1 means picking a team > 1 tier below;
			// picking the away side when tierDiff < -1 is the same case on the other side.
			const tierFromPicked = entry.predictedResult === 'home_win' ? tierDiff : -tierDiff
			if (tierFromPicked > 1) {
				return NextResponse.json(
					{
						error: 'restricted',
						fixtureId: entry.fixtureId,
						predictedResult: entry.predictedResult,
					},
					{ status: 400 },
				)
			}
		}
	}

	// Delete existing picks for this round (for the TARGET player), then insert new ones
	const existingPicks = await db.query.pick.findMany({
		where: and(eq(pick.gamePlayerId, targetGamePlayer.id), eq(pick.roundId, roundId)),
	})
	if (existingPicks.length > 0) {
		const existingIds = existingPicks.map((p) => p.id)
		await db.delete(pick).where(inArray(pick.id, existingIds))
	}

	// For turbo/cup, derive a valid teamId from the fixture + prediction.
	// teamId has a FK to team.id and is NOT NULL, so we pick the home team for
	// home_win/draw and the away team for away_win.
	const fixtureLookup = new Map(roundData.fixtures.map((f) => [f.id, f]))

	let newPicks: (typeof pick.$inferSelect)[] = []
	let unEliminated = false
	// Capture the narrowed reference so it's available inside the .map closure
	// below without TS losing the non-null narrowing through the callback boundary.
	const player = targetGamePlayer

	await db.transaction(async (tx) => {
		const insertedPicks = await tx
			.insert(pick)
			.values(
				pickEntries.map(
					(entry: { fixtureId: string; confidenceRank: number; predictedResult: string }) => {
						const fx = fixtureLookup.get(entry.fixtureId)
						if (!fx) throw new Error(`Fixture ${entry.fixtureId} not found`)
						const teamId = entry.predictedResult === 'away_win' ? fx.awayTeamId : fx.homeTeamId
						return {
							gameId,
							gamePlayerId: player.id,
							roundId,
							teamId,
							fixtureId: entry.fixtureId,
							confidenceRank: entry.confidenceRank,
							predictedResult: entry.predictedResult,
						}
					},
				),
			)
			.returning()
		newPicks = insertedPicks

		// If the admin was acting-as a player who was eliminated via `missed_rebuy_pick`,
		// flip them back to alive (Phase 4c2 rule 1: rebuy is implicit on first admin pick).
		if (shouldUnEliminate()) {
			await tx
				.update(gamePlayer)
				.set({ status: 'alive', eliminatedReason: null, eliminatedRoundId: null })
				.where(eq(gamePlayer.id, targetGamePlayer.id))
			unEliminated = true
		}
	})

	return NextResponse.json({ picks: newPicks, unEliminated }, { status: 201 })
}
