import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Better Auth API routes pass through
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Cron routes authenticated by CRON_SECRET header, not session
  if (
    pathname.startsWith("/api/fpl") ||
    pathname.startsWith("/api/scores") ||
    pathname.startsWith("/api/games/process")
  ) {
    return NextResponse.next()
  }

  // Public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return NextResponse.next()
  }

  // Check session for all other routes
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - image files (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
