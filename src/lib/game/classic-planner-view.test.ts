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
				},
				awayTeam: {
					id: 'away',
					name: 'Away',
					shortName: 'AWY',
					badgeUrl: null,
					primaryColor: null,
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
