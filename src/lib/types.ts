import type { user } from './schema/auth'
import type {
	competition,
	fixture,
	fixtureOdds,
	round,
	standingsSnapshot,
	team,
	teamForm,
} from './schema/competition'
import type { game, gamePlayer, pick, plannedPick } from './schema/game'
import type { payment, payout } from './schema/payment'

// -- Inferred select types --

export type User = typeof user.$inferSelect
export type Competition = typeof competition.$inferSelect
export type Round = typeof round.$inferSelect
export type Team = typeof team.$inferSelect
export type Fixture = typeof fixture.$inferSelect
export type TeamForm = typeof teamForm.$inferSelect
/** A fixture's persisted bookmaker odds (de-vigged probabilities + raw prices). */
export type FixtureOddsRow = typeof fixtureOdds.$inferSelect
/** One team's table place at one matchday — the form guide's position line. */
export type StandingsSnapshot = typeof standingsSnapshot.$inferSelect
export type Game = typeof game.$inferSelect
export type GamePlayer = typeof gamePlayer.$inferSelect
export type Pick = typeof pick.$inferSelect
export type PlannedPick = typeof plannedPick.$inferSelect
export type Payment = typeof payment.$inferSelect
export type Payout = typeof payout.$inferSelect

// -- Inferred insert types --

export type NewCompetition = typeof competition.$inferInsert
export type NewRound = typeof round.$inferInsert
export type NewTeam = typeof team.$inferInsert
export type NewFixture = typeof fixture.$inferInsert
export type NewGame = typeof game.$inferInsert
export type NewGamePlayer = typeof gamePlayer.$inferInsert
export type NewPick = typeof pick.$inferInsert
export type NewPlannedPick = typeof plannedPick.$inferInsert
export type NewPayment = typeof payment.$inferInsert
export type NewPayout = typeof payout.$inferInsert

// -- Enum value types --

export type CompetitionType = Competition['type']
export type RoundStatus = Round['status']
export type FixtureStatus = Fixture['status']
export type GameMode = Game['gameMode']
export type GameStatus = Game['status']
export type GameVisibility = Game['visibility']
export type PlayerStatus = GamePlayer['status']
/** Why a player is out. Declared in the schema beside the column it types. */
export type { EliminationReason } from './schema/game'
export type PickResult = Pick['result']
export type PaymentStatus = Payment['status']

// -- Mode config types --

export type ClassicModeConfig = Record<string, never>

export interface TurboModeConfig {
	numberOfPicks?: number // default 10
}

export interface CupModeConfig {
	startingLives?: number // default 0
	numberOfPicks?: number // default 10
}

export type ModeConfig = ClassicModeConfig | TurboModeConfig | CupModeConfig
