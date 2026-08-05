/**
 * Pay-the-creator links.
 *
 * The app is a *pointer*, never a money-mover: it holds no funds and confirms
 * nothing. All this module does is turn a creator's saved Monzo/Revolut handle
 * plus an amount into a pre-filled deep link a player can tap. Money moves on
 * the provider's own card rails; the app only records the player's self-declared
 * "I've paid".
 */

export type PaymentProvider = 'monzo' | 'revolut'

/**
 * A handle is a provider username: letters, digits, dot, dash, underscore.
 * Anything else (spaces, slashes, `?`, `#`, `<`) would either break the path or
 * smuggle URL structure into a link we hand to a browser, so it's rejected
 * rather than escaped — a real handle never needs those characters.
 */
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/** `monzo.me/` or `revolut.me/`, optionally `www.`-prefixed — no scheme. */
const BARE_PROVIDER_PREFIX = /^(?:www\.)?(?:monzo|revolut)\.me\//i

/**
 * Normalise user-entered handle input down to a bare username, or null if it
 * isn't one.
 *
 * Lenient about the two mistakes people actually make — typing `@handle` or
 * pasting `monzo.me/handle` — and strict about everything else. A pasted full
 * URL (scheme and all) is rejected rather than unwrapped: at that point we can
 * no longer tell a provider link from an arbitrary one, and guessing is how a
 * pot gets redirected.
 */
export function normalisePaymentHandle(input: string | null | undefined): string | null {
	if (typeof input !== 'string') return null
	const trimmed = input.trim()
	if (trimmed === '') return null
	// Any scheme at all — including `javascript:` — is out.
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null
	const bare = trimmed.replace(BARE_PROVIDER_PREFIX, '').replace(/^@/, '')
	return HANDLE_PATTERN.test(bare) ? bare : null
}
