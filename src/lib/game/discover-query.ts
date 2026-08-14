import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DiscoverGameRow } from '@/lib/game/discover-view'
import type { CompetitionType } from '@/lib/game/round-label'
import { game } from '@/lib/schema/game'

/**
 * The candidate games for the home page's discovery sections — every public
 * game that hasn't finished, with whether this viewer is already in it.
 *
 * The `where` here narrows the read; it is not the rule. What appears in each
 * section (and what appears at all) is `buildDiscoverView`'s to decide, and it
 * re-applies these same exclusions on the rows it gets. One rule, in one place —
 * see the note at the top of that file.
 */
export async function getDiscoverableGames(userId: string): Promise<DiscoverGameRow[]> {
	const rows = await db.query.game.findMany({
		where: and(eq(game.visibility, 'public'), ne(game.status, 'completed')),
		with: {
			competition: true,
			// Only its deadline and number are read — the round the game is played
			// from decides both whether entry is still open and when it starts.
			startingRound: true,
			players: { columns: { userId: true } },
		},
	})

	return rows.map((g) => ({
		id: g.id,
		name: g.name,
		inviteCode: g.inviteCode,
		gameMode: g.gameMode,
		status: g.status,
		visibility: g.visibility,
		competitionName: g.competition.name,
		competitionType: g.competition.type as CompetitionType,
		playerCount: g.players.length,
		maxPlayers: g.maxPlayers,
		entryFee: g.entryFee,
		currentRoundId: g.currentRoundId,
		startingRoundId: g.startingRoundId,
		startingRound: g.startingRound
			? {
					id: g.startingRound.id,
					number: g.startingRound.number,
					deadline: g.startingRound.deadline,
				}
			: null,
		viewerIsMember: g.players.some((p) => p.userId === userId),
	}))
}
