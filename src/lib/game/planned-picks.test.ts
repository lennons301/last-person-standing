import { describe, expect, it } from 'vitest'
import { computeUsedTeamIds, validatePlannedPick } from './planned-picks'

describe('computeUsedTeamIds', () => {
	it('returns teams used in completed past rounds', () => {
		const used = computeUsedTeamIds({
			pastPicks: [
				{ roundNumber: 1, teamId: 't-ars' },
				{ roundNumber: 2, teamId: 't-liv' },
			],
			plannedPicks: [],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual(['t-ars', 't-liv'])
	})

	it('includes planned picks from other rounds', () => {
		const used = computeUsedTeamIds({
			pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
			plannedPicks: [
				{ roundNumber: 4, teamId: 't-che' },
				{ roundNumber: 5, teamId: 't-mci' },
			],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual(['t-ars', 't-che'])
	})

	it('excludes the target round so the user can change their own plan', () => {
		const used = computeUsedTeamIds({
			pastPicks: [],
			plannedPicks: [{ roundNumber: 5, teamId: 't-ars' }],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual([])
	})
})

describe('validatePlannedPick', () => {
	it('allows a pick of an unused team', () => {
		expect(
			validatePlannedPick({
				teamId: 't-che',
				roundNumber: 5,
				pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
				plannedPicks: [{ roundNumber: 4, teamId: 't-liv' }],
			}),
		).toEqual({ valid: true })
	})

	it('rejects when team was used in a past round', () => {
		expect(
			validatePlannedPick({
				teamId: 't-ars',
				roundNumber: 5,
				pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
				plannedPicks: [],
			}),
		).toEqual({ valid: false, reason: 'team-already-used', roundNumber: 1 })
	})

	it('rejects when team is already planned for another round', () => {
		expect(
			validatePlannedPick({
				teamId: 't-che',
				roundNumber: 5,
				pastPicks: [],
				plannedPicks: [{ roundNumber: 3, teamId: 't-che' }],
			}),
		).toEqual({ valid: false, reason: 'team-already-planned', roundNumber: 3 })
	})

	it('allows replacing the target round’s own plan', () => {
		expect(
			validatePlannedPick({
				teamId: 't-che',
				roundNumber: 5,
				pastPicks: [],
				plannedPicks: [{ roundNumber: 5, teamId: 't-che' }],
			}),
		).toEqual({ valid: true })
	})
})
