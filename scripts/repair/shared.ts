/**
 * Shared constants + helpers for the issue #119 one-off prod repair scripts.
 *
 * Convention (established incident-repair pattern): every mutating script is
 * dry-run by default and only writes with an explicit `--apply` flag. All
 * preconditions are asserted against live data before anything is printed as
 * an intended mutation; any drift from the expected state aborts loudly.
 */

export const WC_LPS_GAME_ID = 'dc857c5f-8a07-4c3b-aeef-71d9883a218e'
export const WC_LPS_GAME_NAME = 'World Cup LPS'

export const SI_WC_GAME_ID = '55747598-5ef3-42c3-9635-ae5f531e3db3'
export const SI_WC_GAME_NAME = 'SI World Cup'

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
