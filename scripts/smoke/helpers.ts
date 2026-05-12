/**
 * Smoke-test fixtures and DB helpers.
 *
 * Smoke tests run against a real Postgres (the same database the unit tests
 * use in CI). They cover the full pick → fixture-finish → reconcile →
 * processed-result → advance lifecycle, deliberately bypassing the
 * live-poll observation path so the recovery code (lib/game/reconcile.ts)
 * is what's under test.
 *
 * Conventions:
 *  - One `resetDb()` per test so scenarios are isolated.
 *  - `make*` helpers return primary keys, not row objects — keeps tests
 *    minimal and reads explicit.
 *  - No game-creation API calls. We seed directly so the lifecycle test
 *    is decoupled from the API layer (covered by route tests already).
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
	competition,
	fixture,
	round as roundTable,
	team as teamTable,
} from '@/lib/schema/competition'
import { game, gamePlayer, pick, plannedPick } from '@/lib/schema/game'

type CompetitionType = 'league' | 'knockout' | 'group_knockout'
type DataSource = 'fpl' | 'football_data' | 'manual'
type RoundStatus = 'upcoming' | 'open' | 'active' | 'completed'
type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed'
type GameMode = 'classic' | 'turbo' | 'cup'

/**
 * Truncate every table touched by smoke fixtures, in FK-respecting order.
 * CASCADE so we don't have to enumerate the relations. Faster than DELETE
 * for the small row counts we use.
 */
export async function resetDb(): Promise<void> {
	await db.execute(sql`
		TRUNCATE TABLE
			planned_pick,
			pick,
			game_player,
			payment,
			payout,
			game,
			fixture,
			round,
			team_form,
			team,
			competition
		RESTART IDENTITY CASCADE
	`)
}

export async function makeCompetition(opts: {
	name?: string
	type: CompetitionType
	dataSource: DataSource
}): Promise<string> {
	const [c] = await db
		.insert(competition)
		.values({
			name: opts.name ?? 'Smoke Comp',
			type: opts.type,
			dataSource: opts.dataSource,
			status: 'active',
		})
		.returning()
	return c.id
}

export async function makeTeam(opts: {
	name: string
	shortName: string
	fifaPot?: 1 | 2 | 3 | 4
}): Promise<string> {
	const externalIds: Record<string, string | number> = {}
	if (opts.fifaPot != null) externalIds.fifa_pot = opts.fifaPot
	const [t] = await db
		.insert(teamTable)
		.values({
			name: opts.name,
			shortName: opts.shortName,
			externalIds,
		})
		.returning()
	return t.id
}

export async function makeRound(
	competitionId: string,
	opts: { number: number; status?: RoundStatus; deadline?: Date | null },
): Promise<string> {
	const [r] = await db
		.insert(roundTable)
		.values({
			competitionId,
			number: opts.number,
			name: `Round ${opts.number}`,
			status: opts.status ?? 'open',
			deadline: opts.deadline ?? new Date(Date.now() - 60_000), // default: just passed
		})
		.returning()
	return r.id
}

export async function makeFixture(opts: {
	roundId: string
	homeTeamId: string
	awayTeamId: string
	kickoff?: Date
	status?: FixtureStatus
	homeScore?: number | null
	awayScore?: number | null
}): Promise<string> {
	const [f] = await db
		.insert(fixture)
		.values({
			roundId: opts.roundId,
			homeTeamId: opts.homeTeamId,
			awayTeamId: opts.awayTeamId,
			kickoff: opts.kickoff ?? new Date(Date.now() - 3_600_000),
			status: opts.status ?? 'scheduled',
			homeScore: opts.homeScore ?? null,
			awayScore: opts.awayScore ?? null,
		})
		.returning()
	return f.id
}

export async function makeGame(opts: {
	name?: string
	competitionId: string
	gameMode: GameMode
	currentRoundId: string
	createdBy?: string
	modeConfig?: Record<string, unknown>
}): Promise<string> {
	const [g] = await db
		.insert(game)
		.values({
			name: opts.name ?? 'Smoke Game',
			competitionId: opts.competitionId,
			gameMode: opts.gameMode,
			currentRoundId: opts.currentRoundId,
			createdBy: opts.createdBy ?? 'smoke-creator',
			inviteCode: `smoke-${Math.random().toString(36).slice(2, 10)}`,
			status: 'active',
			modeConfig: opts.modeConfig ?? {},
		})
		.returning()
	return g.id
}

export async function makePlayer(opts: {
	gameId: string
	userId: string
	livesRemaining?: number
}): Promise<string> {
	const [gp] = await db
		.insert(gamePlayer)
		.values({
			gameId: opts.gameId,
			userId: opts.userId,
			livesRemaining: opts.livesRemaining ?? 0,
		})
		.returning()
	return gp.id
}

export async function makePick(opts: {
	gameId: string
	gamePlayerId: string
	roundId: string
	teamId: string
	fixtureId: string
	confidenceRank?: number
	predictedResult?: 'home_win' | 'draw' | 'away_win'
}): Promise<string> {
	const [p] = await db
		.insert(pick)
		.values({
			gameId: opts.gameId,
			gamePlayerId: opts.gamePlayerId,
			roundId: opts.roundId,
			teamId: opts.teamId,
			fixtureId: opts.fixtureId,
			confidenceRank: opts.confidenceRank ?? null,
			predictedResult: opts.predictedResult ?? null,
		})
		.returning()
	return p.id
}

/**
 * Mark a fixture finished with the given score. This is the
 * "missed transition" path — the same write `syncCompetition` performs
 * when it pulls final scores from the adapter and writes them to the
 * fixture row without going through the live-poll enqueueProcessRound
 * path. The whole point of reconcile is that it can pick up after this.
 */
export async function finishFixture(
	fixtureId: string,
	homeScore: number,
	awayScore: number,
): Promise<void> {
	await db
		.update(fixture)
		.set({ status: 'finished', homeScore, awayScore })
		.where(sql`${fixture.id} = ${fixtureId}`)
}

/** Suppress an unused import warning until plannedPick is used by a scenario. */
export const _plannedPickRef = plannedPick
