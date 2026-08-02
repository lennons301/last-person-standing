/**
 * Shared constants + helpers for the one-off prod repair scripts.
 *
 * Convention (established incident-repair pattern): every mutating script is
 * dry-run by default and only writes with an explicit `--apply` flag. All
 * preconditions are asserted against live data before anything is printed as
 * an intended mutation; any drift from the expected state aborts loudly.
 */

// -- Issue #119: World Cup endgame repairs --

export const WC_LPS_GAME_ID = 'dc857c5f-8a07-4c3b-aeef-71d9883a218e'
export const WC_LPS_GAME_NAME = 'World Cup LPS'

export const SI_WC_GAME_ID = '55747598-5ef3-42c3-9635-ae5f531e3db3'
export const SI_WC_GAME_NAME = 'SI World Cup'

// -- Issue #121: 2025/26 PL season restore + archive --

/** `competition.season` on the row to restore (dataSource 'fpl'). */
export const PL_2526_SEASON = '2025/26'
/** football-data `?season=` start-year for the 2025/26 archive. */
export const PL_2526_FD_SEASON = '2025'
export const PL_2526_EXPECTED_ROUNDS = 38
export const PL_2526_EXPECTED_FIXTURES = 380
export const PL_2526_EXPECTED_TEAMS = 20
/**
 * Sanity window every restored kickoff must fall in. The season ran
 * 2025-08-15 → 2026-05-24; the window is padded so a rescheduled outlier
 * can't trip it, while a 2026/27 kickoff (from 2026-08) still fails.
 */
export const PL_2526_KICKOFF_MIN = new Date('2025-08-01T00:00:00Z')
export const PL_2526_KICKOFF_MAX = new Date('2026-06-15T00:00:00Z')

export function inPl2526Window(d: Date | null): boolean {
	return d != null && d >= PL_2526_KICKOFF_MIN && d <= PL_2526_KICKOFF_MAX
}

/** The fixture columns the #121 census inspects (structural, schema-free). */
interface CensusFixture {
	status: string
	kickoff: Date | null
	homeScore: number | null
	externalId: string | null
	externalIds: Record<string, string | number> | null
}

/**
 * The corruption/restoration census shared by the #121 inspector and the
 * restore script's current-state print: statuses, kickoff-window buckets,
 * missing scores, and which external ids the rows carry.
 */
export function fixtureCensusLines(fixtures: CensusFixture[]): string[] {
	const statusCounts = new Map<string, number>()
	for (const f of fixtures) statusCounts.set(f.status, (statusCounts.get(f.status) ?? 0) + 1)
	return [
		`status: ${[...statusCounts].map(([s, n]) => `${s}=${n}`).join(' ')}`,
		`kickoff in ${PL_2526_SEASON} window: ${fixtures.filter((f) => inPl2526Window(f.kickoff)).length}` +
			` | outside: ${fixtures.filter((f) => f.kickoff != null && !inPl2526Window(f.kickoff)).length}` +
			` | null: ${fixtures.filter((f) => f.kickoff == null).length}`,
		`missing scores: ${fixtures.filter((f) => f.homeScore == null).length}`,
		`carrying an FPL id: ${fixtures.filter((f) => f.externalId != null || f.externalIds?.fpl != null).length}` +
			` | carrying a football-data id: ${fixtures.filter((f) => f.externalIds?.football_data != null).length}`,
	]
}

/** Parse a numeric-string money amount (e.g. '80.00') into integer pence. */
export function toPence(amount: string): number {
	const parsed = Number(amount)
	if (!Number.isFinite(parsed)) {
		fail(`unparseable money amount: ${JSON.stringify(amount)}`)
	}
	return Math.round(parsed * 100)
}

/** Format integer pence back into the DB's numeric-string form. */
export function toPounds(pence: number): string {
	return (pence / 100).toFixed(2)
}

/** Abort loudly: preconditions are hard gates, not warnings. */
export function fail(message: string): never {
	console.error(`\n✖ PRECONDITION FAILED: ${message}`)
	console.error('No changes have been written. Fix the drift (or the script) and re-run.')
	process.exit(1)
}

export function heading(title: string): void {
	console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`)
}
