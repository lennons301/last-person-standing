import type { ChainSlot } from '@/components/picks/chain-ribbon'
import type { PlannerFixture, UsedInfo } from '@/components/picks/planner-round'

/**
 * Pure view-builders for the classic-pick chain ribbon + planner section.
 *
 * These functions take already-loaded database rows and assemble the exact
 * props the client components need. Keeping the mapping out of the page
 * component lets us unit-test it without hitting the DB.
 */

export interface ChainSummary {
	played: number
	planned: number
	availableTeams: number
	totalTeams: number
}

export interface PlannerRoundInput {
	roundId: string
	roundNumber: number
	roundName: string
	roundLabel: string
	deadline: Date | null
	fixturesTbc: boolean
	fixtures: PlannerFixture[]
	usedTeams: UsedInfo[]
	plannedTeamId: string | null
	plannedAutoSubmit: boolean
}

export interface ChainRoundRow {
	id: string
	number: number
	name: string | null
	label: string
	status: 'upcoming' | 'open' | 'active' | 'completed'
}

export interface ChainPastPickRow {
	roundId: string
	teamId: string
	result: 'pending' | 'win' | 'loss' | 'draw' | 'saved_by_life' | 'void'
	teamShortName: string
	teamColour: string | null
}

export interface ChainPlannedPickRow {
	roundId: string
	teamId: string
	autoSubmit: boolean
	teamShortName: string
	teamColour: string | null
}

export interface ChainCurrentPickInfo {
	roundId: string
	teamShortName: string | null
	teamColour: string | null
}

export interface BuildChainSlotsInput {
	rounds: ChainRoundRow[]
	pastPicks: ChainPastPickRow[] // completed rounds only (result != pending)
	currentPick: ChainCurrentPickInfo | null
	plannedPicks: ChainPlannedPickRow[]
	currentRoundId: string | null
	upcomingRoundsFixturesTbc: Set<string>
	totalTeams: number
}

export function buildChainSlots(input: BuildChainSlotsInput): {
	slots: ChainSlot[]
	summary: ChainSummary
} {
	const pastById = new Map(input.pastPicks.map((p) => [p.roundId, p]))
	const planById = new Map(input.plannedPicks.map((p) => [p.roundId, p]))

	const slots: ChainSlot[] = input.rounds.map((r) => {
		if (r.id === input.currentRoundId) {
			const plan = planById.get(r.id)
			if (plan) {
				return {
					roundId: r.id,
					roundNumber: r.number,
					roundLabel: r.label,
					state: plan.autoSubmit
						? {
								kind: 'planned-locked',
								teamShort: plan.teamShortName,
								teamColour: plan.teamColour,
							}
						: {
								kind: 'planned',
								teamShort: plan.teamShortName,
								teamColour: plan.teamColour,
							},
				}
			}
			return {
				roundId: r.id,
				roundNumber: r.number,
				roundLabel: r.label,
				state: {
					kind: 'current',
					teamShort: input.currentPick?.teamShortName ?? null,
					teamColour: input.currentPick?.teamColour ?? null,
				},
			}
		}

		// Completed round — render based on result
		const past = pastById.get(r.id)
		if (past) {
			if (past.result === 'win' || past.result === 'saved_by_life') {
				return {
					roundId: r.id,
					roundNumber: r.number,
					roundLabel: r.label,
					state: { kind: 'win', teamShort: past.teamShortName, teamColour: past.teamColour },
				}
			}
			if (past.result === 'draw') {
				return {
					roundId: r.id,
					roundNumber: r.number,
					roundLabel: r.label,
					state: { kind: 'draw', teamShort: past.teamShortName, teamColour: past.teamColour },
				}
			}
			if (past.result === 'loss') {
				return {
					roundId: r.id,
					roundNumber: r.number,
					roundLabel: r.label,
					state: { kind: 'loss', teamShort: past.teamShortName, teamColour: past.teamColour },
				}
			}
		}

		// Upcoming round — planned or empty or tbc
		const plan = planById.get(r.id)
		if (plan) {
			return {
				roundId: r.id,
				roundNumber: r.number,
				roundLabel: r.label,
				state: plan.autoSubmit
					? {
							kind: 'planned-locked',
							teamShort: plan.teamShortName,
							teamColour: plan.teamColour,
						}
					: {
							kind: 'planned',
							teamShort: plan.teamShortName,
							teamColour: plan.teamColour,
						},
			}
		}

		if (input.upcomingRoundsFixturesTbc.has(r.id)) {
			return {
				roundId: r.id,
				roundNumber: r.number,
				roundLabel: r.label,
				state: { kind: 'tbc' },
			}
		}

		return {
			roundId: r.id,
			roundNumber: r.number,
			roundLabel: r.label,
			state: { kind: 'empty' },
		}
	})

	const played = input.pastPicks.length
	const planned = input.plannedPicks.length
	const usedCount = new Set<string>([
		...input.pastPicks.map((p) => p.teamId),
		...input.plannedPicks.map((p) => p.teamId),
	]).size
	const availableTeams = Math.max(0, input.totalTeams - usedCount)

	return {
		slots,
		summary: { played, planned, availableTeams, totalTeams: input.totalTeams },
	}
}

export interface FutureRoundRow {
	id: string
	number: number
	name: string | null
	label: string
	deadline: Date | null
	fixtures: Array<{
		id: string
		kickoff: Date | null
		homeTeam: {
			id: string
			name: string
			shortName: string
			badgeUrl: string | null
			primaryColor: string | null
		}
		awayTeam: {
			id: string
			name: string
			shortName: string
			badgeUrl: string | null
			primaryColor: string | null
		}
	}>
}

export interface BuildPlannerRoundsInput {
	futureRounds: FutureRoundRow[]
	pastPicks: Array<{ roundNumber: number; teamId: string }>
	plannedPicks: Array<{ roundNumber: number; teamId: string; autoSubmit: boolean; roundId: string }>
}

/**
 * Build the PlannerRound inputs for every upcoming round.
 * Applies cascading "used" labels — a pick in an earlier planned gameweek
 * locks that team out of later gameweeks automatically.
 */
export function buildPlannerRounds(input: BuildPlannerRoundsInput): PlannerRoundInput[] {
	const sortedFutures = [...input.futureRounds].sort((a, b) => a.number - b.number)

	return sortedFutures.map((r) => {
		const fixturesTbc = r.fixtures.length === 0
		const plan = input.plannedPicks.find((p) => p.roundId === r.id)
		const plannedTeamId = plan?.teamId ?? null
		const plannedAutoSubmit = plan?.autoSubmit ?? false

		// A team is "used" for this round if:
		//   - it was picked in a past (completed) round, OR
		//   - it is planned for any OTHER round (planned in this round is handled by plannedTeamId).
		const usedTeams: UsedInfo[] = []
		for (const pp of input.pastPicks) {
			usedTeams.push({
				teamId: pp.teamId,
				label: `USED GW${pp.roundNumber}`,
				kind: 'used',
			})
		}
		for (const plp of input.plannedPicks) {
			if (plp.roundId === r.id) continue
			usedTeams.push({
				teamId: plp.teamId,
				label: `PLANNED GW${plp.roundNumber}`,
				kind: 'planned-elsewhere',
			})
		}

		const fixtures: PlannerFixture[] = r.fixtures.map((f) => ({
			id: f.id,
			kickoff: f.kickoff,
			homeTeam: {
				id: f.homeTeam.id,
				name: f.homeTeam.name,
				short: f.homeTeam.shortName,
				colour: f.homeTeam.primaryColor,
				badgeUrl: f.homeTeam.badgeUrl,
			},
			awayTeam: {
				id: f.awayTeam.id,
				name: f.awayTeam.name,
				short: f.awayTeam.shortName,
				colour: f.awayTeam.primaryColor,
				badgeUrl: f.awayTeam.badgeUrl,
			},
		}))

		return {
			roundId: r.id,
			roundNumber: r.number,
			roundLabel: r.label,
			roundName: r.name ?? r.label,
			deadline: r.deadline,
			fixturesTbc,
			fixtures,
			usedTeams,
			plannedTeamId,
			plannedAutoSubmit,
		}
	})
}
