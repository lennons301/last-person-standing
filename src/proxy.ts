import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Paths that bypass the Better Auth session check in this proxy.
// /auth — login page renders for unauthenticated users.
// /api/auth — Better Auth's own request handler.
// /api/cron — every route under this checks CRON_SECRET (or QStash signature
//   for qstash-handler) at the route level. The proxy must let them through
//   so route-level auth can run; otherwise GitHub Actions and QStash callbacks
//   get redirected to /auth.
const publicPaths = ['/auth', '/api/auth', '/api/cron']

export const config = {
	matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl

	// Allow public paths
	if (publicPaths.some((p) => pathname.startsWith(p))) {
		return NextResponse.next()
	}

	// Check auth for everything else
	const session = await auth.api.getSession({
		headers: request.headers,
	})

	if (!session) {
		const loginUrl = new URL('/auth', request.nextUrl.origin)
		loginUrl.searchParams.set('callbackUrl', pathname)
		return NextResponse.redirect(loginUrl)
	}

	return NextResponse.next()
}
