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

	it("reveals an opponent's pick once the round's deadline has passed", () => {
		expect(
			resolvePickVisibility({
				round: { status: 'active', deadline: new Date('2026-06-15T11:00:00Z') },
				pick: { gamePlayerId: 'gp-rival' },
				viewerGamePlayerId: VIEWER,
				now: NOW,
			}),
		).toBe('visible')
	})

	it("reveals an opponent's pick on a processed round whose deadline is somehow still ahead", () => {
		expect(
			resolvePickVisibility({
				round: { status: 'completed', deadline: new Date('2026-06-15T18:00:00Z') },
				pick: { gamePlayerId: 'gp-rival' },
				viewerGamePlayerId: VIEWER,
				now: NOW,
			}),
		).toBe('visible')
	})

	it("reveals an opponent's unlocked pick when the caller passes revealAll", () => {
		expect(
			resolvePickVisibility({
				round: OPEN_ROUND,
				pick: { gamePlayerId: 'gp-rival' },
				viewerGamePlayerId: VIEWER,
				now: NOW,
				revealAll: true,
			}),
		).toBe('visible')
	})

	it('hides an unlocked pick from a surface with no viewer, its own picker included', () => {
		// What the share path's `hideUnlockedPicks` asks for: a shared image
		// reveals nothing that has not locked.
		expect(
			resolvePickVisibility({
				round: OPEN_ROUND,
				pick: OWN_PICK,
				viewerGamePlayerId: null,
				now: NOW,
			}),
		).toBe('hidden')
	})

	it('hides an unlocked pick on a round carrying no deadline at all', () => {
		expect(
			resolvePickVisibility({
				round: { status: 'upcoming', deadline: null },
				pick: { gamePlayerId: 'gp-rival' },
				viewerGamePlayerId: VIEWER,
				now: NOW,
			}),
		).toBe('hidden')
	})
})
