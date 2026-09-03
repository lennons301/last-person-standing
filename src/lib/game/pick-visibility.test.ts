import { describe, expect, it } from 'vitest'
import { resolvePickVisibility } from './pick-visibility'

const NOW = new Date('2026-06-15T12:00:00Z')
const OPEN_ROUND = { status: 'open' as const, deadline: new Date('2026-06-15T18:00:00Z') }
const VIEWER = 'gp-viewer'
const OWN_PICK = { gamePlayerId: VIEWER }

describe('resolvePickVisibility', () => {
	it("shows the viewer their own pick before the round's deadline", () => {
		expect(
			resolvePickVisibility({
				round: OPEN_ROUND,
				pick: OWN_PICK,
				viewerGamePlayerId: VIEWER,
				now: NOW,
			}),
		).toBe('visible')
	})

	it("hides an opponent's pick before the round's deadline", () => {
		expect(
			resolvePickVisibility({
				round: OPEN_ROUND,
				pick: { gamePlayerId: 'gp-rival' },
				viewerGamePlayerId: VIEWER,
				now: NOW,
			}),
		).toBe('hidden')
	})
})
