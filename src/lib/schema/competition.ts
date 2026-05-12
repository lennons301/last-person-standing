import { relations } from 'drizzle-orm'
import {
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
	status: varchar('status', { length: 20 }).notNull().default('active'),
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
	homeScore: integer('home_score'),
	awayScore: integer('away_score'),
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
}))

export const teamFormRelations = relations(teamForm, ({ one }) => ({
	team: one(team, { fields: [teamForm.teamId], references: [team.id] }),
	competition: one(competition, {
		fields: [teamForm.competitionId],
		references: [competition.id],
	}),
}))
