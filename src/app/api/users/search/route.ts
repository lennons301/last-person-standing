import { or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { user } from '@/lib/schema/auth'

export async function GET(request: Request): Promise<Response> {
	await requireSession()

	const { searchParams } = new URL(request.url)
	const q = (searchParams.get('q') ?? '').trim()
	if (q.length === 0) {
		return NextResponse.json({ users: [] })
	}

	const pattern = `${q.toLowerCase()}%`
	const results = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(or(sql`lower(${user.name}) like ${pattern}`, sql`lower(${user.email}) like ${pattern}`))
		.limit(10)

	return NextResponse.json({ users: results })
}
