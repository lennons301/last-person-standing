import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'
import { sendPasswordResetEmail } from './email'

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),
	emailAndPassword: {
		enabled: true,
		// `url` already contains the token + redirectTo the client passed in.
		// Fire-and-forget per Better Auth guidance: awaiting would let attackers
		// learn whether an email exists by comparing response times. The function
		// signature requires Promise<void>, so we return immediately while the
		// email send runs in the background.
		sendResetPassword: async ({ user, url }) => {
			void sendPasswordResetEmail({
				to: user.email,
				resetUrl: url,
				displayName: user.name,
			})
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // update session every 24 hours
	},
})
