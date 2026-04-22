import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const publicPaths = ['/auth', '/api/auth']

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
