// Win-scenario engine for the single-round modes (turbo now; cup to follow).
//
// Given each player's confidence-ranked picks and the current fixture results,
// it answers: who can still win, and which unplayed picks decide it. The heart
// is reuse of the canonical winner-determination logic (`resolveWipeout` + the
// mode tiebreaker) over HYPOTHETICAL completions — so a "scenario" is just the
// real settlement run on a what-if result set, and stays consistent with how
// the game actually crowns a winner.
//
// Approach:
//   1. Per player, find the unplayed picks inside their reachable streak window
//      (ranks the streak could still reach). These are the picks that matter —
//      the "picks not yet played at the start of a streak".
//   2. The decisive fixture set is the union of those across players. Everything
//      else can't change the winner, so the scenario space is bounded by it.
//   3. When that set is small enough (<= cap), enumerate every outcome combo,
//      run the real winner-determination per combo, and derive exact verdicts
//      (wins-in-all = leading, wins-in-none = out, else in-contention) plus a
//      decision table. Above the cap, fall back to an approximate per-player
//      streak range (early game; labelled).

import { resolveWipeout, turboTiebreaker } from './auto-complete-tiebreakers'

export type Outcome = 'home_win' | 'draw' | 'away_win'
const OUTCOMES: Outcome[] = ['home_win', 'draw', 'away_win']

export interface ScenarioPick {
	rank: number
	fixtureId: string
	/** turbo: the player's predicted result for the fixture. */
	predictedResult: Outcome
}

export interface ScenarioPlayerInput {
	gamePlayerId: string
	/** final lives — cup tiebreak only; pass 0 for turbo. */
	livesRemaining: number
	picks: ScenarioPick[]
}

/** Outcome of each fixture; `null` (or absent) = not yet played. */
export type FixtureOutcomes = Record<string, Outcome | null>

export type Verdict = 'leading' | 'in_contention' | 'out'

export interface PlayerOutlook {
	gamePlayerId: string
	floor: number
	ceiling: number
	verdict: Verdict
	/** unplayed picks inside the player's reachable window, earliest (most pivotal) first. */
	pivotalPicks: { rank: number; fixtureId: string }[]
}

export interface ScenarioBranch {
	/** the unplayed-fixture outcomes that produce this result. */
	conditions: { fixtureId: string; outcome: Outcome }[]
	/** winning gamePlayerIds; >1 = a streak tie the goals tiebreak (unknown here) would settle. */
	winners: string[]
	tieOnGoals: boolean
}

export interface WinScenarios {
	outlooks: PlayerOutlook[]
	/** decisive branches grouped per combo; null when the winner is already settled or too many fixtures remain. */
	table: ScenarioBranch[] | null
	pivotalFixtureIds: string[]
	/** true when too many unplayed fixtures remain to enumerate — outlooks are then approximate. */
	tooManyToEnumerate: boolean
}

const DEFAULT_CAP = 5

/** Did a pick keep the streak alive, given its fixture's outcome? (turbo rules) */
function isCorrect(pick: ScenarioPick, outcome: Outcome, _mode: 'turbo' | 'cup'): boolean {
	// turbo: the predicted result must match. (cup adds tier/lives — handled in a follow-up.)
	return pick.predictedResult === outcome
}

/**
 * The player's unplayed picks that their streak could still reach — i.e. the
 * leading run of picks up to (and not past) the first KNOWN losing pick.
 * Returned earliest-rank first; index 0 is the make-or-break pivot.
 */
function reachablePending(
	player: ScenarioPlayerInput,
	fixtures: FixtureOutcomes,
	mode: 'turbo' | 'cup',
): ScenarioPick[] {
	const sorted = [...player.picks].sort((a, b) => a.rank - b.rank)
	const out: ScenarioPick[] = []
	for (const pk of sorted) {
		const oc = fixtures[pk.fixtureId] ?? null
		if (oc === null) {
			out.push(pk)
			continue
		}
		if (!isCorrect(pk, oc, mode)) break // a known loss caps the reachable window
	}
	return out
}

/** Best/worst-case streak ignoring wipeout — only used for the >cap fallback. */
function streakRange(
	player: ScenarioPlayerInput,
	fixtures: FixtureOutcomes,
	mode: 'turbo' | 'cup',
): { floor: number; ceiling: number } {
	const sorted = [...player.picks].sort((a, b) => a.rank - b.rank)
	let floor = 0
	for (const pk of sorted) {
		const oc = fixtures[pk.fixtureId] ?? null
		if (oc === null) break // worst case: this unplayed pick loses
		if (!isCorrect(pk, oc, mode)) break
		floor++
	}
	let ceiling = 0
	for (const pk of sorted) {
		const oc = fixtures[pk.fixtureId] ?? null
		if (oc === null) {
			ceiling++
			continue
		} // best case: unplayed pick wins
		if (!isCorrect(pk, oc, mode)) break
		ceiling++
	}
	return { floor, ceiling }
}

function enumerateOutcomes(fixtureIds: string[]): Record<string, Outcome>[] {
	let combos: Record<string, Outcome>[] = [{}]
	for (const f of fixtureIds) {
		const next: Record<string, Outcome>[] = []
		for (const c of combos) for (const o of OUTCOMES) next.push({ ...c, [f]: o })
		combos = next
	}
	return combos
}

interface Branch {
	conditions: { fixtureId: string; outcome: Outcome }[]
	winners: string[]
	tieOnGoals: boolean
	streaks: Map<string, number>
}

/** A candidate fixture is decisive if, holding the others fixed, varying it changes the winner. */
function isDecisive(fixtureId: string, branches: Branch[], candidates: string[]): boolean {
	const others = candidates.filter((c) => c !== fixtureId)
	const byOthers = new Map<string, Set<string>>()
	for (const b of branches) {
		const key = others.map((o) => b.conditions.find((c) => c.fixtureId === o)?.outcome).join('|')
		const ws = [...b.winners].sort().join(',')
		const set = byOthers.get(key) ?? new Set<string>()
		set.add(ws)
		byOthers.set(key, set)
	}
	return [...byOthers.values()].some((s) => s.size > 1)
}

function buildTable(branches: Branch[], pivotal: string[]): ScenarioBranch[] {
	const seen = new Map<string, ScenarioBranch>()
	for (const b of branches) {
		const conditions = b.conditions.filter((c) => pivotal.includes(c.fixtureId))
		const key = `${conditions
			.map((c) => `${c.fixtureId}:${c.outcome}`)
			.sort()
			.join('|')}=>${[...b.winners].sort().join(',')}`
		if (!seen.has(key)) seen.set(key, { conditions, winners: b.winners, tieOnGoals: b.tieOnGoals })
	}
	return [...seen.values()]
}

export function winScenarios(
	players: ScenarioPlayerInput[],
	fixtures: FixtureOutcomes,
	opts: { mode: 'turbo' | 'cup'; cap?: number },
): WinScenarios {
	const { mode } = opts
	const cap = opts.cap ?? DEFAULT_CAP

	const reachable = new Map<string, ScenarioPick[]>()
	for (const p of players) reachable.set(p.gamePlayerId, reachablePending(p, fixtures, mode))

	const candidateSet = new Set<string>()
	for (const picks of reachable.values()) for (const pk of picks) candidateSet.add(pk.fixtureId)
	const candidates = [...candidateSet]

	// Fallback: too many unplayed fixtures still bear on the outcome to enumerate.
	if (candidates.length > cap) {
		const ranges = new Map(players.map((p) => [p.gamePlayerId, streakRange(p, fixtures, mode)]))
		const outlooks = players.map((p): PlayerOutlook => {
			const { floor, ceiling } = ranges.get(p.gamePlayerId) as { floor: number; ceiling: number }
			const out = players.some(
				(q) =>
					q.gamePlayerId !== p.gamePlayerId && (ranges.get(q.gamePlayerId)?.floor ?? 0) > ceiling,
			)
			const leading = players.every(
				(q) =>
					q.gamePlayerId === p.gamePlayerId || floor >= (ranges.get(q.gamePlayerId)?.ceiling ?? 0),
			)
			const verdict: Verdict = out ? 'out' : leading ? 'leading' : 'in_contention'
			return {
				gamePlayerId: p.gamePlayerId,
				floor,
				ceiling,
				verdict,
				pivotalPicks:
					verdict === 'in_contention'
						? (reachable.get(p.gamePlayerId) ?? []).map((pk) => ({
								rank: pk.rank,
								fixtureId: pk.fixtureId,
							}))
						: [],
			}
		})
		return { outlooks, table: null, pivotalFixtureIds: [], tooManyToEnumerate: true }
	}

	// Enumerate every outcome combo over the decisive candidate fixtures and run the
	// real winner-determination (resolveWipeout + tiebreak) on each hypothetical.
	const tiebreak = turboTiebreaker // cup tiebreak swapped in with the cup evaluator
	const branches: Branch[] = enumerateOutcomes(candidates).map((combo) => {
		const merged: FixtureOutcomes = { ...fixtures, ...combo }
		const wipeoutInput = players.map((p) => ({
			gamePlayerId: p.gamePlayerId,
			livesRemaining: p.livesRemaining,
			picks: p.picks
				.filter((pk) => merged[pk.fixtureId] != null)
				.map((pk) => ({
					rank: pk.rank,
					correct: isCorrect(pk, merged[pk.fixtureId] as Outcome, mode),
					goals: 0,
				})),
		}))
		const { scores } = resolveWipeout(wipeoutInput)
		const winners = tiebreak(
			scores.map((s) => ({
				gamePlayerId: s.gamePlayerId,
				streak: s.streak,
				goalsInStreak: s.goalsInStreak,
			})),
		)
		return {
			conditions: candidates.map((f) => ({ fixtureId: f, outcome: combo[f] })),
			winners,
			tieOnGoals: winners.length > 1,
			streaks: new Map(scores.map((s) => [s.gamePlayerId, s.streak])),
		}
	})

	const outlooks = players.map((p): PlayerOutlook => {
		const id = p.gamePlayerId
		const streaks = branches.map((b) => b.streaks.get(id) ?? 0)
		const winsCount = branches.filter((b) => b.winners.includes(id)).length
		const verdict: Verdict =
			winsCount === branches.length ? 'leading' : winsCount === 0 ? 'out' : 'in_contention'
		return {
			gamePlayerId: id,
			floor: Math.min(...streaks),
			ceiling: Math.max(...streaks),
			verdict,
			pivotalPicks:
				verdict === 'in_contention'
					? (reachable.get(id) ?? []).map((pk) => ({ rank: pk.rank, fixtureId: pk.fixtureId }))
					: [],
		}
	})

	const winnerSets = new Set(branches.map((b) => [...b.winners].sort().join(',')))
	if (winnerSets.size <= 1) {
		// Winner already settled regardless of remaining results.
		return { outlooks, table: null, pivotalFixtureIds: [], tooManyToEnumerate: false }
	}

	const pivotalFixtureIds = candidates.filter((f) => isDecisive(f, branches, candidates))
	return {
		outlooks,
		table: buildTable(branches, pivotalFixtureIds),
		pivotalFixtureIds,
		tooManyToEnumerate: false,
	}
}
