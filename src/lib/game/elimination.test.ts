import { describe, expect, it } from 'vitest'
import { activeField, eliminationUpdate, isAdminRemoved } from './elimination'

describe('isAdminRemoved', () => {
	it('is true only for an admin removal', () => {
		expect(isAdminRemoved({ eliminatedReason: 'admin_removed' })).toBe(true)
		expect(isAdminRemoved({ eliminatedReason: 'loss' })).toBe(false)
		expect(isAdminRemoved({ eliminatedReason: 'no_remaining_teams' })).toBe(false)
		expect(isAdminRemoved({ eliminatedReason: null })).toBe(false)
	})
})

describe('activeField', () => {
	it('drops admin-removed players and keeps everyone else, eliminated included', () => {
		const players = [
			{ id: 'alive', eliminatedReason: null },
			{ id: 'lost', eliminatedReason: 'loss' as const },
			{ id: 'removed', eliminatedReason: 'admin_removed' as const },
			{ id: 'no-teams', eliminatedReason: 'no_remaining_teams' as const },
		]
		expect(activeField(players).map((p) => p.id)).toEqual(['alive', 'lost', 'no-teams'])
	})

	it("preserves order and the caller's own row shape", () => {
		const players = [
			{ id: 'b', name: 'Bea', eliminatedReason: null },
			{ id: 'a', name: 'Ash', eliminatedReason: 'missed_rebuy_pick' as const },
		]
		expect(activeField(players)).toEqual(players)
	})

	it('returns an empty field rather than throwing when everyone was removed', () => {
		expect(activeField([{ eliminatedReason: 'admin_removed' as const }])).toEqual([])
	})
})

describe('eliminationUpdate', () => {
	it('always carries a status and a reason', () => {
		expect(eliminationUpdate('loss', 'round-1')).toEqual({
			status: 'eliminated',
			eliminatedReason: 'loss',
			eliminatedRoundId: 'round-1',
		})
	})

	it('takes a null round for an elimination that belongs to none', () => {
		expect(eliminationUpdate('admin_removed', null)).toEqual({
			status: 'eliminated',
			eliminatedReason: 'admin_removed',
			eliminatedRoundId: null,
		})
	})

	it('produces a patch activeField reads as still in the field', () => {
		expect(isAdminRemoved(eliminationUpdate('no_remaining_teams', 'r7'))).toBe(false)
		expect(isAdminRemoved(eliminationUpdate('admin_removed', null))).toBe(true)
	})
})
