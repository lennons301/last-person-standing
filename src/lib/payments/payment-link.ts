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

/**
 * Payment notes are short. 35 characters is the conservative common
 * denominator across the note fields a reference can end up in (a Monzo.me
 * description, a bank statement line), and it comfortably fits a game name
 * plus a first name.
 */
export const PAYMENT_REFERENCE_MAX_LENGTH = 35

/**
 * The note a player's payment carries: `{game name} {first name}`, so the
 * creator recognises it at a glance. Hard-truncated — a reference that runs
 * past the field limit gets cut somewhere anyway; better it happens where we
 * can guarantee no trailing whitespace.
 */
export function buildPaymentReference(gameName: string, playerName: string): string {
	const game = collapseWhitespace(gameName)
	const firstName = collapseWhitespace(playerName).split(' ')[0] ?? ''
	const reference = [game, firstName].filter(Boolean).join(' ')
	return reference.slice(0, PAYMENT_REFERENCE_MAX_LENGTH).trimEnd()
}

function collapseWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, ' ')
}

export interface PaymentLinkInput {
	/** The creator's saved provider, or null if they've saved none. */
	provider: PaymentProvider | null | undefined
	/** The creator's saved handle, or null if they've saved none. */
	handle: string | null | undefined
	/** Amount owed, as the `numeric` string the payment row carries. */
	amount: string | null | undefined
	/** Optional note — pre-filled where the provider supports one. */
	reference?: string | null
}

/**
 * The pre-filled deep link a player taps to pay the creator, or null — the
 * no-link sentinel every caller renders as today's manual fallback ("admin will
 * collect payment separately").
 *
 * Formats (checked August 2026):
 * - Monzo: `monzo.me/{handle}/{amount}?d={note}` — amount and note both
 *   pre-fill.
 * - Revolut: `revolut.me/{handle}/{amount}gbp` — amount only. There's no
 *   reference parameter, so the note is dropped rather than faked.
 *
 * Neither provider *documents* these parameters — both are long-standing
 * conventions, and Monzo's and Revolut's own help pages describe only the
 * in-app flow. That's why the amount and note are additive: strip them and
 * what's left, `provider.me/{handle}`, is the plain link the provider does
 * document, so the worst case if a convention changes is a payer who types the
 * amount themselves rather than a dead end.
 *
 * Both are card-rail — any payer settles with an ordinary debit card, no
 * matching app required — and neither charges the *recipient* on a personal
 * link, so the pot doesn't silently shrink. (Business/Pro links do charge
 * 1%–2.8% + £0.20; we deliberately point at personal links only.) Two rail
 * limits worth knowing when reading a bug report: monzo.me refuses credit and
 * prepaid cards, and revolut.me caps card-funded receipts at £250/week.
 */
export function buildPaymentLink(input: PaymentLinkInput): string | null {
	const handle = normalisePaymentHandle(input.handle)
	if (!handle) return null

	const amount = normaliseAmount(input.amount)
	if (!amount) return null

	if (input.provider === 'monzo') {
		const reference = collapseWhitespace(input.reference ?? '')
		const note = reference ? `?d=${encodeURIComponent(reference)}` : ''
		return `https://monzo.me/${handle}/${amount}${note}`
	}
	if (input.provider === 'revolut') {
		return `https://revolut.me/${handle}/${amount}gbp`
	}
	return null
}

/** Amounts arrive as `numeric` strings; only a positive money value links. */
function normaliseAmount(amount: string | null | undefined): string | null {
	if (typeof amount !== 'string') return null
	const parsed = Number.parseFloat(amount.trim())
	if (!Number.isFinite(parsed) || parsed <= 0) return null
	return parsed.toFixed(2)
}

export interface PaymentHandleUpdate {
	paymentProvider: PaymentProvider | null
	paymentHandle: string | null
}

const PROVIDERS: PaymentProvider[] = ['monzo', 'revolut']

export function isPaymentProvider(value: unknown): value is PaymentProvider {
	return typeof value === 'string' && (PROVIDERS as string[]).includes(value)
}

/**
 * Read a provider + handle pair off a request body into the pair of columns to
 * store, or null if the pair is unusable.
 *
 * A link needs both halves, so both-empty (clear it) and both-valid (set it)
 * are the only accepted shapes — half a handle would render as a manual
 * fallback the creator thinks they've configured.
 */
export function parsePaymentHandleInput(
	provider: unknown,
	handle: unknown,
): PaymentHandleUpdate | null {
	const handleGiven = typeof handle === 'string' && handle.trim() !== ''
	const providerGiven = provider !== null && provider !== undefined && provider !== ''

	if (!handleGiven && !providerGiven) return { paymentProvider: null, paymentHandle: null }
	if (!handleGiven || !isPaymentProvider(provider)) return null

	const normalised = normalisePaymentHandle(handle as string)
	if (!normalised) return null
	return { paymentProvider: provider, paymentHandle: normalised }
}
