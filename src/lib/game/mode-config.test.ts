import { describe, expect, it } from 'vitest'
import type { GameMode } from '@/lib/types'
import { MODE_CONFIG_DEFAULTS, resolveModeConfig, type StoredModeConfig } from './mode-config'

/**
 * The defaults, one row per mode. This table is the contract: a reader that
 * wants a different answer changes it here, once, rather than adding a
 * seventeenth `??` (#248).
 */
const DEFAULTS_TABLE: Array<{ mode: GameMode; expected: ReturnType<typeof resolveModeConfig> }> = [
	{ mode: 'classic', expected: { mode: 'classic', allowRebuys: false } },
	{ mode: 'turbo', expected: { mode: 'turbo', numberOfPicks: 10 } },
	{ mode: 'cup', expected: { mode: 'cup', numberOfPicks: 10, startingLives: 0 } },
]

/** Every way a game can say nothing about its settings. */
const NOTHING_STORED: Array<{ name: string; modeConfig: StoredModeConfig | null | undefined }> = [
	{ name: 'an empty object (the column default)', modeConfig: {} },
	{ name: 'null', modeConfig: null },
	{ name: 'undefined', modeConfig: undefined },
]

describe('resolveModeConfig — defaults', () => {
	for (const { mode, expected } of DEFAULTS_TABLE) {
		for (const { name, modeConfig } of NOTHING_STORED) {
			it(`${mode} with ${name} resolves to the declared defaults`, () => {
				expect(resolveModeConfig({ gameMode: mode, modeConfig })).toEqual(expected)
			})
		}
	}

	it('resolves the same way whoever asks — one game, one answer', () => {
		// The divergence this seam closed: `numberOfPicks` fell back to 10 in the
		// picks route (which validated the submission) and to 6 in the cup
		// standings query (which drew the grid), so a cup game missing the field
		// was checked against one number and rendered with another.
		const cupGame = { gameMode: 'cup' as const, modeConfig: {} }
		const validator = resolveModeConfig(cupGame)
		const grid = resolveModeConfig(cupGame)
		expect(validator).toEqual(grid)
		expect(validator.mode === 'cup' && validator.numberOfPicks).toBe(
			MODE_CONFIG_DEFAULTS.numberOfPicks,
		)
	})
})

describe('resolveModeConfig — stored values', () => {
	it('takes the stored setting over the default', () => {
		expect(resolveModeConfig({ gameMode: 'classic', modeConfig: { allowRebuys: true } })).toEqual({
			mode: 'classic',
			allowRebuys: true,
		})
		expect(resolveModeConfig({ gameMode: 'turbo', modeConfig: { numberOfPicks: 5 } })).toEqual({
			mode: 'turbo',
			numberOfPicks: 5,
		})
		expect(
			resolveModeConfig({
				gameMode: 'cup',
				modeConfig: { numberOfPicks: 6, startingLives: 3 },
			}),
		).toEqual({ mode: 'cup', numberOfPicks: 6, startingLives: 3 })
	})

	it('keeps a stored zero rather than treating it as absent', () => {
		expect(
			resolveModeConfig({ gameMode: 'cup', modeConfig: { startingLives: 0, numberOfPicks: 6 } }),
		).toEqual({ mode: 'cup', numberOfPicks: 6, startingLives: 0 })
	})

	it('opens the rebuy window only on an explicit true', () => {
		// The column is jsonb: a row written before the field was typed can hold
		// anything, and only `true` means the creator chose rebuys.
		expect(
			resolveModeConfig({
				gameMode: 'classic',
				modeConfig: { allowRebuys: 'yes' } as unknown as StoredModeConfig,
			}),
		).toEqual({ mode: 'classic', allowRebuys: false })
	})

	it('ignores settings belonging to another mode', () => {
		// A classic game carrying cup's lives has no lives; the union is what makes
		// reading them a compile error rather than a silent 3.
		expect(
			resolveModeConfig({
				gameMode: 'classic',
				modeConfig: { allowRebuys: true, startingLives: 3, numberOfPicks: 6 },
			}),
		).toEqual({ mode: 'classic', allowRebuys: true })
	})
})
