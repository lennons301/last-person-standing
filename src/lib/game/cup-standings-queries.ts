import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roundLabel } from '@/lib/game/round-label'
import { deriveGameRoundStatus } from '@/lib/game/round-status'
import { determineFixtureOutcome } from '@/lib/game-logic/common'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { pick } from '@/lib/schema/game'

export interface CupStandingsPick {
	gamePlayerId: string
	confidenceRank: number
	fixtureId: string
	homeShort: string
	awayShort: string
	pickedTeamId: string
	pickedSide: 'home' | 'away'
	tierDifference: number // from picked side
	result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'restricted'
	livesGained: number
	livesSpent: number
	goalsCounted: number
}

export interface CupStandingsPlayer {
	id: string
	userId: string
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	livesRemaining: number
	streak: number
	goals: number
	hasSubmitted: boolean
	eliminatedRoundNumber: number | null
	eliminatedRoundLabel: string | null
	picks: CupStandingsPick[]
}

export interface CupStandingsData {
	gameId: string
	roundId: string
	roundNumber: number
	roundLabel: string
	roundStatus: 'open' | 'active' | 'completed'
	maxLives: number
	numberOfPicks: number
	players: CupStandingsPlayer[]
}

export interface CupLadderBacker {
	playerId: string
	playerName: string
	confidenceRank: number
	result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'upset-pending' | 'last-life'
	livesGained: number
	livesSpent: number
}

export interface CupLadderFixture {
	id: string
	homeTeam: { shortName: string; name: string; badgeUrl: string | null; color: string | null }
	awayTeam: { shortName: string; name: string; badgeUrl: string | null; color: string | null }
	kickoff: Date | null
	homeScore: number | null
	awayScore: number | null
	tierDifference: number
	plusN: number
	heart: boolean
	actualOutcome: 'home_win' | 'draw' | 'away_win' | null
	homeBackers: CupLadderBacker[]
	awayBackers: CupLadderBacker[]
	crucial: boolean
}

export interface CupLadderData extends CupStandingsData {
	fixtures: CupLadderFixture[]
}

export async function getCupStandingsData(
	gameId: string,
	viewerUserId: string,
): Promise<CupStandingsData | null> {
	const g = await db.query.game.findFirst({
		where: (t, { eq: eqOp }) => eqOp(t.id, gameId),
		with: {
			competition: true,
			currentRound: {
				with: {
					fixtures: {
						with: { homeTeam: true, awayTeam: true },
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			},
			players: true,
		},
	})
	if (!g?.currentRound) return null

	const allPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, g.currentRound.id)),
	})

	// User-name lookup — mirror the pattern in getTurboStandingsData.
	const { user } = await import('@/lib/schema/auth')
	const userRows =
		g.players.length > 0
			? await db
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(
						inArray(
							user.id,
							g.players.map((p) => p.userId),
						),
					)
			: []
	const userNames = new Map(userRows.map((u) => [u.id, u.name]))

	// Hide picks while the round is still accepting them (deadline hasn't passed).
	// Once the deadline passes, picks are revealed even though the round may
	// still be in 'active' state until processGameRound completes.
	const now = new Date()
	const hideOpenPicks =
		g.currentRound.status !== 'completed' &&
		(!g.currentRound.deadline || now < g.currentRound.deadline)

	const players: CupStandingsPlayer[] = g.players.map((p) => {
		const isViewer = p.userId === viewerUserId
		const myPicks = allPicks.filter((pk) => pk.gamePlayerId === p.id)
		const picks: CupStandingsPick[] = myPicks.map((pk) => {
			const fx = g.currentRound?.fixtures.find((f) => f.id === pk.fixtureId)
			if (!fx) {
				// Shouldn't happen — pick referencing a fixture not in the round — but
				// be defensive rather than throwing at the query layer.
				return {
					gamePlayerId: p.id,
					confidenceRank: pk.confidenceRank ?? 0,
					fixtureId: pk.fixtureId ?? '',
					homeShort: '?',
					awayShort: '?',
					pickedTeamId: pk.teamId,
					pickedSide: 'home' as const,
					tierDifference: 0,
					result: 'pending' as const,
					livesGained: 0,
					livesSpent: 0,
					goalsCounted: pk.goalsScored ?? 0,
				}
			}
			const pickedSide: 'home' | 'away' = pk.teamId === fx.homeTeamId ? 'home' : 'away'
			const tierFromHome = computeTierDifference(fx.homeTeam, fx.awayTeam, g.competition.type)
			const tierFromPicked = pickedSide === 'home' ? tierFromHome : -tierFromHome
			const hidden = hideOpenPicks && !isViewer
			// Pending picks on in-progress fixtures project as winning / losing
			// based on current score — same visual as a settled pick. Cup-
			// specific outcomes (draw_success, saved_by_life) only appear post-
			// settlement when the streak/lives state is known.
			const mapped =
				pk.result === 'pending'
					? projectCupCellFromFixture(pickedSide, fx)
					: mapPickResult(pk.result)
			return {
				gamePlayerId: p.id,
				confidenceRank: pk.confidenceRank ?? 0,
				fixtureId: fx.id,
				homeShort: fx.homeTeam.shortName,
				awayShort: fx.awayTeam.shortName,
				pickedTeamId: pk.teamId,
				pickedSide,
				tierDifference: tierFromPicked,
				result: hidden ? 'hidden' : mapped,
				livesGained: hidden ? 0 : computeLivesGained(pk),
				livesSpent: hidden ? 0 : computeLivesSpent(pk),
				goalsCounted: pk.goalsScored ?? 0,
			}
		})
		const streak = computeStreak(picks)
		return {
			id: p.id,
			userId: p.userId,
			name: userNames.get(p.userId) ?? 'Player',
			status: p.status,
			livesRemaining: p.livesRemaining,
			streak,
			goals: picks.reduce((sum, pk) => sum + pk.goalsCounted, 0),
			hasSubmitted: myPicks.length > 0,
			eliminatedRoundNumber: null,
			eliminatedRoundLabel: null,
			picks,
		}
	})

	const competitionType = g.competition.type as 'league' | 'knockout' | 'group_knockout'

	return {
		gameId: g.id,
		roundId: g.currentRound.id,
		roundNumber: g.currentRound.number,
		roundLabel: roundLabel(competitionType, g.currentRound.number),
		// Per-game derived round status — see src/lib/game/round-status.ts.
		roundStatus: deriveGameRoundStatus({
			round: {
				id: g.currentRound.id,
				number: g.currentRound.number,
				status: g.currentRound.status,
				deadline: g.currentRound.deadline,
			},
			game: { currentRoundId: g.currentRound.id, currentRoundNumber: g.currentRound.number },
			now,
		}) as 'open' | 'active' | 'completed',
		maxLives: (g.modeConfig as { startingLives?: number } | null)?.startingLives ?? 3,
		numberOfPicks: (g.modeConfig as { numberOfPicks?: number } | null)?.numberOfPicks ?? 6,
		players,
	}
}

export function mapPickResult(r: string): 'win' | 'saved_by_life' | 'loss' | 'pending' {
	switch (r) {
		case 'win':
		case 'draw':
			return 'win'
		case 'saved_by_life':
			return 'saved_by_life'
		case 'loss':
			return 'loss'
		default:
			return 'pending'
	}
}

/**
 * Project the cell visual for a still-pending cup pick from the
 * fixture's current score. Same outcome buckets the settled mapping
 * uses (`win` / `loss` / `pending`). Cup-specific saved_by_life /
 * draw_success outcomes need streak + lives context and only appear
 * once the pick is fully settled by reevaluateCupGame.
 */
function projectCupCellFromFixture(
	pickedSide: 'home' | 'away',
	fx: { homeScore: number | null; awayScore: number | null },
): 'win' | 'loss' | 'pending' {
	if (fx.homeScore == null || fx.awayScore == null) return 'pending'
	const pickedScore = pickedSide === 'home' ? fx.homeScore : fx.awayScore
	const otherScore = pickedSide === 'home' ? fx.awayScore : fx.homeScore
	if (pickedScore > otherScore) return 'win'
	if (pickedScore < otherScore) return 'loss'
	// Draw — in cup, draws can be 'draw_success' (underdog) or 'loss'
	// (favourite/same-tier). Without streak context, render as loss for
	// the in-progress projection; the post-settlement value corrects it.
	return 'loss'
}

/**
 * Lives gained/spent now come from persisted `pick.life_gained` /
 * `pick.life_spent` (written by `reevaluateCupGame` in
 * `lib/game/settle.ts`). These helpers preserve the original recompute
 * signature for callers that still need a pure-function shape (tests).
 */
export function computeLivesGained(pk: { lifeGained?: number | null; result?: string }): number {
	return pk.lifeGained ?? 0
}

export function computeLivesSpent(pk: { lifeSpent?: boolean | null; result?: string }): number {
	if (pk.lifeSpent === true) return 1
	// Backwards-compat for any rows written before the column existed.
	if (pk.result === 'saved_by_life') return 1
	return 0
}

export function computeStreak(picks: CupStandingsPick[]): number {
	let streak = 0
	for (const p of [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)) {
		if (p.result === 'win' || p.result === 'saved_by_life') streak++
		else break
	}
	return streak
}

/**
 * A fixture is "crucial" for the cup ladder when it hasn't played yet AND
 * either splits the backing table (at least one player on each side) OR has
 * at least one no-lives-remaining player's pick on it.
 */
export function isCrucial(
	fixture: { actualOutcome: 'home_win' | 'draw' | 'away_win' | null },
	backers: { homeBackers: CupLadderBacker[]; awayBackers: CupLadderBacker[] },
	players: CupStandingsPlayer[],
): boolean {
	if (fixture.actualOutcome != null) return false
	const homeCount = backers.homeBackers.length
	const awayCount = backers.awayBackers.length
	if (homeCount >= 1 && awayCount >= 1) return true
	const allBackers = [...backers.homeBackers, ...backers.awayBackers]
	for (const b of allBackers) {
		const player = players.find((p) => p.id === b.playerId)
		if (player && player.livesRemaining === 0) return true
	}
	return false
}

export async function getCupLadderData(
	gameId: string,
	viewerUserId: string,
): Promise<CupLadderData | null> {
	const base = await getCupStandingsData(gameId, viewerUserId)
	if (!base) return null

	// Re-fetch the round fixtures so we have team details + scores.
	const g = await db.query.game.findFirst({
		where: (t, { eq: eqOp }) => eqOp(t.id, gameId),
		with: {
			competition: true,
			currentRound: {
				with: {
					fixtures: {
						with: { homeTeam: true, awayTeam: true },
						orderBy: (fx, { asc }) => asc(fx.kickoff),
					},
				},
			},
		},
	})
	if (!g?.currentRound) return null

	const fixturesRaw = g.currentRound.fixtures

	const fixtures: CupLadderFixture[] = fixturesRaw.map((fx) => {
		const tierFromHome = computeTierDifference(fx.homeTeam, fx.awayTeam, g.competition.type)
		const plusN = Math.abs(tierFromHome)
		const heart = plusN >= 2

		const actualOutcome: 'home_win' | 'draw' | 'away_win' | null =
			fx.homeScore != null && fx.awayScore != null
				? determineFixtureOutcome(fx.homeScore, fx.awayScore)
				: null

		const homeBackers: CupLadderBacker[] = []
		const awayBackers: CupLadderBacker[] = []

		for (const player of base.players) {
			for (const pk of player.picks) {
				if (pk.fixtureId !== fx.id) continue
				const backer: CupLadderBacker = {
					playerId: player.id,
					playerName: player.name,
					confidenceRank: pk.confidenceRank,
					result: pk.result === 'restricted' ? 'pending' : pk.result,
					livesGained: pk.livesGained,
					livesSpent: pk.livesSpent,
				}
				if (pk.pickedSide === 'home') homeBackers.push(backer)
				else awayBackers.push(backer)
			}
		}

		const crucial = isCrucial({ actualOutcome }, { homeBackers, awayBackers }, base.players)

		return {
			id: fx.id,
			homeTeam: {
				shortName: fx.homeTeam.shortName,
				name: fx.homeTeam.name,
				badgeUrl: fx.homeTeam.badgeUrl ?? null,
				color: fx.homeTeam.primaryColor ?? null,
			},
			awayTeam: {
				shortName: fx.awayTeam.shortName,
				name: fx.awayTeam.name,
				badgeUrl: fx.awayTeam.badgeUrl ?? null,
				color: fx.awayTeam.primaryColor ?? null,
			},
			kickoff: fx.kickoff ?? null,
			homeScore: fx.homeScore ?? null,
			awayScore: fx.awayScore ?? null,
			tierDifference: tierFromHome,
			plusN,
			heart,
			actualOutcome,
			homeBackers,
			awayBackers,
			crucial,
		}
	})

	return {
		...base,
		fixtures,
	}
}
