import { describe, expect, it } from 'vitest'
import { FALLBACK_TEAM_COLOUR, getTeamColour } from './colours'

describe('getTeamColour', () => {
	// 2026/27 promoted clubs — must not render the grey fallback when a badge
	// is unavailable (issue #115).
	it.each(['COV', 'HUL', 'IPS'])('%s has a non-grey fallback colour', (code) => {
		const colour = getTeamColour(code)
		expect(colour).not.toBe(FALLBACK_TEAM_COLOUR)
		expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/)
	})

	it('is case-insensitive', () => {
		expect(getTeamColour('cov')).toBe(getTeamColour('COV'))
	})

	it('falls back to grey for unknown codes', () => {
		expect(getTeamColour('ZZZ')).toBe(FALLBACK_TEAM_COLOUR)
	})
})
