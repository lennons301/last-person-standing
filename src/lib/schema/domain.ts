import { sql } from "drizzle-orm"
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  uuid,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

// Enums
export const gameModeEnum = pgEnum("game_mode", [
  "classic",
  "turbo",
  "cup",
  "escalating",
])
export const gameStatusEnum = pgEnum("game_status", [
  "open",
  "active",
  "finished",
])
export const playerStatusEnum = pgEnum("player_status", [
  "alive",
  "eliminated",
  "winner",
])
export const gameweekStatusEnum = pgEnum("gameweek_status", [
  "pending",
  "active",
  "complete",
])
export const pickModeEnum = pgEnum("pick_mode", [
  "classic",
  "turbo",
  "cup",
  "escalating",
])
export const pickResultEnum = pgEnum("pick_result", [
  "pending",
  "won",
  "lost",
  "draw",
])

// Teams (synced from FPL)
export const teams = pgTable("teams", {
  id: integer("id").primaryKey(), // FPL team ID
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  code: integer("code").notNull(),
})

// Gameweeks (synced from FPL)
export const gameweeks = pgTable("gameweeks", {
  id: integer("id").primaryKey(), // FPL gameweek number
  name: text("name").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  finished: boolean("finished").notNull().default(false),
})

// Fixtures (synced from FPL, updated by live scores)
export const fixtures = pgTable("fixtures", {
  id: integer("id").primaryKey(), // FPL fixture ID
  gameweekId: integer("gameweek_id")
    .notNull()
    .references(() => gameweeks.id),
  homeTeamId: integer("home_team_id")
    .notNull()
    .references(() => teams.id),
  awayTeamId: integer("away_team_id")
    .notNull()
    .references(() => teams.id),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  kickoff: timestamp("kickoff", { withTimezone: true }),
  started: boolean("started").notNull().default(false),
  finished: boolean("finished").notNull().default(false),
})

// Games
export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  mode: gameModeEnum("mode").notNull(),
  status: gameStatusEnum("status").notNull().default("open"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  startingGameweek: integer("starting_gameweek").references(() => gameweeks.id),
  entryFee: numeric("entry_fee"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Game players
export const gamePlayers = pgTable(
  "game_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => user.id),
    status: playerStatusEnum("status").notNull().default("alive"),
    eliminatedAtGameweek: integer("eliminated_at_gameweek").references(
      () => gameweeks.id
    ),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("game_players_unique").on(table.gameId, table.playerId),
  ]
)

// Game gameweeks (per-game gameweek state)
export const gameGameweeks = pgTable(
  "game_gameweeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    gameweekId: integer("gameweek_id")
      .notNull()
      .references(() => gameweeks.id),
    status: gameweekStatusEnum("status").notNull().default("pending"),
  },
  (table) => [
    uniqueIndex("game_gameweeks_unique").on(table.gameId, table.gameweekId),
  ]
)

// Unified picks table
export const picks = pgTable(
  "picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => user.id),
    gameweekId: integer("gameweek_id")
      .notNull()
      .references(() => gameweeks.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    fixtureId: integer("fixture_id").references(() => fixtures.id),
    mode: pickModeEnum("mode").notNull(),
    prediction: text("prediction"), // turbo: home/draw/away
    stake: numeric("stake"), // escalating mode
    cupRound: integer("cup_round"), // cup mode
    result: pickResultEnum("result").default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Classic/escalating: one pick per gameweek per player per game
    uniqueIndex("picks_classic_unique")
      .on(table.gameId, table.playerId, table.gameweekId)
      .where(sql`mode IN ('classic', 'escalating')`),
    // Turbo: one pick per fixture per player per game
    uniqueIndex("picks_turbo_unique")
      .on(table.gameId, table.playerId, table.gameweekId, table.fixtureId)
      .where(sql`mode = 'turbo'`),
    // Classic: cannot reuse a team within a game
    uniqueIndex("picks_classic_no_team_reuse")
      .on(table.gameId, table.playerId, table.teamId)
      .where(sql`mode = 'classic'`),
  ]
)

// Cup fixtures (bracket)
export const cupFixtures = pgTable("cup_fixtures", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  player1Id: text("player_1_id").references(() => user.id),
  player2Id: text("player_2_id").references(() => user.id),
  winnerId: text("winner_id").references(() => user.id),
  fixtureId: integer("fixture_id").references(() => fixtures.id),
})

// Game winners
export const gameWinners = pgTable("game_winners", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: text("player_id")
    .notNull()
    .references(() => user.id),
  prizeAmount: numeric("prize_amount"),
  isSplit: boolean("is_split").notNull().default(false),
})
