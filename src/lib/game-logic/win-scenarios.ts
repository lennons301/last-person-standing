// Win-scenario engine for the single-round modes (turbo + cup).
//
// Given each player's confidence-ranked picks and the current fixture results,
// it answers: who can still win, and which unplayed picks decide it. The heart
// is reuse of the canonical winner-determination logic (`resolveWipeout`, plus
// the streak→(lives)→goals tiebreak) over HYPOTHETICAL completions — so a
// "scenario" is just real settlement run on a what-if result set, and stays
// consistent with how the game actually crowns a winner.
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
//
// Cup vs turbo: the only mode-specific bit is how a pick survives. Turbo: the
// predicted result must match. Cup: lives + the tier handicap, evaluated by the
// canonical `evaluateCupPicks`, and the winner tiebreak adds a lives level
// before goals. Anything goal-dependent (the final separator) is reported as a
// tie rather than guessed, since scenarios fix outcomes, not scorelines.

import { resolveWipeout } from './auto-complete-tiebreakers'
import { type CupPickResult, evaluateCupPicks } from './cup'

export type Outcome = 'home_win' | 'draw' | 'away_win'
const OUTCOMES: Outcome[] = ['home_win', 'draw', 'away_win']

export interface ScenarioPick {
	rank: number
	fixtureId: string
	/** turbo: the player's predicted result for the fixture. */
	predictedResult: Outcome
	/** cup: which side the player backed. */
	pickedSide?: 'home' | 'away'
	/** cup: tier difference from the HOME team's perspective (+ = home higher tier). */
	tierDifference?: number
}

export interface ScenarioPlayerInput {
	gamePlayerId: string
	/** kept for back-compat; cup uses `startingLives`, turbo ignores both. */
	livesRemaining: number
	/** cup: the game's configured starting lives (evaluateCupPicks recomputes from scratch). */
	startingLives?: number
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
	/** winning gamePlayerIds; >1 = a tie the goals tiebreak (unknown here) would settle. */
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

type Mode = 'turbo' | 'cup'

const DEFAULT_CAP = 5

/* ── per-pick survival ─────────────────────────────────────────────────── */

/**
 * Representative scoreline for an outcome — enough to drive survival/lives
 * (which depend on the outcome + tier, not the exact score). Goals are not
 * inferred, so goal-level ties are reported rather than resolved.
 */
function repScore(outcome: Outcome): { homeScore: number; awayScore: number } {
	if (outcome === 'home_win') return { homeScore: 1, awayScore: 0 }
	if (outcome === 'away_win') return { homeScore: 0, awayScore: 1 }
	return { homeScore: 0, awayScore: 0 }
}

const pickedWin = (pk: ScenarioPick): Outcome =>
	pk.pickedSide === 'away' ? 'away_win' : 'home_win'
const pickedLose = (pk: ScenarioPick): Outcome =>
	pk.pickedSide === 'away' ? 'home_win' : 'away_win'

/**
 * A cup pick keeps the streak alive on win / underdog-draw / life-save. Matches
 * `checkCupCompletion` (where 'loss' and 'restricted' break the streak).
 */
const cupAlive = (r: CupPickResult['result']): boolean =>
	r === 'win' || r === 'draw_success' || r === 'saved_by_life'

function turboCorrect(pick: ScenarioPick, outcome: Outcome): boolean {
	return pick.predictedResult === outcome
}

/**
 * Run the canonical cup evaluator over the picks whose outcome is known under
 * `outcomeOf` (others omitted — they're beyond the reachable streak).
 */
function cupResults(
	player: ScenarioPlayerInput,
	outcomeOf: (pk: ScenarioPick) => Outcome | null,
): { results: CupPickResult[]; finalLives: number } {
	const inputs = []
	for (const pk of player.picks) {
		const oc = outcomeOf(pk)
		if (oc == null) continue
		const { homeScore, awayScore } = repScore(oc)
		inputs.push({
			confidenceRank: pk.rank,
			pickedTeam: pk.pickedSide ?? 'home',
			homeScore,
			awayScore,
			tierDifference: pk.tierDifference ?? 0,
			winner: null,
		})
	}
	const r = evaluateCupPicks(inputs, player.startingLives ?? 0)
	return { results: r.pickResults, finalLives: r.finalLives }
}

/** Length of the consecutive alive run from rank 1 (no wipeout rebasing). */
function cupStreakReach(results: CupPickResult[]): number {
	let n = 0
	for (const r of [...results].sort((a, b) => a.confidenceRank - b.confidenceRank)) {
		if (cupAlive(r.result)) n++
		else break
	}
	return n
}

/* ── reachable window + range ──────────────────────────────────────────── */

function reachablePending(
	player: ScenarioPlayerInput,
	fixtures: FixtureOutcomes,
	mode: Mode,
): ScenarioPick[] {
	const sorted = [...player.picks].sort((a, b) => a.rank - b.rank)
	if (mode === 'turbo') {
		const out: ScenarioPick[] = []
		for (const pk of sorted) {
			const oc = fixtures[pk.fixtureId] ?? null
			if (oc === null) {
				out.push(pk)
				continue
			}
			if (!turboCorrect(pk, oc)) break // a known loss caps the window
		}
		return out
	}
	// cup: walk the BEST case (unplayed → picked side wins) so lives extend reach;
	// the unplayed picks inside the surviving prefix are reachable.
	const { results } = cupResults(player, (pk) => fixtures[pk.fixtureId] ?? pickedWin(pk))
	const aliveByRank = new Map(results.map((r) => [r.confidenceRank, cupAlive(r.result)]))
	const out: ScenarioPick[] = []
	for (const pk of sorted) {
		if (!aliveByRank.get(pk.rank)) break
		if ((fixtures[pk.fixtureId] ?? null) === null) out.push(pk)
	}
	return out
}

function streakRange(
	player: ScenarioPlayerInput,
	fixtures: FixtureOutcomes,
	mode: Mode,
): { floor: number; ceiling: number } {
	if (mode === 'cup') {
		const ceiling = cupStreakReach(
			cupResults(player, (pk) => fixtures[pk.fixtureId] ?? pickedWin(pk)).results,
		)
		const floor = cupStreakReach(
			cupResults(player, (pk) => fixtures[pk.fixtureId] ?? pickedLose(pk)).results,
		)
		return { floor, ceiling }
	}
	const sorted = [...player.picks].sort((a, b) => a.rank - b.rank)
	let floor = 0
	for (const pk of sorted) {
		const oc = fixtures[pk.fixtureId] ?? null
		if (oc === null || !turboCorrect(pk, oc)) break
		floor++
	}
	let ceiling = 0
	for (const pk of sorted) {
		const oc = fixtures[pk.fixtureId] ?? null
		if (oc === null) {
			ceiling++
			continue
		}
		if (!turboCorrect(pk, oc)) break
		ceiling++
	}
	return { floor, ceiling }
}

/* ── per-branch winner determination ──────────────────────────────────── */

interface WipeIn {
	gamePlayerId: string
	livesRemaining: number
	picks: { rank: number; correct: boolean; goals: number }[]
}

function buildWipeoutInput(
	player: ScenarioPlayerInput,
	merged: FixtureOutcomes,
	mode: Mode,
): WipeIn {
	if (mode === 'turbo') {
		return {
			gamePlayerId: player.gamePlayerId,
			livesRemaining: 0,
			picks: player.picks
				.filter((pk) => merged[pk.fixtureId] != null)
				.map((pk) => ({
					rank: pk.rank,
					correct: turboCorrect(pk, merged[pk.fixtureId] as Outcome),
					goals: 0,
				})),
		}
	}
	const { results, finalLives } = cupResults(player, (pk) => merged[pk.fixtureId] ?? null)
	return {
		gamePlayerId: player.gamePlayerId,
		livesRemaining: finalLives,
		picks: results.map((r) => ({ rank: r.confidenceRank, correct: cupAlive(r.result), goals: 0 })),
	}
}

function maxBy<T>(items: T[], key: (t: T) => number): T[] {
	if (items.length === 0) return []
	const max = items.reduce((m, t) => Math.max(m, key(t)), Number.NEGATIVE_INFINITY)
	return items.filter((t) => key(t) === max)
}

/**
 * Winner(s) for one hypothetical: top streak, then (cup) top lives — both fully
 * determined by the outcomes. The next separator is goals, which depend on
 * scorelines we don't fix, so a remaining tie is reported, not guessed.
 */
function scenarioWinners(
	scores: { gamePlayerId: string; streak: number; livesRemaining: number }[],
	mode: Mode,
): { winners: string[]; tieOnGoals: boolean } {
	let top = maxBy(scores, (s) => s.streak)
	if (mode === 'cup' && top.length > 1) top = maxBy(top, (s) => s.livesRemaining)
	return { winners: top.map((s) => s.gamePlayerId), tieOnGoals: top.length > 1 }
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
	opts: { mode: Mode; cap?: number },
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

	// Enumerate every outcome combo over the decisive candidate fixtures and run
	// the real winner-determination (resolveWipeout + tiebreak) on each.
	const branches: Branch[] = enumerateOutcomes(candidates).map((combo) => {
		const merged: FixtureOutcomes = { ...fixtures, ...combo }
		const wipeoutInput = players.map((p) => buildWipeoutInput(p, merged, mode))
		const { scores } = resolveWipeout(wipeoutInput)
		const { winners, tieOnGoals } = scenarioWinners(scores, mode)
		return {
			conditions: candidates.map((f) => ({ fixtureId: f, outcome: combo[f] })),
			winners,
			tieOnGoals,
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
