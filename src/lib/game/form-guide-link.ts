/**
 * Path to a team's full form guide.
 *
 * Competition-scoped, never game-scoped: the page is the same for everyone
 * playing that competition, so it's shareable and cacheable across games.
 *
 * - `opponent` is the pick context — the other side of the fixture the guide
 *   was opened from, and the only thing that brings the head-to-head section
 *   out. Simply absent when the guide is opened from somewhere with no fixture
 *   in mind (a results-list badge, a shared link).
 * - `from` is the in-app path to return to, so the guide can offer a way back
 *   to the game without knowing anything about games.
 */
export function formGuidePath(
	competitionId: string,
	teamId: string,
	context?: { opponent?: string | null; from?: string | null },
): string {
	const query = new URLSearchParams()
	if (context?.opponent) query.set('opponent', context.opponent)
	if (context?.from) query.set('from', context.from)
	const suffix = query.size > 0 ? `?${query}` : ''
	return `/competition/${competitionId}/team/${teamId}${suffix}`
}

/** ASCII control characters, which URL parsers strip before resolving. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

/**
 * The inverse of the `from` above: a caller-supplied value narrowed to
 * something safe to render as a link. Same-origin relative paths only — never
 * an absolute URL, and never a protocol-relative one.
 *
 * "Starts with a slash" is not enough on its own. A browser resolves both
 * `//evil.com` and `/\evil.com` against the current origin's *scheme* rather
 * than its host, so either navigates a logged-in player off-site; and the URL
 * parser strips ASCII control characters before resolving, so a tab in
 * `/<TAB>/evil.com` disappears and leaves `//evil.com` behind. Strip the
 * control characters first, then reject anything whose second character is a
 * slash in either direction.
 *
 * Returns null for anything rejected, so the back link is simply absent. That
 * matters twice over: the guide threads its own `backHref` into every
 * results-row link, so one unsanitised value would spread across the page.
 */
export function safeBackHref(from: string | null | undefined): string | null {
	if (!from) return null
	const cleaned = from.replace(CONTROL_CHARS, '')
	if (!cleaned.startsWith('/') || /^\/[/\\]/.test(cleaned)) return null
	return cleaned
}
