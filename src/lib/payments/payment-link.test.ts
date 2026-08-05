import { describe, expect, it } from 'vitest'
import {
	buildPaymentReference,
	normalisePaymentHandle,
	PAYMENT_REFERENCE_MAX_LENGTH,
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
