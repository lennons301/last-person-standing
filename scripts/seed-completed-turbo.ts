/**
 * One-off seed for manual verification of the post-completion turbo UX:
 * creates a finished turbo game with two players, settles one fixture so the
 * game auto-completes (winner determined), and prints the URL to open.
 *
 * Run with: pnpm tsx scripts/seed-completed-turbo.ts
 */
import { eq, sql } from 'drizzle-orm'
import { auth } from '../src/lib/auth'
import { db } from '../src/lib/db'
import { generateInviteCode } from '../src/lib/game/invite-code'
import { settleFixture } from '../src/lib/game/settle'
import { user as userTable } from '../src/lib/schema/auth'
import {
	competition,
	fixture as fixtureTable,
	round as roundTable,
	team as teamTable,
} from '../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../src/lib/schema/game'

async function ensureUser(email: string, name: string): Promise<string> {
	const existing = await db.query.user.findFirst({ where: eq(userTable.email, email) })
	if (existing) return existing.id
	const res = await auth.api.signUpEmail({
		body: { email, password: 'password123', name },
	})
	return res.user.id
}

async function main(): Promise<void> {
	const winnerUserId = await ensureUser('seedwinner@example.com', 'Seed Winner')
	const loserUserId = await ensureUser('seedloser@example.com', 'Seed Loser')

	const [comp] = await db
		.insert(competition)
		.values({
			name: 'Seed Turbo Comp',
			type: 'league',
			dataSource: 'fpl',
			status: 'active',
		})
		.returning()

	const [a] = await db
		.insert(teamTable)
		.values({ name: 'Seed Alpha', shortName: 'ALP', externalIds: {} })
		.returning()
	const [b] = await db
		.insert(teamTable)
		.values({ name: 'Seed Bravo', shortName: 'BRV', externalIds: {} })
		.returning()

	const [r1] = await db
		.insert(roundTable)
		.values({
			competitionId: comp.id,
			number: 1,
			name: 'Round 1',
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		.returning()

	const [fx] = await db
		.insert(fixtureTable)
		.values({
			roundId: r1.id,
			homeTeamId: a.id,
			awayTeamId: b.id,
			kickoff: new Date(Date.now() - 3_600_000),
			status: 'scheduled',
		})
		.returning()

	const [g] = await db
		.insert(game)
		.values({
			name: 'Seed Completed Turbo',
			competitionId: comp.id,
			gameMode: 'turbo',
			currentRoundId: r1.id,
			createdBy: winnerUserId,
			inviteCode: generateInviteCode(),
			status: 'active',
			modeConfig: { numberOfPicks: 1 },
		})
		.returning()

	const [gpWin] = await db
		.insert(gamePlayer)
		.values({ gameId: g.id, userId: winnerUserId, livesRemaining: 0 })
		.returning()
	const [gpLose] = await db
		.insert(gamePlayer)
		.values({ gameId: g.id, userId: loserUserId, livesRemaining: 0 })
		.returning()

	await db.insert(pick).values({
		gameId: g.id,
		gamePlayerId: gpWin.id,
		roundId: r1.id,
		teamId: a.id,
		fixtureId: fx.id,
		confidenceRank: 1,
		predictedResult: 'home_win',
	})
	await db.insert(pick).values({
		gameId: g.id,
		gamePlayerId: gpLose.id,
		roundId: r1.id,
		teamId: b.id,
		fixtureId: fx.id,
		confidenceRank: 1,
		predictedResult: 'away_win',
	})

	await db
		.update(fixtureTable)
		.set({ status: 'finished', homeScore: 2, awayScore: 0 })
		.where(sql`${fixtureTable.id} = ${fx.id}`)
	await settleFixture(fx.id)

	const after = await db.query.game.findFirst({ where: eq(game.id, g.id) })
	console.log(`\n  game id: ${g.id}`)
	console.log(`  status:  ${after?.status}`)
	console.log(`  open at: http://localhost:3000/game/${g.id}`)
	console.log(`  login:   seedwinner@example.com / password123\n`)
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
