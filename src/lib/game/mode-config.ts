import type { StoredModeConfig } from '@/lib/schema/game'
import type { GameMode } from '@/lib/types'

export type { StoredModeConfig }

/**
 * A game's mode settings, resolved: every field the mode has, no optionals, no
 * per-reader default.
 *
 * The union is discriminated on the mode because the settings are not shared —
 * `startingLives` is a cup idea, `allowRebuys` a classic one — so reading a
 * field the mode doesn't have is a compile error rather than a `?? 0` that
 * quietly invents an answer. Produced only by {@link resolveModeConfig}; the
 * stored shape ({@link StoredModeConfig}, every field optional because a game
 * created before a setting existed simply doesn't carry it) never reaches a
 * reader.
 */
export type ModeConfig =
	| { mode: 'classic'; allowRebuys: boolean }
	| { mode: 'turbo'; numberOfPicks: number }
	| { mode: 'cup'; numberOfPicks: number; startingLives: number }

/**
 * What a setting means when the game doesn't say. Declared once, here, because
 * these used to be sixteen inline `??`s and they had already drifted: cup's
 * `numberOfPicks` fell back to 10 in the picks route (which validated the
 * submission) and to 6 in the standings query (which drew the grid), so a cup
 * game missing the field was checked against one number and rendered with
 * another (#248).
 *
 * - `allowRebuys: false` — a game that never said it allows them doesn't.
 * - `numberOfPicks: 10` — the create form's own default, and what `types.ts`
 *   documented before this module existed.
 * - `startingLives: 0` — lives are earned by underdog picks in cup, not handed
 *   out. Settlement has always read it this way; every other reader now agrees.
 */
export const MODE_CONFIG_DEFAULTS = {
	allowRebuys: false,
	numberOfPicks: 10,
	startingLives: 0,
} as const

/**
 * The one reader of `game.mode_config`.
 *
 * Takes the game row (the mode and the stored jsonb) and answers with the
 * mode's settings in full. Every surface that needs one — settlement, the
 * deadline lock, both rebuy routes, the pick validators, the standings queries,
 * the game page — goes through this rather than casting the column to whatever
 * partial shape it happens to want.
 *
 * `allowRebuys` is read as `=== true` rather than `?? false`: the column is
 * jsonb, so a row written before the field was typed can hold anything, and
 * only an explicit `true` should open a rebuy window.
 */
export function resolveModeConfig(game: {
	gameMode: GameMode
	modeConfig: StoredModeConfig | null | undefined
}): ModeConfig {
	const stored = game.modeConfig ?? {}
	switch (game.gameMode) {
		case 'classic':
			return { mode: 'classic', allowRebuys: stored.allowRebuys === true }
		case 'turbo':
			return {
				mode: 'turbo',
				numberOfPicks: stored.numberOfPicks ?? MODE_CONFIG_DEFAULTS.numberOfPicks,
			}
		case 'cup':
			return {
				mode: 'cup',
				numberOfPicks: stored.numberOfPicks ?? MODE_CONFIG_DEFAULTS.numberOfPicks,
				startingLives: stored.startingLives ?? MODE_CONFIG_DEFAULTS.startingLives,
			}
	}
}
