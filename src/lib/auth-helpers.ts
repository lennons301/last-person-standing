import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "./auth"

/**
 * Get the current session. Cached per request via React.cache()
 * so multiple Server Components can call this without re-querying.
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
})

/**
 * Get the current session or redirect to /login.
 * Use in Server Components that require authentication.
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}
