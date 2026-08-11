import { describe, expect, it } from 'vitest'
import { buildChainSlots, buildPlannerRounds, type FutureRoundRow } from './classic-planner-view'

function futureRound(
	overrides: Partial<FutureRoundRow> & { id: string; number: number },
): FutureRoundRow {
	return {
		name: `GW${overrides.number}`,
		label: `GW${overrides.number}`,
		deadline: new Date('2099-01-01T00:00:00Z'),
		fixtures: [
			{
				id: `${overrides.id}-fx`,
				kickoff: new Date('2099-01-01T12:00:00Z'),
				homeTeam: {
					id: 'home',
					name: 'Home',
					shortName: 'HOM',
					badgeUrl: null,
					primaryColor: null,
					leaguePosition: 3,
				},
				awayTeam: {
					id: 'away',
					name: 'Away',
					shortName: 'AWY',
					badgeUrl: null,
					primaryColor: null,
					leaguePosition: 17,
				},
			},
		],
		...overrides,
	}
}

describe('buildPlannerRounds — locked advance picks', () => {
	it('marks a future round with a real locked pick as locked', () => {
		const rounds = buildPlannerRounds({
			futureRounds: [futureRound({ id: 'r5', number: 5 })],
			pastPicks: [],
			lockedPicks: [{ roundId: 'r5', roundNumber: 5, teamId: 'home' }],
		})
		expect(rounds[0].lockedTeamId).toBe('home')
	})

	it('has no locked team when the round has no real pick', () => {
		const rounds = buildPlannerRounds({
			futureRounds: [futureRound({ id: 'r5', number: 5 })],
			pastPicks: [],
			lockedPicks: [],
		})
		expect(rounds[0].lockedTeamId).toBeNull()
	})

	it('labels a team locked in another future round as PICKED, not selectable here', () => {
		const rounds = buildPlannerRounds({
			futureRounds: [futureRound({ id: 'r5', number: 5 }), futureRound({ id: 'r6', number: 6 })],
			pastPicks: [],
			lockedPicks: [{ roundId: 'r5', roundNumber: 5, teamId: 'home' }],
		})
		const r6 = rounds.find((r) => r.roundId === 'r6')
		const used = r6?.usedTeams.find((u) => u.teamId === 'home')
		expect(used).toEqual({ teamId: 'home', label: 'PICKED GW5', kind: 'used' })
	})

	it('carries form and league position onto planner fixtures', () => {
		// Parity with the current-round picker: a planner row shows form dots and a
		// league position, so the player can tell which in-form team to spend and
		// which to save. Form here is *current* form — the future round's fixtures
		// haven't been played.
		const rounds = buildPlannerRounds({
			futureRounds: [futureRound({ id: 'r5', number: 5 })],
			pastPicks: [],
			lockedPicks: [],
			formByTeamId: new Map([['home', ['W', 'D', 'L']]]),
		})
		const fx = rounds[0].fixtures[0]
		expect(fx.homeTeam.form).toEqual(['W', 'D', 'L'])
		expect(fx.homeTeam.leaguePosition).toBe(3)
		// No form for the away side is `undefined`, not an empty array — the row
		// distinguishes "no results yet" from "played and lost every one".
		expect(fx.awayTeam.form).toBeUndefined()
		expect(fx.awayTeam.leaguePosition).toBe(17)
	})

	it('keeps past-round picks marked as USED', () => {
		const rounds = buildPlannerRounds({
			futureRounds: [futureRound({ id: 'r5', number: 5 })],
			pastPicks: [{ roundNumber: 2, teamId: 'home' }],
			lockedPicks: [],
		})
		expect(rounds[0].usedTeams).toContainEqual({ teamId: 'home', label: 'USED GW2', kind: 'used' })
	})
})

describe('buildChainSlots — locked future picks render as locked', () => {
	const baseRounds = [
		{ id: 'r4', number: 4, name: null, label: 'GW4', status: 'completed' as const },
		{ id: 'r5', number: 5, name: null, label: 'GW5', status: 'upcoming' as const },
	]

	it('renders a locked future pick as a planned-locked slot', () => {
		const { slots, summary } = buildChainSlots({
			rounds: baseRounds,
			pastPicks: [],
			currentPick: null,
			lockedPicks: [{ roundId: 'r5', teamId: 'home', teamShortName: 'HOM', teamColour: null }],
			currentRoundId: 'r4',
			upcomingRoundsFixturesTbc: new Set(),
			totalTeams: 20,
		})
		const r5 = slots.find((s) => s.roundId === 'r5')
		expect(r5?.state).toEqual({ kind: 'planned-locked', teamShort: 'HOM', teamColour: null })
		expect(summary.planned).toBe(1)
	})
})
