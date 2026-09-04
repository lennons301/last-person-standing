import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	buildChainSlots,
	buildPlannerRounds,
	type ChainLockedPickRow,
	type ChainPastPickRow,
	type ChainRoundRow,
	type ChainSlot,
	type ChainSummary,
	type FutureRoundRow,
	type PlannerRoundInput,
} from '@/lib/game/classic-planner-view'
import { toFixtureOddsView } from '@/lib/game/fixture-odds-view'
import { type UsedRoundLabel, usedRoundLabel } from '@/lib/game/pick-table-view'
import type {
	CupPickFixture,
	CupPickSlot,
	FormResult,
	PickFixture,
	TeamStandingLine,
} from '@/lib/game/pick-view-types'
import { roundLabel } from '@/lib/game/round-label'
import { deriveGameRoundStatus } from '@/lib/game/round-status'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, pick } from '@/lib/schema/game'
import type { CompetitionType } from '@/lib/types'

/**
 * What the three pickers are rendered from: one read per mode, each declaring
 * the shape it hands over. The view types themselves live in
 * `pick-view-types.ts` — the components render what these build, not the other
 * way round (#249).
 */

export interface ClassicPickData {
	roundName: string
	roundNumber: number
	competitionId: string
	/** Which view the picker opens on: a league opens on the Table. */
	competitionType: CompetitionType
	deadline: Date | null
	fixtures: PickFixture[]
	/** teamId → the earlier round that team was spent in, short label and long. */
	usedTeamsByRound: Record<string, UsedRoundLabel>
	existingPickTeamId: string | null
	existingPickFixtureId: string | null
}

export interface TurboPickData {
	roundNumber: number
	competitionId: string
	/** Which view the remaining fixtures open on: a league opens on the Table. */
	competitionType: CompetitionType
	fixtures: PickFixture[]
	existingPicks: Array<{
		fixtureId: string
		confidenceRank: number
		predictedResult: 'home_win' | 'draw' | 'away_win'
	}>
}

export interface CupPickData {
	fixtures: CupPickFixture[]
	initialSlots: CupPickSlot[]
}

export interface ClassicPlannerData {
	chain: { slots: ChainSlot[]; summary: ChainSummary }
	futureRounds: PlannerRoundInput[]
}

/**
 * Compute a team's form from their last N finished fixtures across the competition.
 */
async function computeTeamForms(
	teamIds: string[],
	competitionId: string,
	beforeRoundNumber: number,
	lastN = 6,
): Promise<Map<string, FormResult[]>> {
	if (teamIds.length === 0) return new Map()

	// Get all finished fixtures for this competition in rounds before the target round
	const finished = await db
		.select({
			homeTeamId: fixture.homeTeamId,
			awayTeamId: fixture.awayTeamId,
			homeScore: fixture.homeScore,
			awayScore: fixture.awayScore,
			roundNumber: round.number,
		})
		.from(fixture)
		.innerJoin(round, eq(round.id, fixture.roundId))
		.where(
			and(
				eq(round.competitionId, competitionId),
				eq(fixture.status, 'finished'),
				lt(round.number, beforeRoundNumber),
				or(inArray(fixture.homeTeamId, teamIds), inArray(fixture.awayTeamId, teamIds)),
			),
		)
		.orderBy(desc(round.number))

	const map = new Map<string, FormResult[]>()
	for (const row of finished) {
		if (row.homeScore == null || row.awayScore == null) continue
		const home = row.homeScore
		const away = row.awayScore
		for (const teamId of [row.homeTeamId, row.awayTeamId]) {
			if (!teamIds.includes(teamId)) continue
			const list = map.get(teamId) ?? []
			if (list.length >= lastN) continue
			const isHome = teamId === row.homeTeamId
			let result: FormResult
			if (home === away) result = 'D'
			else if (isHome) result = home > away ? 'W' : 'L'
			else result = away > home ? 'W' : 'L'
			list.push(result)
			map.set(teamId, list)
		}
	}
	return map
}

/**
 * The team's standings line for the pick surfaces' Table view. Passed through
 * as-is, nulls included: a null played/points is "no table here", which the
 * board renders as a dash rather than as a zero.
 */
function toStandingLine(t: {
	played: number | null
	points: number | null
	goalsFor: number | null
	goalsAgainst: number | null
}): TeamStandingLine {
	return {
		played: t.played,
		points: t.points,
		goalsFor: t.goalsFor,
		goalsAgainst: t.goalsAgainst,
	}
}

export async function getClassicPickData(
	gameId: string,
	roundId: string,
	gamePlayerId: string,
): Promise<ClassicPickData | null> {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: {
				with: { homeTeam: true, awayTeam: true, odds: true },
				orderBy: (fx, { asc }) => asc(fx.kickoff),
			},
			competition: true,
		},
	})

	if (!roundData) return null

	const myPreviousPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gamePlayerId)),
		with: { round: true },
	})

	// A game plays one competition, so every previous pick's round labels the same
	// way this one does.
	const competitionType = roundData.competition.type
	const usedTeamsByRound: Record<string, UsedRoundLabel> = {}
	for (const p of myPreviousPicks) {
		if (p.roundId !== roundId && p.round) {
			usedTeamsByRound[p.teamId] = usedRoundLabel(competitionType, p.round.number)
		}
	}

	const currentPick = myPreviousPicks.find((p) => p.roundId === roundId)

	// Build team IDs and fetch form data
	const teamIds = Array.from(
		new Set(roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
	)
	const formMap = await computeTeamForms(teamIds, roundData.competitionId, roundData.number)

	const fixtures: PickFixture[] = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
			badgeUrl: f.homeTeam.badgeUrl,
			form: formMap.get(f.homeTeamId),
			leaguePosition: f.homeTeam.leaguePosition,
			standing: toStandingLine(f.homeTeam),
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
			badgeUrl: f.awayTeam.badgeUrl,
			form: formMap.get(f.awayTeamId),
			leaguePosition: f.awayTeam.leaguePosition,
			standing: toStandingLine(f.awayTeam),
		},
		kickoff: f.kickoff ? f.kickoff.toISOString() : null,
		odds: toFixtureOddsView(f.odds),
	}))

	return {
		roundName: roundData.name ?? `GW${roundData.number}`,
		roundNumber: roundData.number,
		competitionId: roundData.competitionId,
		competitionType: roundData.competition.type,
		deadline: roundData.deadline,
		fixtures,
		usedTeamsByRound,
		existingPickTeamId: currentPick?.teamId ?? null,
		existingPickFixtureId: currentPick?.fixtureId ?? null,
	}
}

export async function getTurboPickData(
	gameId: string,
	roundId: string,
	gamePlayerId: string,
): Promise<TurboPickData | null> {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: {
				with: { homeTeam: true, awayTeam: true, odds: true },
				orderBy: (fx, { asc }) => asc(fx.kickoff),
			},
			competition: true,
		},
	})
	if (!roundData) return null

	const existingPicks = await db.query.pick.findMany({
		where: and(
			eq(pick.gameId, gameId),
			eq(pick.gamePlayerId, gamePlayerId),
			eq(pick.roundId, roundId),
		),
	})

	const teamIds = Array.from(
		new Set(roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
	)
	const formMap = await computeTeamForms(teamIds, roundData.competitionId, roundData.number)

	const fixtures: PickFixture[] = roundData.fixtures.map((f) => ({
		id: f.id,
		home: {
			id: f.homeTeamId,
			name: f.homeTeam.name,
			shortName: f.homeTeam.shortName,
			badgeUrl: f.homeTeam.badgeUrl,
			form: formMap.get(f.homeTeamId),
			leaguePosition: f.homeTeam.leaguePosition,
			standing: toStandingLine(f.homeTeam),
		},
		away: {
			id: f.awayTeamId,
			name: f.awayTeam.name,
			shortName: f.awayTeam.shortName,
			badgeUrl: f.awayTeam.badgeUrl,
			form: formMap.get(f.awayTeamId),
			leaguePosition: f.awayTeam.leaguePosition,
			standing: toStandingLine(f.awayTeam),
		},
		kickoff: f.kickoff ? f.kickoff.toISOString() : null,
		odds: toFixtureOddsView(f.odds),
	}))

	return {
		// No round name or deadline: the game hero derives both from
		// `buildGameView` and renders them directly above the turbo picker, which
		// no longer repeats either.
		roundNumber: roundData.number,
		competitionId: roundData.competitionId,
		competitionType: roundData.competition.type,
		fixtures,
		existingPicks: existingPicks.map((p) => ({
			fixtureId: p.fixtureId ?? '',
			confidenceRank: p.confidenceRank ?? 0,
			predictedResult: (p.predictedResult ?? 'home_win') as 'home_win' | 'draw' | 'away_win',
		})),
	}
}

/**
 * Cup's picker: the round's fixtures with their tier handicap, plus whatever
 * the player has already ranked.
 *
 * Sourced from the TARGET player's picks, so an admin acting-as sees the
 * target's slot state and not their own. Assembled here rather than in the game
 * page, beside classic's and turbo's, so the three pickers are read the same
 * way (#249).
 */
export async function getCupPickData(
	gameId: string,
	roundId: string,
	gamePlayerId: string,
): Promise<CupPickData | null> {
	const roundData = await db.query.round.findFirst({
		where: eq(round.id, roundId),
		with: {
			fixtures: {
				with: { homeTeam: true, awayTeam: true },
				orderBy: (fx, { asc }) => asc(fx.kickoff),
			},
			competition: true,
		},
	})
	if (!roundData) return null

	const existingPicks = await db.query.pick.findMany({
		where: and(
			eq(pick.gameId, gameId),
			eq(pick.gamePlayerId, gamePlayerId),
			eq(pick.roundId, roundId),
		),
	})

	const fixtures: CupPickFixture[] = roundData.fixtures.map((f) => ({
		id: f.id,
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
		homeShort: f.homeTeam.shortName,
		homeName: f.homeTeam.name,
		homeColor: f.homeTeam.primaryColor,
		homeBadgeUrl: f.homeTeam.badgeUrl,
		awayShort: f.awayTeam.shortName,
		awayName: f.awayTeam.name,
		awayColor: f.awayTeam.primaryColor,
		awayBadgeUrl: f.awayTeam.badgeUrl,
		kickoff: f.kickoff,
		tierDifference: computeTierDifference(f.homeTeam, f.awayTeam, roundData.competition.type),
	}))

	const initialSlots: CupPickSlot[] = existingPicks
		.filter((p) => p.fixtureId != null && p.confidenceRank != null)
		.map((p) => ({
			confidenceRank: p.confidenceRank as number,
			fixtureId: p.fixtureId as string,
			pickedSide: (p.predictedResult === 'away_win' ? 'away' : 'home') as 'home' | 'away',
		}))

	return { fixtures, initialSlots }
}

/**
 * Load everything needed to render the classic-pick chain ribbon and the
 * planner section: all rounds in the competition, the player's own past and
 * planned picks (with team metadata), and every upcoming round's fixtures.
 */
export async function getClassicPlannerData(
	gameId: string,
	gamePlayerId: string,
	currentRoundId: string | null,
): Promise<ClassicPlannerData | null> {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: {
				with: {
					rounds: {
						orderBy: (r, { asc }) => asc(r.number),
						with: {
							fixtures: {
								with: { homeTeam: true, awayTeam: true },
								orderBy: (fx, { asc }) => asc(fx.kickoff),
							},
						},
					},
				},
			},
		},
	})
	if (!gameData) return null

	// Pull the player's picks across all rounds. With lockable advance picks,
	// a pick can exist for a future (not-yet-current) round, so we classify
	// each pick as past / current / locked-future below.
	const playerPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, gamePlayerId)),
		with: { round: true, team: true },
	})

	const now = new Date()
	const currentRoundNumber = currentRoundId
		? (gameData.competition.rounds.find((r) => r.id === currentRoundId)?.number ?? null)
		: null
	const competitionType = gameData.competition.type
	const rounds: ChainRoundRow[] = gameData.competition.rounds.map((r) => ({
		id: r.id,
		number: r.number,
		name: r.name,
		label: roundLabel(competitionType, r.number),
		status: deriveGameRoundStatus({
			round: { id: r.id, number: r.number, status: r.status, deadline: r.deadline },
			game: { currentRoundId, currentRoundNumber },
			now,
		}),
	}))

	// A pick is a locked ADVANCE pick when it's for a round later than the
	// game's current round (the C1 feature). Anything for an earlier round is
	// in the past; the current-round pick is handled separately for the ribbon.
	const isFuturePick = (p: (typeof playerPicks)[number]) =>
		p.roundId !== currentRoundId &&
		currentRoundNumber != null &&
		p.round != null &&
		p.round.number > currentRoundNumber

	const pastPicks: ChainPastPickRow[] = playerPicks
		.filter((p) => p.roundId !== currentRoundId && !isFuturePick(p))
		.map((p) => ({
			roundId: p.roundId,
			teamId: p.teamId,
			result: p.result,
			teamShortName: p.team.shortName,
			teamColour: p.team.primaryColor,
		}))

	const lockedFuturePicks = playerPicks.filter(isFuturePick)

	const currentPickRow = currentRoundId
		? playerPicks.find((p) => p.roundId === currentRoundId)
		: undefined
	const currentPick = currentPickRow
		? {
				roundId: currentPickRow.roundId,
				teamShortName: currentPickRow.team.shortName,
				teamColour: currentPickRow.team.primaryColor,
			}
		: null

	const lockedPicksChain: ChainLockedPickRow[] = lockedFuturePicks.map((p) => ({
		roundId: p.roundId,
		teamId: p.teamId,
		teamShortName: p.team.shortName,
		teamColour: p.team.primaryColor,
	}))

	const upcomingRoundsFixturesTbc = new Set<string>()
	for (const r of gameData.competition.rounds) {
		if (r.status === 'upcoming' && r.fixtures.length === 0) {
			upcomingRoundsFixturesTbc.add(r.id)
		}
	}

	// Count distinct teams in the competition. We derive this from the team
	// table joined on this competition's fixtures — any team appearing in a
	// fixture counts as "in the competition".
	const teamRows = await db
		.selectDistinct({ id: team.id })
		.from(team)
		.innerJoin(fixture, or(eq(fixture.homeTeamId, team.id), eq(fixture.awayTeamId, team.id)))
		.innerJoin(round, eq(round.id, fixture.roundId))
		.where(eq(round.competitionId, gameData.competition.id))
	const totalTeams = teamRows.length

	const chain = buildChainSlots({
		rounds,
		pastPicks,
		currentPick,
		lockedPicks: lockedPicksChain,
		currentRoundId,
		upcomingRoundsFixturesTbc,
		totalTeams,
	})

	// Build future-round inputs: every upcoming round, whether its fixtures
	// are published or not. The PlannerRound component handles the TBC case.
	const futureRoundRows: FutureRoundRow[] = gameData.competition.rounds
		.filter((r) => r.status === 'upcoming')
		.map((r) => ({
			id: r.id,
			number: r.number,
			name: r.name,
			label: roundLabel(competitionType, r.number),
			deadline: r.deadline,
			fixtures: r.fixtures.map((f) => ({
				id: f.id,
				kickoff: f.kickoff,
				homeTeam: {
					id: f.homeTeam.id,
					name: f.homeTeam.name,
					shortName: f.homeTeam.shortName,
					badgeUrl: f.homeTeam.badgeUrl,
					primaryColor: f.homeTeam.primaryColor,
					leaguePosition: f.homeTeam.leaguePosition,
				},
				awayTeam: {
					id: f.awayTeam.id,
					name: f.awayTeam.name,
					shortName: f.awayTeam.shortName,
					badgeUrl: f.awayTeam.badgeUrl,
					primaryColor: f.awayTeam.primaryColor,
					leaguePosition: f.awayTeam.leaguePosition,
				},
			})),
		}))

	// Form for a planner row is *current* form: every finished fixture in the
	// competition, not "as of" the round being planned (its opponents haven't
	// played yet). Bounding above the highest round number is what expresses
	// that — and it lines up with the form sheet the row taps through to, which
	// filters on `< roundNumber` and so sees the same finished set for any
	// upcoming round.
	const formBound = Math.max(0, ...gameData.competition.rounds.map((r) => r.number)) + 1
	const plannerTeamIds = Array.from(
		new Set(
			futureRoundRows.flatMap((r) => r.fixtures.flatMap((f) => [f.homeTeam.id, f.awayTeam.id])),
		),
	)
	const plannerForms = await computeTeamForms(plannerTeamIds, gameData.competition.id, formBound)

	// Past + current picks count as "used" in the planner (for the "USED GW3"
	// labels). Locked future picks are passed separately so each future round
	// shows its own lock and greys out teams locked into other future rounds.
	const pastPicksForPlanner = playerPicks
		.filter((p) => !isFuturePick(p) && p.round)
		.map((p) => ({ roundNumber: p.round.number, teamId: p.teamId }))
	const lockedPicksForPlanner = lockedFuturePicks
		.filter((p) => p.round)
		.map((p) => ({ roundId: p.roundId, roundNumber: p.round.number, teamId: p.teamId }))

	const futureRounds = buildPlannerRounds({
		futureRounds: futureRoundRows,
		pastPicks: pastPicksForPlanner,
		lockedPicks: lockedPicksForPlanner,
		formByTeamId: plannerForms,
	})

	return { chain, futureRounds }
}
