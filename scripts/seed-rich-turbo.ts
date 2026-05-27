/**
 * Seed a turbo game with multiple picks of varied predictions so the
 * shareable standings image renders something visually meaningful.
 *
 * Run with: pnpm tsx scripts/seed-rich-turbo.ts
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

const TEAMS = [
	{ name: 'Manchester United', short: 'MUN' },
	{ name: 'Liverpool', short: 'LIV' },
	{ name: 'Arsenal', short: 'ARS' },
	{ name: 'Chelsea', short: 'CHE' },
	{ name: 'Tottenham', short: 'TOT' },
	{ name: 'Everton', short: 'EVE' },
	{ name: 'Manchester City', short: 'MCI' },
	{ name: 'Aston Villa', short: 'AVL' },
	{ name: 'Newcastle', short: 'NEW' },
	{ name: 'Brighton', short: 'BHA' },
]

async function main(): Promise<void> {
	const u1 = await ensureUser('rich1@example.com', 'Sean')
	const u2 = await ensureUser('rich2@example.com', 'Alex')
	const u3 = await ensureUser('rich3@example.com', 'Jamie')

	const [comp] = await db
		.insert(competition)
		.values({ name: 'Rich Turbo PL', type: 'league', dataSource: 'fpl', status: 'active' })
		.returning()

	const teamIds: string[] = []
	for (const t of TEAMS) {
		const [row] = await db
			.insert(teamTable)
			.values({ name: t.name, shortName: t.short, externalIds: {} })
			.returning()
		teamIds.push(row.id)
	}

	const [r1] = await db
		.insert(roundTable)
		.values({
			competitionId: comp.id,
			number: 1,
			name: 'GW1',
			status: 'open',
			deadline: new Date(Date.now() - 60_000),
		})
		.returning()

	// 5 fixtures
	const fixtures: string[] = []
	for (let i = 0; i < 5; i++) {
		const [fx] = await db
			.insert(fixtureTable)
			.values({
				roundId: r1.id,
				homeTeamId: teamIds[i * 2],
				awayTeamId: teamIds[i * 2 + 1],
				kickoff: new Date(Date.now() - 3_600_000 + i * 60_000),
				status: 'scheduled',
			})
			.returning()
		fixtures.push(fx.id)
	}

	const [g] = await db
		.insert(game)
		.values({
			name: 'Rich Turbo Game',
			competitionId: comp.id,
			gameMode: 'turbo',
			currentRoundId: r1.id,
			createdBy: u1,
			inviteCode: generateInviteCode(),
			status: 'active',
			modeConfig: { numberOfPicks: 5 },
		})
		.returning()

	const players: Array<{ gp: string; userId: string }> = []
	for (const userId of [u1, u2, u3]) {
		const [gp] = await db.insert(gamePlayer).values({ gameId: g.id, userId }).returning()
		players.push({ gp: gp.id, userId })
	}

	// Each player picks 5 fixtures with varied predictions.
	// Predictions: 'home_win' | 'draw' | 'away_win'
	const predictionPlan: Array<'home_win' | 'draw' | 'away_win'>[] = [
		['home_win', 'away_win', 'draw', 'home_win', 'away_win'], // Sean
		['away_win', 'home_win', 'home_win', 'draw', 'home_win'], // Alex
		['draw', 'home_win', 'away_win', 'away_win', 'home_win'], // Jamie
	]
	for (let p = 0; p < players.length; p++) {
		const player = players[p]
		const preds = predictionPlan[p]
		for (let i = 0; i < fixtures.length; i++) {
			const pred = preds[i]
			const teamId =
				pred === 'home_win'
					? teamIds[i * 2]
					: pred === 'away_win'
						? teamIds[i * 2 + 1]
						: teamIds[i * 2]
			await db.insert(pick).values({
				gameId: g.id,
				gamePlayerId: player.gp,
				roundId: r1.id,
				teamId,
				fixtureId: fixtures[i],
				confidenceRank: i + 1,
				predictedResult: pred,
			})
		}
	}

	// Finish each fixture with varied scorelines so we get a mix of win/loss outcomes.
	const scores: Array<[number, number]> = [
		[2, 0], // home wins
		[1, 0], // home wins
		[1, 1], // draw
		[0, 2], // away wins
		[3, 1], // home wins
	]
	for (let i = 0; i < fixtures.length; i++) {
		const [h, a] = scores[i]
		await db
			.update(fixtureTable)
			.set({ status: 'finished', homeScore: h, awayScore: a })
			.where(sql`${fixtureTable.id} = ${fixtures[i]}`)
		await settleFixture(fixtures[i])
	}

	const after = await db.query.game.findFirst({ where: eq(game.id, g.id) })
	console.log(`\n  game id:        ${g.id}`)
	console.log(`  status:         ${after?.status}`)
	console.log(`  open in UI:     http://localhost:3000/game/${g.id}`)
	console.log(`  share image:    http://localhost:3000/api/share/standings/${g.id}`)
	console.log(`  sign in as:     rich1@example.com / password123\n`)
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
