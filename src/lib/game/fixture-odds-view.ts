import type { FixtureOdds } from '@/components/picks/fixture-row'
import type { FixtureOddsRow } from '@/lib/types'

/**
 * Shape a persisted `fixture_odds` row for the pick surfaces.
 *
 * Every surface reads this — the value is whatever the daily sync last wrote,
 * identical for every player and frozen once the round deadline passed. No
 * render-time call to the odds provider exists anywhere.
 *
 * Null in, null out: a fixture (or a whole competition) we have no odds for
 * carries no row, and the row renders no win-probability rather than a zero.
 */
export function toFixtureOddsView(
	row:
		| Pick<
				FixtureOddsRow,
				'homePrice' | 'awayPrice' | 'homeProbability' | 'awayProbability' | 'asOf'
		  >
		| null
		| undefined,
): FixtureOdds | null {
	if (!row) return null
	return {
		home: { probability: row.homeProbability, price: row.homePrice },
		away: { probability: row.awayProbability, price: row.awayPrice },
		// Serialised for the client component boundary, like every other date the
		// pick surfaces hand over.
		asOf: row.asOf.toISOString(),
	}
}
