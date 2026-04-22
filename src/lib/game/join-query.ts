import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { user } from '@/lib/schema/auth'
import { game, gamePlayer } from '@/lib/schema/game'

export async function getGameByInviteCode(code: string) {
	const g = await db.query.game.findFirst({
		where: eq(game.inviteCode, code.toUpperCase()),
		with: {
			competition: true,
			players: true,
		},
	})
	if (!g) return null

	const creator = await db.query.user.findFirst({
		where: eq(user.id, g.createdBy),
	})

	return {
		...g,
		creatorName: creator?.name ?? 'Unknown',
	}
}

export async function getMembership(gameId: string, userId: string) {
	return db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, userId)),
	})
}
