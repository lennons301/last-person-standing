import { describe, expect, it } from 'vitest'
import { safeBackHref } from './form-guide-link'

const APP_ORIGIN = 'https://last-person-standing.app'

/** Where a browser would actually navigate, given this href on the app's origin. */
function resolvedOrigin(href: string): string {
	return new URL(href, APP_ORIGIN).origin
}

/** What the URL parser sees: it drops ASCII control characters before resolving. */
function asTheParserSeesIt(value: string): string {
	return [...value].filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f).join('')
}

describe('safeBackHref', () => {
	it('keeps an ordinary in-app path', () => {
		expect(safeBackHref('/game/abc-123')).toBe('/game/abc-123')
	})

	it('keeps a path with a query string', () => {
		expect(safeBackHref('/game/abc-123?tab=picks')).toBe('/game/abc-123?tab=picks')
	})

	it('is null for a missing or empty value', () => {
		expect(safeBackHref(undefined)).toBeNull()
		expect(safeBackHref(null)).toBeNull()
		expect(safeBackHref('')).toBeNull()
	})

	// Every one of these resolves cross-origin in a real browser, so every one
	// has to be refused rather than rendered as a "Back to game" link.
	const offSite = [
		['an absolute url', 'https://evil.com'],
		['a protocol-relative url', '//evil.com'],
		['a backslash protocol-relative url', '/\\evil.com'],
		['a double-backslash url', '\\\\evil.com'],
		['a tab hiding a protocol-relative url', '/\t/evil.com'],
		['a newline hiding a backslash url', '/\n\\evil.com'],
		['a javascript url', 'javascript:alert(1)'],
	] as const

	it.each(offSite)('rejects %s', (_label, value) => {
		expect(safeBackHref(value)).toBeNull()
	})

	it.each(offSite)('%s really does leave the origin', (_label, value) => {
		// Guards the guard. If one of these ever stops pointing off-site the
		// case above is worthless, and we would rather know than keep
		// asserting nothing.
		expect(resolvedOrigin(asTheParserSeesIt(value))).not.toBe(APP_ORIGIN)
	})

	it('never hands back an href that leaves the app origin', () => {
		const candidates = ['/game/g1', '/', '/game/g1?from=/x', ...offSite.map(([, v]) => v)]
		for (const candidate of candidates) {
			const href = safeBackHref(candidate)
			if (href) expect(resolvedOrigin(href)).toBe(APP_ORIGIN)
		}
	})
})
