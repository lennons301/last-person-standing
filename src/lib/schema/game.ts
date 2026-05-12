import { relations } from 'drizzle-orm'
import {
	boolean,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core'
import { competition, fixture, round, team } from './competition'

// -- Enums --

export const gameModeEnum = pgEnum('game_mode', ['classic', 'turbo', 'cup'])

export const gameStatusEnum = pgEnum('game_status', ['setup', 'open', 'active', 'completed'])

export const playerStatusEnum = pgEnum('player_status', ['alive', 'eliminated', 'winner'])

export const pickResultEnum = pgEnum('pick_result', [
	'pending',
	'win',
	'loss',
	'draw',
	'saved_by_life',
])

// -- Tables --

export const game = pgTable('game', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	createdBy: text('created_by').notNull(),
	status: gameStatusEnum('status').notNull().default('setup'),
	gameMode: gameModeEnum('game_mode').notNull(),
	modeConfig: jsonb('mode_config')
		.$type<{
			startingLives?: number
			numberOfPicks?: number
			allowRebuys?: boolean
		}>()
		.default({}),
	competitionId: uuid('competition_id')
		.notNull()
		.references(() => competition.id),
	entryFee: numeric('entry_fee', { precision: 10, scale: 2 }),
	maxPlayers: integer('max_players'),
	inviteCode: varchar('invite_code', { length: 20 }).notNull().unique(),
	currentRoundId: uuid('current_round_id').references(() => round.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const gamePlayer = pgTable(
	'game_player',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		gameId: uuid('game_id')
			.notNull()
			.references(() => game.id),
		userId: text('user_id').notNull(),
		status: playerStatusEnum('status').notNull().default('alive'),
		eliminatedRoundId: uuid('eliminated_round_id').references(() => round.id),
		// Valid values: 'loss' | 'missed_rebuy_pick' | 'no_pick_no_fallback' | 'admin_removed'
		eliminatedReason: text('eliminated_reason'),
		livesRemaining: integer('lives_remaining').notNull().default(0),
		joinedAt: timestamp('joined_at').defaultNow().notNull(),
	},
	(table) => [uniqueIndex('game_player_unique_idx').on(table.gameId, table.userId)],
)

export const pick = pgTable(
	'pick',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		gameId: uuid('game_id')
			.notNull()
			.references(() => game.id),
		gamePlayerId: uuid('game_player_id')
			.notNull()
			.references(() => gamePlayer.id),
		roundId: uuid('round_id')
			.notNull()
			.references(() => round.id),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id),
		fixtureId: uuid('fixture_id').references(() => fixture.id),
		confidenceRank: integer('confidence_rank'),
		predictedResult: varchar('predicted_result', { length: 10 }),
		result: pickResultEnum('result').notNull().default('pending'),
		goalsScored: integer('goals_scored'),
		// Cup-mode bookkeeping: persisted by reevaluateCupGame on each settlement.
		// Replaces the read-time recomputation that used to live in
		// cup-standings-queries.computeLivesGained / computeLivesSpent.
		// Non-cup picks: always 0 / false. Cup picks: as evaluated by
		// evaluateCupPicks (lives_gained on underdog wins / 2-tier-plus draws,
		// life_spent when a save consumed a life).
		lifeGained: integer('life_gained').notNull().default(0),
		lifeSpent: boolean('life_spent').notNull().default(false),
		autoSubmitted: boolean('auto_submitted').notNull().default(false),
		isAuto: boolean('is_auto').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex('pick_player_round_idx').on(
			table.gamePlayerId,
			table.roundId,
			table.confidenceRank,
		),
	],
)

export const plannedPick = pgTable(
	'planned_pick',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		gamePlayerId: uuid('game_player_id')
			.notNull()
			.references(() => gamePlayer.id),
		roundId: uuid('round_id')
			.notNull()
			.references(() => round.id),
		teamId: uuid('team_id')
			.notNull()
			.references(() => team.id),
		autoSubmit: boolean('auto_submit').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [uniqueIndex('planned_pick_unique_idx').on(table.gamePlayerId, table.roundId)],
)

// -- Relations --

export const gameRelations = relations(game, ({ one, many }) => ({
	competition: one(competition, {
		fields: [game.competitionId],
		references: [competition.id],
	}),
	currentRound: one(round, {
		fields: [game.currentRoundId],
		references: [round.id],
	}),
	players: many(gamePlayer),
	picks: many(pick),
}))

export const gamePlayerRelations = relations(gamePlayer, ({ one, many }) => ({
	game: one(game, { fields: [gamePlayer.gameId], references: [game.id] }),
	eliminatedRound: one(round, {
		fields: [gamePlayer.eliminatedRoundId],
		references: [round.id],
	}),
	picks: many(pick),
	plannedPicks: many(plannedPick),
}))

export const pickRelations = relations(pick, ({ one }) => ({
	game: one(game, { fields: [pick.gameId], references: [game.id] }),
	gamePlayer: one(gamePlayer, {
		fields: [pick.gamePlayerId],
		references: [gamePlayer.id],
	}),
	round: one(round, { fields: [pick.roundId], references: [round.id] }),
	team: one(team, { fields: [pick.teamId], references: [team.id] }),
	fixture: one(fixture, { fields: [pick.fixtureId], references: [fixture.id] }),
}))

export const plannedPickRelations = relations(plannedPick, ({ one }) => ({
	gamePlayer: one(gamePlayer, {
		fields: [plannedPick.gamePlayerId],
		references: [gamePlayer.id],
	}),
	round: one(round, { fields: [plannedPick.roundId], references: [round.id] }),
	team: one(team, { fields: [plannedPick.teamId], references: [team.id] }),
}))
