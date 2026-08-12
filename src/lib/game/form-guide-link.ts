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

/**
 * A caller-supplied return path, accepted only if it's a same-origin relative
 * path. The leading character must be "/", and the character after it must not
 * be "/" or "\": the WHATWG URL parser normalises "\" to "/" after a leading
 * slash for special schemes, so `<a href="/\evil.com">` resolves off-site just
 * as `//evil.com` does. Returns null for anything else, so the guide simply
 * omits the back link rather than opening a redirect.
 */
export function safeBackHref(from: string | undefined | null): string | null {
	if (!from) return null
	if (!from.startsWith('/')) return null
	if (from[1] === '/' || from[1] === '\\') return null
	return from
}
