import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { user } from '@/lib/schema/auth'
import { gamePlayer } from '@/lib/schema/game'

export async function GET(request: Request): Promise<Response> {
	await requireSession()

	const { searchParams } = new URL(request.url)
	const q = (searchParams.get('q') ?? '').trim()
	const gameId = searchParams.get('gameId')
	if (q.length === 0) {
		return NextResponse.json({ users: [] })
	}

	const pattern = `${q.toLowerCase()}%`
	const results = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(or(sql`lower(${user.name}) like ${pattern}`, sql`lower(${user.email}) like ${pattern}`))
		.limit(10)

	if (!gameId || results.length === 0) {
		return NextResponse.json({ users: results })
	}

	const userIds = results.map((u) => u.id)
	const existingPlayers = await db
		.select({ userId: gamePlayer.userId })
		.from(gamePlayer)
		.where(and(eq(gamePlayer.gameId, gameId), inArray(gamePlayer.userId, userIds)))
	const inGameSet = new Set(existingPlayers.map((p) => p.userId))

	const augmented = results.map((u) => ({ ...u, isInGame: inGameSet.has(u.id) }))
	return NextResponse.json({ users: augmented })
}
