import { describe, expect, it } from 'vitest'
import {
	activeField,
	canAdminReinstate,
	eliminationUpdate,
	isAdminRemoved,
	reinstatementUpdate,
} from './elimination'

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

describe('reinstatementUpdate', () => {
	it('clears the round and the reason along with the status', () => {
		expect(reinstatementUpdate()).toEqual({
			status: 'alive',
			eliminatedReason: null,
			eliminatedRoundId: null,
		})
	})

	it('undoes any eliminationUpdate completely', () => {
		const out = eliminationUpdate('loss', 'r7')
		const back = { ...out, ...reinstatementUpdate() }
		expect(back).toEqual({ status: 'alive', eliminatedReason: null, eliminatedRoundId: null })
		expect(canAdminReinstate(back)).toBe(false)
	})
})

describe('canAdminReinstate', () => {
	it('is true for an eliminated player whatever took them out', () => {
		// #280: the rule used to be `reason === 'missed_rebuy_pick'`, so a player
		// the admin sold a rebuy to after a later-round loss could not be picked
		// for — the paid-for entry bought a seat in no game at all.
		expect(canAdminReinstate({ status: 'eliminated', eliminatedReason: 'loss' })).toBe(true)
		expect(canAdminReinstate({ status: 'eliminated', eliminatedReason: 'missed_rebuy_pick' })).toBe(
			true,
		)
		expect(
			canAdminReinstate({ status: 'eliminated', eliminatedReason: 'no_pick_no_fallback' }),
		).toBe(true)
		expect(
			canAdminReinstate({ status: 'eliminated', eliminatedReason: 'no_remaining_teams' }),
		).toBe(true)
		// Eliminated with no reason recorded is a row we shouldn't have, but it is
		// still a player who is out — reinstating is the harmless reading.
		expect(canAdminReinstate({ status: 'eliminated', eliminatedReason: null })).toBe(true)
	})

	it('is false for a player who is not out — there is nothing to undo', () => {
		expect(canAdminReinstate({ status: 'alive', eliminatedReason: null })).toBe(false)
		expect(canAdminReinstate({ status: 'winner', eliminatedReason: null })).toBe(false)
		// A stale reason on an alive row must not read as "out" either.
		expect(canAdminReinstate({ status: 'alive', eliminatedReason: 'loss' })).toBe(false)
	})

	it('is false for an admin removal — that is undone by un-removing, not by a pick', () => {
		expect(canAdminReinstate({ status: 'eliminated', eliminatedReason: 'admin_removed' })).toBe(
			false,
		)
	})
})
