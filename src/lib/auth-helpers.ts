import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { auth } from './auth'

/**
 * Get the current session. Returns null if not authenticated.
 * Cached per-request — safe to call multiple times.
 */
export const getSession = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	})
	return session
})

/**
 * Get the current session or redirect to login.
 * Use in Server Components and Server Actions that require auth.
 */
export async function requireSession() {
	const session = await getSession()
	if (!session) {
		redirect('/auth')
	}
	return session
}
