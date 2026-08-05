import { describe, expect, it } from 'vitest'
import { normalisePaymentHandle } from './payment-link'

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
