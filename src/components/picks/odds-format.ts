/**
 * Stamp format for a market's freshness: date + time, no weekday. Short enough
 * to sit on a fixture row's strip beside the kickoff without competing with it,
 * but dated — once a round's odds freeze at the deadline, "14:32" alone would
 * read as today.
 *
 * Shared by the row's odds stamp and the form sheet's full 1X2 block so the two
 * quote the same market with the same words.
 */
export const ODDS_AS_OF_FORMAT: Intl.DateTimeFormatOptions = {
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
}
