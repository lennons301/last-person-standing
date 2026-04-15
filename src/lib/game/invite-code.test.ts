import { describe, expect, it } from 'vitest'
import { generateInviteCode } from './invite-code'

describe('generateInviteCode', () => {
	it('generates correct length', () => {
		expect(generateInviteCode()).toHaveLength(8)
	})
	it('only alphanumeric characters', () => {
		expect(generateInviteCode()).toMatch(/^[A-Z0-9]+$/)
	})
	it('generates unique codes', () => {
		const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
		expect(codes.size).toBeGreaterThan(90)
	})
	it('accepts custom length', () => {
		expect(generateInviteCode(12)).toHaveLength(12)
	})
})
