import type {
  teams,
  gameweeks,
  fixtures,
  games,
  gamePlayers,
  gameGameweeks,
  picks,
  cupFixtures,
  gameWinners,
  gameModeEnum,
  gameStatusEnum,
  playerStatusEnum,
  gameweekStatusEnum,
  pickResultEnum,
} from "./schema/domain"
import type { user } from "./schema/auth"

// Row types (what you get back from a SELECT)
export type Team = typeof teams.$inferSelect
export type Gameweek = typeof gameweeks.$inferSelect
export type Fixture = typeof fixtures.$inferSelect
export type Game = typeof games.$inferSelect
export type GamePlayer = typeof gamePlayers.$inferSelect
export type GameGameweek = typeof gameGameweeks.$inferSelect
export type Pick = typeof picks.$inferSelect
export type CupFixture = typeof cupFixtures.$inferSelect
export type GameWinner = typeof gameWinners.$inferSelect
export type User = typeof user.$inferSelect

// Insert types (what you pass to INSERT)
export type NewTeam = typeof teams.$inferInsert
export type NewGameweek = typeof gameweeks.$inferInsert
export type NewFixture = typeof fixtures.$inferInsert
export type NewGame = typeof games.$inferInsert
export type NewGamePlayer = typeof gamePlayers.$inferInsert
export type NewPick = typeof picks.$inferInsert

// Enum value types
export type GameMode = (typeof gameModeEnum.enumValues)[number]
export type GameStatus = (typeof gameStatusEnum.enumValues)[number]
export type PlayerStatus = (typeof playerStatusEnum.enumValues)[number]
export type GameweekStatus = (typeof gameweekStatusEnum.enumValues)[number]
export type PickResult = (typeof pickResultEnum.enumValues)[number]

// Game settings (typed from the jsonb column)
export interface GameSettings {
  maxPlayers?: number
  allowRebuys?: boolean
}
