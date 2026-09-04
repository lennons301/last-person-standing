import type { FormResult } from '@/lib/game/pick-view-types'

/**
 * Pure view-builders for the classic-pick chain ribbon + planner section.
 *
 * These functions take already-loaded database rows and assemble the exact
 * props the client components need. Keeping the mapping out of the page
 * component lets us unit-test it without hitting the DB — and the shapes they
 * build are declared here rather than in the components that render them, so
 * the dependency arrow runs lib → components and not back (#249).
 */

/** What one round's slot in the chain ribbon shows. */
export type ChainSlotState =
	| { kind: 'win'; teamShort: string; teamColour: string | null }
	| { kind: 'loss'; teamShort: string; teamColour: string | null }
	| { kind: 'draw'; teamShort: string; teamColour: string | null }
	| { kind: 'current'; teamShort: string | null; teamColour: string | null }
	| { kind: 'planned'; teamShort: string; teamColour: string | null }
	| { kind: 'planned-locked'; teamShort: string; teamColour: string | null }
	| { kind: 'empty' }
	| { kind: 'tbc' }

export interface ChainSlot {
	roundId: string
	roundNumber: number
	roundLabel: string
	state: ChainSlotState
}

/** One side of a planner fixture. */
export interface PlannerTeam {
	id: string
	short: string
	name: string
	colour: string | null
	badgeUrl: string | null
	/**
	 * The team's *current* form — a future round's opponents haven't played yet,
	 * so there is no such thing as form "as of" GW27. Current form is exactly what
	 * the decision needs: which in-form team to spend now and which to save.
	 */
	form?: FormResult[]
	leaguePosition?: number | null
}

export interface PlannerFixture {
	id: string
	homeTeam: PlannerTeam
	awayTeam: PlannerTeam
	kickoff: Date | null
}

export interface UsedInfo {
	teamId: string
	label: string // e.g. "USED GW3" or "PLANNED GW27"
	kind: 'used' | 'planned-elsewhere'
}

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
	/** The team the player has locked in (committed a real pick for) this round, if any. */
	lockedTeamId: string | null
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

export interface ChainLockedPickRow {
	roundId: string
	teamId: string
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
	/** Real picks the player has locked in for future (not-yet-current) rounds. */
	lockedPicks: ChainLockedPickRow[]
	currentRoundId: string | null
	upcomingRoundsFixturesTbc: Set<string>
	totalTeams: number
}

export function buildChainSlots(input: BuildChainSlotsInput): {
	slots: ChainSlot[]
	summary: ChainSummary
} {
	const pastById = new Map(input.pastPicks.map((p) => [p.roundId, p]))
	const lockedById = new Map(input.lockedPicks.map((p) => [p.roundId, p]))

	const slots: ChainSlot[] = input.rounds.map((r) => {
		if (r.id === input.currentRoundId) {
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

		// Upcoming round — locked (real advance pick) or empty or tbc
		const locked = lockedById.get(r.id)
		if (locked) {
			return {
				roundId: r.id,
				roundNumber: r.number,
				roundLabel: r.label,
				state: {
					kind: 'planned-locked',
					teamShort: locked.teamShortName,
					teamColour: locked.teamColour,
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
	const planned = input.lockedPicks.length
	const usedCount = new Set<string>([
		...input.pastPicks.map((p) => p.teamId),
		...input.lockedPicks.map((p) => p.teamId),
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
		homeTeam: FutureRoundTeam
		awayTeam: FutureRoundTeam
	}>
}

export interface FutureRoundTeam {
	id: string
	name: string
	shortName: string
	badgeUrl: string | null
	primaryColor: string | null
	leaguePosition?: number | null
}

export interface BuildPlannerRoundsInput {
	futureRounds: FutureRoundRow[]
	pastPicks: Array<{ roundNumber: number; teamId: string }>
	/** Real picks the player has locked in for future rounds. */
	lockedPicks: Array<{ roundNumber: number; teamId: string; roundId: string }>
	/**
	 * Each team's current form, keyed by team id. A future round's fixtures
	 * haven't been played, so there is no form "as of" that round — current form
	 * is what the planner needs (which in-form team to spend, which to save) and
	 * it's what the form sheet behind the row shows.
	 */
	formByTeamId?: Map<string, FormResult[]>
}

/**
 * Build the PlannerRound inputs for every upcoming round.
 * Applies cascading "used" labels — a team locked into an earlier gameweek
 * is locked out of later gameweeks automatically.
 */
export function buildPlannerRounds(input: BuildPlannerRoundsInput): PlannerRoundInput[] {
	const sortedFutures = [...input.futureRounds].sort((a, b) => a.number - b.number)

	return sortedFutures.map((r) => {
		const fixturesTbc = r.fixtures.length === 0
		const locked = input.lockedPicks.find((p) => p.roundId === r.id)
		const lockedTeamId = locked?.teamId ?? null

		// A team is "used" for this round if:
		//   - it was picked in a past (completed) round, OR
		//   - it is locked into any OTHER future round (the lock for this round is
		//     handled by lockedTeamId).
		const usedTeams: UsedInfo[] = []
		for (const pp of input.pastPicks) {
			usedTeams.push({
				teamId: pp.teamId,
				label: `USED GW${pp.roundNumber}`,
				kind: 'used',
			})
		}
		for (const lp of input.lockedPicks) {
			if (lp.roundId === r.id) continue
			usedTeams.push({
				teamId: lp.teamId,
				label: `PICKED GW${lp.roundNumber}`,
				kind: 'used',
			})
		}

		const plannerTeam = (t: FutureRoundTeam): PlannerFixture['homeTeam'] => ({
			id: t.id,
			name: t.name,
			short: t.shortName,
			colour: t.primaryColor,
			badgeUrl: t.badgeUrl,
			form: input.formByTeamId?.get(t.id),
			leaguePosition: t.leaguePosition ?? null,
		})

		const fixtures: PlannerFixture[] = r.fixtures.map((f) => ({
			id: f.id,
			kickoff: f.kickoff,
			homeTeam: plannerTeam(f.homeTeam),
			awayTeam: plannerTeam(f.awayTeam),
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
			lockedTeamId,
		}
	})
}
