import { describe, expect, it } from 'vitest'
import {
	buildPaymentLink,
	buildPaymentReference,
	normalisePaymentHandle,
	PAYMENT_REFERENCE_MAX_LENGTH,
	type PaymentProvider,
} from './payment-link'

describe('normalisePaymentHandle', () => {
	it('accepts a bare username unchanged', () => {
		expect(normalisePaymentHandle('alicejones')).toBe('alicejones')
	})

	it('strips an accidental @ prefix', () => {
		expect(normalisePaymentHandle('@alicejones')).toBe('alicejones')
	})

	it('strips an accidental provider.me/ prefix', () => {
		expect(normalisePaymentHandle('monzo.me/alicejones')).toBe('alicejones')
		expect(normalisePaymentHandle('revolut.me/alicejones')).toBe('alicejones')
	})

	it('trims surrounding whitespace', () => {
		expect(normalisePaymentHandle('  alicejones  ')).toBe('alicejones')
	})

	it('rejects a pasted full URL', () => {
		expect(normalisePaymentHandle('https://monzo.me/alicejones')).toBeNull()
	})

	it('rejects a scheme-bearing string', () => {
		expect(normalisePaymentHandle('javascript:alert(1)')).toBeNull()
	})

	it('rejects empty and whitespace-only input', () => {
		expect(normalisePaymentHandle('')).toBeNull()
		expect(normalisePaymentHandle('   ')).toBeNull()
		expect(normalisePaymentHandle(null)).toBeNull()
		expect(normalisePaymentHandle(undefined)).toBeNull()
	})

	it('rejects injection / URL-structure characters', () => {
		expect(normalisePaymentHandle('alice?d=evil')).toBeNull()
		expect(normalisePaymentHandle('alice/../bob')).toBeNull()
		expect(normalisePaymentHandle('alice#frag')).toBeNull()
		expect(normalisePaymentHandle('alice jones')).toBeNull()
		expect(normalisePaymentHandle('<script>')).toBeNull()
	})

	// A dot run is a relative path segment even without a slash: `monzo.me/../10.00`
	// collapses in the browser to `monzo.me/10.00`, a dead link the creator would
	// never see was broken.
	it('rejects dot-run and dot-only handles', () => {
		expect(normalisePaymentHandle('.')).toBeNull()
		expect(normalisePaymentHandle('..')).toBeNull()
		expect(normalisePaymentHandle('...')).toBeNull()
		expect(normalisePaymentHandle('alice..jones')).toBeNull()
		// A single interior or trailing dot is a legitimate username character.
		expect(normalisePaymentHandle('alice.jones')).toBe('alice.jones')
	})
})

describe('buildPaymentReference', () => {
	it('renders "{game name} {first name}"', () => {
		expect(buildPaymentReference('The Lads LPS', 'Alice Jones')).toBe('The Lads LPS Alice')
	})

	it('uses a single-word name as the first name', () => {
		expect(buildPaymentReference('The Lads LPS', 'Bob')).toBe('The Lads LPS Bob')
	})

	it('falls back to the game name alone when there is no player name', () => {
		expect(buildPaymentReference('The Lads LPS', '')).toBe('The Lads LPS')
		expect(buildPaymentReference('The Lads LPS', '   ')).toBe('The Lads LPS')
	})

	it('truncates to a payment-note-safe length without a trailing space', () => {
		const ref = buildPaymentReference(
			'Thursday Night Premier League Survivor',
			'Bartholomew Cubbins',
		)
		expect(PAYMENT_REFERENCE_MAX_LENGTH).toBe(35)
		expect(ref).toBe('Thursday Night Premier League Survi')
		expect(ref.length).toBe(35)
	})

	it('collapses surrounding and repeated whitespace', () => {
		expect(buildPaymentReference('  The  Lads LPS ', ' Alice  Jones ')).toBe('The Lads LPS Alice')
	})
})

describe('buildPaymentLink', () => {
	const handle = 'alicejones'

	it('builds a Monzo link with the amount and reference pre-filled', () => {
		expect(
			buildPaymentLink({
				provider: 'monzo',
				handle,
				amount: '10.00',
				reference: 'The Lads LPS Alice',
			}),
		).toBe('https://monzo.me/alicejones/10.00?d=The%20Lads%20LPS%20Alice')
	})

	it('builds a bare Revolut link', () => {
		// revolut.me carries neither an amount nor a reference: a `/10.00gbp`
		// suffix lands on a dead page instead of the creator's payment sheet, so
		// the link degrades to the plain handle rather than pre-filling anything.
		expect(
			buildPaymentLink({
				provider: 'revolut',
				handle,
				amount: '10.00',
				reference: 'The Lads LPS Alice',
			}),
		).toBe('https://revolut.me/alicejones')
	})

	it('normalises the amount to two decimal places', () => {
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: '10' })).toBe(
			'https://monzo.me/alicejones/10.00',
		)
	})

	// The amount never reaches a Revolut URL, but it still gates one: nothing
	// owed, nothing to link to — the button shows the amount either way.
	it('still requires a payable amount for a Revolut link', () => {
		expect(buildPaymentLink({ provider: 'revolut', handle, amount: '7.5' })).toBe(
			'https://revolut.me/alicejones',
		)
		expect(buildPaymentLink({ provider: 'revolut', handle, amount: '0' })).toBeNull()
		expect(buildPaymentLink({ provider: 'revolut', handle, amount: null })).toBeNull()
	})

	it('omits the reference parameter when there is no reference', () => {
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: '10.00', reference: '  ' })).toBe(
			'https://monzo.me/alicejones/10.00',
		)
	})

	it('normalises a handle typed with an @ or provider.me prefix', () => {
		expect(buildPaymentLink({ provider: 'monzo', handle: '@alicejones', amount: '10' })).toBe(
			'https://monzo.me/alicejones/10.00',
		)
	})

	it('returns no link when the provider is absent', () => {
		expect(buildPaymentLink({ provider: null, handle, amount: '10.00' })).toBeNull()
	})

	it('returns no link when the handle is absent', () => {
		expect(buildPaymentLink({ provider: 'monzo', handle: null, amount: '10.00' })).toBeNull()
		expect(buildPaymentLink({ provider: 'monzo', handle: '   ', amount: '10.00' })).toBeNull()
	})

	it('returns no link when the handle is not a valid username', () => {
		expect(
			buildPaymentLink({ provider: 'monzo', handle: 'https://evil.example', amount: '10.00' }),
		).toBeNull()
	})

	it('returns no link when the amount is absent, zero, negative or non-numeric', () => {
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: null })).toBeNull()
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: '0' })).toBeNull()
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: '-5' })).toBeNull()
		expect(buildPaymentLink({ provider: 'monzo', handle, amount: 'abc' })).toBeNull()
	})

	it('returns no link for an unknown provider', () => {
		expect(
			buildPaymentLink({
				provider: 'paypal' as unknown as PaymentProvider,
				handle,
				amount: '10.00',
			}),
		).toBeNull()
	})

	// Mirrors the buildGameView / buildWinnerBanner serializability guards: this
	// value is derived in a Server Component and handed to a Client Component as
	// a prop, so it has to survive the RSC boundary. A plain string or null does;
	// a URL instance or a descriptor object with a method on it would not.
	it('returns a structuredClone-safe value for every variant', () => {
		const variants = [
			{ provider: 'monzo' as PaymentProvider, handle, amount: '10.00', reference: 'Lads LPS Bob' },
			{ provider: 'revolut' as PaymentProvider, handle, amount: '7.50' },
			{ provider: 'monzo' as PaymentProvider, handle, amount: '10.00' },
			{ provider: null, handle, amount: '10.00' },
			{ provider: 'monzo' as PaymentProvider, handle: null, amount: '10.00' },
		]
		for (const variant of variants) {
			const url = buildPaymentLink(variant)
			expect(url === null || typeof url === 'string').toBe(true)
			expect(structuredClone(url)).toEqual(url)
			expect(JSON.parse(JSON.stringify({ url }))).toEqual({ url })
		}
	})
})
