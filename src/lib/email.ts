import { Resend } from 'resend'

// Resend is provisioned via the Vercel Marketplace integration, which writes
// RESEND_API_KEY directly into Vercel envs (prod + preview). This bypasses
// the project's usual Doppler→Vercel sync — see AGENTS.md.
//
// For local dev: `vercel env pull` populates .env.local with the same key.
// If RESEND_API_KEY is missing, the wrapper logs the email instead of sending
// so flows still work without a key.

const FROM_ADDRESS = 'Last Person Standing <noreply@last-person-standing.app>'
// last-person-standing.app is verified in our LPS Resend workspace
// (separate from moontide's account — Resend free tier is one verified
// domain per workspace). Delivers to any recipient address.

let resendClient: Resend | null = null
function getResend(): Resend | null {
	const key = process.env.RESEND_API_KEY
	if (!key) return null
	if (!resendClient) resendClient = new Resend(key)
	return resendClient
}

export interface PasswordResetEmailArgs {
	to: string
	resetUrl: string
	displayName?: string
}

export async function sendPasswordResetEmail(args: PasswordResetEmailArgs): Promise<void> {
	const { to, resetUrl, displayName } = args
	const greeting = displayName ? `Hi ${displayName},` : 'Hi,'
	const text = [
		greeting,
		'',
		'You asked to reset your password for Last Person Standing.',
		'',
		`Open this link to set a new one (expires in 1 hour):`,
		resetUrl,
		'',
		"If you didn't ask for this, ignore this email — your password stays the same.",
		'',
		'— Last Person Standing',
	].join('\n')

	const resend = getResend()
	if (!resend) {
		console.warn('[email] RESEND_API_KEY not set — logging instead of sending')
		console.warn(`[email] to=${to} resetUrl=${resetUrl}`)
		return
	}

	const { error } = await resend.emails.send({
		from: FROM_ADDRESS,
		to,
		subject: 'Reset your Last Person Standing password',
		text,
	})
	if (error) {
		console.error('[email] resend.emails.send failed', { to, error })
		throw new Error(`Failed to send password reset email: ${error.message ?? 'unknown error'}`)
	}
}
