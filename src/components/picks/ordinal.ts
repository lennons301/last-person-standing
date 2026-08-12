/**
 * League position as an ordinal — "1st", "2nd", "13th".
 *
 * Shared because three pick surfaces render the same number: the fixture row's
 * form bar, the form sheet's header, and the form guide (page, chart and all).
 * They had a copy each; a position that reads differently on two of them is a
 * bug waiting to happen.
 */
export function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}
