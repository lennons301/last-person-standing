import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { after } from 'next/server'
import { db } from './db'
import { sendPasswordResetEmail } from './email'

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
	emailAndPassword: {
		enabled: true,
		// Anti-enumeration via timing attacks: never await the email send, or
		// attackers can compare response times for known vs unknown emails.
		// next/server's `after()` schedules the work to run AFTER the response
		// has been flushed — but keeps the serverless function alive until it
		// settles. A bare `void` looked equivalent but Vercel can tear the
		// function down the instant the response goes out, killing the in-
		// flight fetch to Resend before it lands (PR #61 → #62 incident).
		sendResetPassword: async ({ user, url }) => {
			after(
				sendPasswordResetEmail({
					to: user.email,
					resetUrl: url,
					displayName: user.name,
				}),
			)
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // update session every 24 hours
	},
})
