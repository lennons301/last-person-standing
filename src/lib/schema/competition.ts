import { relations } from 'drizzle-orm'
import {
	doublePrecision,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core'

// -- Enums --

export const competitionTypeEnum = pgEnum('competition_type', [
	'league',
	'knockout',
	'group_knockout',
])

export const competitionDataSourceEnum = pgEnum('competition_data_source', [
	'fpl',
	'football_data',
	'manual',
])

export const roundStatusEnum = pgEnum('round_status', ['upcoming', 'open', 'active', 'completed'])

export const fixtureStatusEnum = pgEnum('fixture_status', [
	'scheduled',
	'live',
	'finished',
	'postponed',
	// Fixture won't be played. settle.ts normalises adapter-reported
	// 'postponed' to this when the matchday boundary is crossed (per the
	// cancellation design — postponed PL fixtures move to other matchdays,
	// the survivor game has to roll over).
	'cancelled',
])

// -- Tables --

export const competition = pgTable('competition', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	type: competitionTypeEnum('type').notNull(),
	dataSource: competitionDataSourceEnum('data_source').notNull(),
	externalId: varchar('external_id', { length: 100 }),
	season: varchar('season', { length: 20 }),
	// Lifecycle: 'active' → offered at game creation, synced daily, polled live.
	// 'archived' → a finished season/tournament kept for history: hidden from
	// game creation, skipped by every sync/reconcile/poll surface, and never
	// mutated again. Completed games on it keep rendering unchanged.
	status: varchar('status', { length: 20 })
		.$type<'active' | 'archived'>()
		.notNull()
		.default('active'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const round = pgTable('round', {
	id: uuid('id').primaryKey().defaultRandom(),
	competitionId: uuid('competition_id')
		.notNull()
		.references(() => competition.id),
	number: integer('number').notNull(),
	name: varchar('name', { length: 100 }),
	status: roundStatusEnum('status').notNull().default('upcoming'),
	deadline: timestamp('deadline'),
	// Set when classic-mode round-void threshold (>50% or >5 absolute
	// fixtures cancelled) fires. round.status still flips to 'completed'
	// so game advancement runs; voided_at lets the UI render the
	// prominent "round voided" treatment without inferring it.
	voidedAt: timestamp('voided_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const team = pgTable('team', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	shortName: varchar('short_name', { length: 10 }).notNull(),
	badgeUrl: text('badge_url'),
	primaryColor: varchar('primary_color', { length: 7 }),
	externalIds: jsonb('external_ids').$type<Record<string, string | number>>().default({}),
	leaguePosition: integer('league_position'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const fixture = pgTable('fixture', {
	id: uuid('id').primaryKey().defaultRandom(),
	roundId: uuid('round_id')
		.notNull()
		.references(() => round.id),
	homeTeamId: uuid('home_team_id')
		.notNull()
		.references(() => team.id),
	awayTeamId: uuid('away_team_id')
		.notNull()
		.references(() => team.id),
	kickoff: timestamp('kickoff'),
	// Final score as reported by the source. NOTE: for knockout matches this is
	// football-data's `fullTime`, which INCLUDES extra time (and, for shootouts,
	// the penalty score). Classic "to qualify" scoring relies on `winner` (below),
	// not this value, so that's fine for classic. Cup scoring uses the 90-minute
	// score below instead.
	homeScore: integer('home_score'),
	awayScore: integer('away_score'),
	// 90-minute (regulation) score — football-data's `regularTime`. Null for
	// sources/matches that don't report it (regulation-only matches have it equal
	// to the full-time score). Cup mode scores on THIS so an underdog level at 90
	// minutes survives even if the tie is then lost in ET/penalties; the group
	// stage already scored on the 90-minute result, and this keeps knockouts
	// consistent. Classic is unaffected — it keeps using `winner`.
	regularHomeScore: integer('regular_home_score'),
	regularAwayScore: integer('regular_away_score'),
	// Authoritative winner for knockout ties decided in ET/penalties (full-time
	// score stays level). Null for draws / regulation results / non-knockout.
	// Classic "to qualify" scoring is driven by this.
	winner: text('winner').$type<'home' | 'away'>(),
	status: fixtureStatusEnum('status').notNull().default('scheduled'),
	// Source-specific id from the adapter that originally inserted the fixture.
	// Kept for backwards-compatibility; new code should prefer external_ids.
	externalId: varchar('external_id', { length: 100 }),
	// Per-source ids, e.g. { fpl: '347', football_data: '538131' }. Lets the
	// fixture be matched against any adapter independent of which one bootstrapped
	// it (notably: FPL rounds + structure, football-data live scores).
	externalIds: jsonb('external_ids').$type<Record<string, string | number>>().default({}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const teamForm = pgTable(
	'team_form',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id),
		competitionId: uuid('competition_id')
			.notNull()
			.references(() => competition.id),
		recentResults: jsonb('recent_results')
			.$type<
				Array<{
					opponent: string
					result: 'W' | 'D' | 'L'
					goalsFor: number
					goalsAgainst: number
					home: boolean
				}>
			>()
			.default([]),
		homeForm: jsonb('home_form').$type<Array<{ result: 'W' | 'D' | 'L' }>>().default([]),
		awayForm: jsonb('away_form').$type<Array<{ result: 'W' | 'D' | 'L' }>>().default([]),
		leaguePosition: integer('league_position'),
		lastUpdated: timestamp('last_updated').defaultNow().notNull(),
	},
	(table) => [uniqueIndex('team_form_team_comp_idx').on(table.teamId, table.competitionId)],
)

/**
 * Indicative bookmaker odds for one fixture — at most one row per fixture
 * (the unique index is the upsert target). Absence is meaningful: a fixture or
 * competition we have no odds for simply has no row, and every surface renders
 * no win-probability rather than a zero.
 *
 * Probabilities are de-vigged (see `src/lib/data/odds-api.ts`) and stored
 * alongside the raw decimal prices they came from, so a surface can show the
 * percentage and the price it derives from as one quote. `asOf` is the
 * bookmaker's own last-update stamp — the "odds as of {time}" the UI shows —
 * and stops moving once the round deadline passes (see `syncFixtureOdds`).
 */
export const fixtureOdds = pgTable(
	'fixture_odds',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		fixtureId: uuid('fixture_id')
			.notNull()
			.references(() => fixture.id),
		/** Odds provider, e.g. 'the_odds_api'. */
		source: varchar('source', { length: 50 }).notNull(),
		/** Provider's bookmaker key the prices were read from, e.g. 'betfair_ex_uk'. */
		bookmaker: varchar('bookmaker', { length: 50 }).notNull(),
		homePrice: doublePrecision('home_price').notNull(),
		drawPrice: doublePrecision('draw_price').notNull(),
		awayPrice: doublePrecision('away_price').notNull(),
		homeProbability: doublePrecision('home_probability').notNull(),
		drawProbability: doublePrecision('draw_probability').notNull(),
		awayProbability: doublePrecision('away_probability').notNull(),
		asOf: timestamp('as_of').notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [uniqueIndex('fixture_odds_fixture_idx').on(table.fixtureId)],
)

/**
 * One team's place in the official table at one matchday — the per-matchday
 * standings snapshot the form guide draws its position line from.
 *
 * `matchday` is the team's OWN played count at the moment of capture, not the
 * competition's round number: postponements leave clubs on different game
 * counts, and "position after N games played" is the only x-axis that stays
 * honest across them.
 *
 * Written by the daily sync, from the same adapter standings read that sets
 * `team.leaguePosition` (see `persistLeaguePositions`). It **accumulates from
 * deployment onward** — there is no historical backfill, so a competition
 * mid-season starts its line at whatever matchday the first sync after deploy
 * observed. `(competition, team, matchday)` is the upsert target, so repeated
 * syncs within one matchday refresh that point rather than duplicating it.
 */
export const standingsSnapshot = pgTable(
	'standings_snapshot',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		competitionId: uuid('competition_id')
			.notNull()
			.references(() => competition.id),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id),
		/** The team's played count at capture. See the table comment. */
		matchday: integer('matchday').notNull(),
		position: integer('position').notNull(),
		played: integer('played').notNull(),
		won: integer('won').notNull(),
		drawn: integer('drawn').notNull(),
		lost: integer('lost').notNull(),
		points: integer('points').notNull(),
		capturedAt: timestamp('captured_at').defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex('standings_snapshot_comp_team_matchday_idx').on(
			table.competitionId,
			table.teamId,
			table.matchday,
		),
	],
)

// -- Relations --

export const competitionRelations = relations(competition, ({ many }) => ({
	rounds: many(round),
}))

export const roundRelations = relations(round, ({ one, many }) => ({
	competition: one(competition, {
		fields: [round.competitionId],
		references: [competition.id],
	}),
	fixtures: many(fixture),
}))

export const fixtureRelations = relations(fixture, ({ one }) => ({
	round: one(round, { fields: [fixture.roundId], references: [round.id] }),
	homeTeam: one(team, { fields: [fixture.homeTeamId], references: [team.id] }),
	awayTeam: one(team, { fields: [fixture.awayTeamId], references: [team.id] }),
	odds: one(fixtureOdds, { fields: [fixture.id], references: [fixtureOdds.fixtureId] }),
}))

export const fixtureOddsRelations = relations(fixtureOdds, ({ one }) => ({
	fixture: one(fixture, { fields: [fixtureOdds.fixtureId], references: [fixture.id] }),
}))

export const standingsSnapshotRelations = relations(standingsSnapshot, ({ one }) => ({
	team: one(team, { fields: [standingsSnapshot.teamId], references: [team.id] }),
	competition: one(competition, {
		fields: [standingsSnapshot.competitionId],
		references: [competition.id],
	}),
}))

export const teamFormRelations = relations(teamForm, ({ one }) => ({
	team: one(team, { fields: [teamForm.teamId], references: [team.id] }),
	competition: one(competition, {
		fields: [teamForm.competitionId],
		references: [competition.id],
	}),
}))
