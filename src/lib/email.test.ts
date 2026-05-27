import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('resend', () => {
	class ResendMock {
		emails = { send: sendMock }
	}
	return { Resend: ResendMock }
})

describe('sendPasswordResetEmail', () => {
	const originalKey = process.env.RESEND_API_KEY

	beforeEach(() => {
		sendMock.mockReset()
		sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
		vi.resetModules()
	})

	afterEach(() => {
		if (originalKey === undefined) delete process.env.RESEND_API_KEY
		else process.env.RESEND_API_KEY = originalKey
	})

	it('sends an email with the reset URL when RESEND_API_KEY is set', async () => {
		process.env.RESEND_API_KEY = 're_test_key'
		const { sendPasswordResetEmail } = await import('./email')

		await sendPasswordResetEmail({
			to: 'user@example.com',
			resetUrl: 'https://lps.example/reset?token=abc',
			displayName: 'Alice',
		})

		expect(sendMock).toHaveBeenCalledTimes(1)
		const call = sendMock.mock.calls[0][0]
		expect(call.to).toBe('user@example.com')
		expect(call.subject).toMatch(/reset/i)
		expect(call.text).toContain('https://lps.example/reset?token=abc')
		expect(call.text).toContain('Alice')
		expect(call.from).toContain('onboarding@resend.dev')
	})

	it('uses a generic greeting when no displayName is supplied', async () => {
		process.env.RESEND_API_KEY = 're_test_key'
		const { sendPasswordResetEmail } = await import('./email')

		await sendPasswordResetEmail({
			to: 'user@example.com',
			resetUrl: 'https://lps.example/reset?token=abc',
		})

		const call = sendMock.mock.calls[0][0]
		expect(call.text).toMatch(/^Hi,/)
	})

	it('throws when Resend returns an error so callers can log it', async () => {
		process.env.RESEND_API_KEY = 're_test_key'
		sendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
		const { sendPasswordResetEmail } = await import('./email')

		await expect(
			sendPasswordResetEmail({
				to: 'user@example.com',
				resetUrl: 'https://lps.example/reset?token=abc',
			}),
		).rejects.toThrow(/rate limited/)
	})

	it('falls back to logging when RESEND_API_KEY is missing (local dev sandbox)', async () => {
		delete process.env.RESEND_API_KEY
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const { sendPasswordResetEmail } = await import('./email')

		await sendPasswordResetEmail({
			to: 'user@example.com',
			resetUrl: 'https://lps.example/reset?token=abc',
		})

		expect(sendMock).not.toHaveBeenCalled()
		expect(warnSpy).toHaveBeenCalled()
		const messages = warnSpy.mock.calls.map((c) => c.join(' '))
		expect(messages.some((m) => m.includes('https://lps.example/reset?token=abc'))).toBe(true)
		warnSpy.mockRestore()
	})
})
