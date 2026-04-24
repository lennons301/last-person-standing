import { eq, sql } from 'drizzle-orm'
import { auth } from '../src/lib/auth'
import { db } from '../src/lib/db'
import { generateInviteCode } from '../src/lib/game/invite-code'
import { user as userTable } from '../src/lib/schema/auth'
import {
	competition,
	fixture,
	round as roundTable,
	team as teamTable,
} from '../src/lib/schema/competition'
import { game, gamePlayer, pick } from '../src/lib/schema/game'
import { payment } from '../src/lib/schema/payment'

// FPL team codes for badge URLs (from bootstrap-static)
// 2025/26 Premier League — Ipswich, Leicester, Southampton relegated; Leeds, Burnley, Sunderland promoted.
const PL_TEAMS: Array<{
	name: string
	shortName: string
	primaryColor: string
	fplCode: number
	strength: number // higher = stronger side, used to bias results
	leaguePosition: number
}> = [
	{
		name: 'Arsenal',
		shortName: 'ARS',
		primaryColor: '#EF0107',
		fplCode: 3,
		strength: 85,
		leaguePosition: 2,
	},
	{
		name: 'Aston Villa',
		shortName: 'AVL',
		primaryColor: '#670E36',
		fplCode: 7,
		strength: 72,
		leaguePosition: 4,
	},
	{
		name: 'Bournemouth',
		shortName: 'BOU',
		primaryColor: '#DA291C',
		fplCode: 91,
		strength: 65,
		leaguePosition: 10,
	},
	{
		name: 'Brentford',
		shortName: 'BRE',
		primaryColor: '#e30613',
		fplCode: 94,
		strength: 63,
		leaguePosition: 9,
	},
	{
		name: 'Brighton',
		shortName: 'BHA',
		primaryColor: '#0057B8',
		fplCode: 36,
		strength: 70,
		leaguePosition: 6,
	},
	{
		name: 'Burnley',
		shortName: 'BUR',
		primaryColor: '#6C1D45',
		fplCode: 90,
		strength: 50,
		leaguePosition: 17,
	},
	{
		name: 'Chelsea',
		shortName: 'CHE',
		primaryColor: '#034694',
		fplCode: 8,
		strength: 80,
		leaguePosition: 3,
	},
	{
		name: 'Crystal Palace',
		shortName: 'CRY',
		primaryColor: '#1B458F',
		fplCode: 31,
		strength: 62,
		leaguePosition: 11,
	},
	{
		name: 'Everton',
		shortName: 'EVE',
		primaryColor: '#003399',
		fplCode: 11,
		strength: 58,
		leaguePosition: 14,
	},
	{
		name: 'Fulham',
		shortName: 'FUL',
		primaryColor: '#000000',
		fplCode: 54,
		strength: 60,
		leaguePosition: 8,
	},
	{
		name: 'Leeds United',
		shortName: 'LEE',
		primaryColor: '#FFCD00',
		fplCode: 2,
		strength: 55,
		leaguePosition: 16,
	},
	{
		name: 'Liverpool',
		shortName: 'LIV',
		primaryColor: '#C8102E',
		fplCode: 14,
		strength: 88,
		leaguePosition: 1,
	},
	{
		name: 'Manchester City',
		shortName: 'MCI',
		primaryColor: '#6CABDD',
		fplCode: 43,
		strength: 86,
		leaguePosition: 5,
	},
	{
		name: 'Manchester United',
		shortName: 'MUN',
		primaryColor: '#DA291C',
		fplCode: 1,
		strength: 75,
		leaguePosition: 7,
	},
	{
		name: 'Newcastle United',
		shortName: 'NEW',
		primaryColor: '#241F20',
		fplCode: 4,
		strength: 76,
		leaguePosition: 12,
	},
	{
		name: 'Nottingham Forest',
		shortName: 'NFO',
		primaryColor: '#DD0000',
		fplCode: 17,
		strength: 68,
		leaguePosition: 13,
	},
	{
		name: 'Sunderland',
		shortName: 'SUN',
		primaryColor: '#EB172B',
		fplCode: 56,
		strength: 48,
		leaguePosition: 19,
	},
	{
		name: 'Tottenham Hotspur',
		shortName: 'TOT',
		primaryColor: '#132257',
		fplCode: 6,
		strength: 74,
		leaguePosition: 15,
	},
	{
		name: 'West Ham United',
		shortName: 'WHU',
		primaryColor: '#7A263A',
		fplCode: 21,
		strength: 64,
		leaguePosition: 18,
	},
	{
		name: 'Wolverhampton',
		shortName: 'WOL',
		primaryColor: '#FDB913',
		fplCode: 39,
		strength: 55,
		leaguePosition: 20,
	},
]

function fplBadgeUrl(code: number): string {
	return `https://resources.premierleague.com/premierleague/badges/rb/t${code}.svg`
}

const DEV_USERS = [
	{ email: 'dev@example.com', name: 'Sean', password: 'password123' },
	{ email: 'dave@example.com', name: 'Dave', password: 'password123' },
	{ email: 'mike@example.com', name: 'Mike', password: 'password123' },
	{ email: 'rich@example.com', name: 'Rich', password: 'password123' },
	{ email: 'sarah@example.com', name: 'Sarah', password: 'password123' },
	{ email: 'tom@example.com', name: 'Tom', password: 'password123' },
	{ email: 'james@example.com', name: 'James', password: 'password123' },
	{ email: 'rachel@example.com', name: 'Rachel', password: 'password123' },
]

type RoundRow = typeof roundTable.$inferSelect
type TeamRow = typeof teamTable.$inferSelect
type FixtureRow = typeof fixture.$inferSelect

// Simple deterministic PRNG so the seed is reproducible
function prng(seed: number) {
	let s = seed
	return () => {
		s = (s * 9301 + 49297) % 233280
		return s / 233280
	}
}

async function truncateGameData() {
	await db.execute(sql`TRUNCATE TABLE
		${payment},
		${pick},
		${gamePlayer},
		${game},
		${fixture},
		${roundTable},
		${teamTable},
		${competition}
		RESTART IDENTITY CASCADE`)
}

async function ensureUser(email: string, name: string, password: string): Promise<string> {
	const existing = await db.query.user.findFirst({ where: eq(userTable.email, email) })
	if (existing) return existing.id

	const result = await auth.api.signUpEmail({ body: { email, name, password } })
	if (!result?.user?.id) throw new Error(`Failed to create user ${email}`)
	return result.user.id
}

function addDays(base: Date, days: number): Date {
	const d = new Date(base)
	d.setDate(d.getDate() + days)
	return d
}

function addHours(base: Date, hours: number): Date {
	const d = new Date(base)
	d.setHours(d.getHours() + hours)
	return d
}

async function seed() {
	console.log('Seeding database...')

	// --- Users ---
	const userIds: Record<string, string> = {}
	for (const u of DEV_USERS) {
		userIds[u.email] = await ensureUser(u.email, u.name, u.password)
	}
	console.log(`Ensured ${Object.keys(userIds).length} users (password: password123)`)

	await truncateGameData()

	// --- Competition ---
	const [pl] = await db
		.insert(competition)
		.values({
			name: 'Premier League 2025/26',
			type: 'league',
			dataSource: 'fpl',
			season: '2025/26',
		})
		.returning()
	console.log(`Created competition: ${pl.name}`)

	// --- Teams (with FPL badge URLs and league positions) ---
	const teams = await db
		.insert(teamTable)
		.values(
			PL_TEAMS.map((t) => ({
				name: t.name,
				shortName: t.shortName,
				primaryColor: t.primaryColor,
				badgeUrl: fplBadgeUrl(t.fplCode),
				externalIds: { fpl: t.fplCode },
				leaguePosition: t.leaguePosition,
			})),
		)
		.returning()
	const teamByShort = new Map(teams.map((t) => [t.shortName, t]))
	const strengthByTeamId = new Map(
		teams.map((t) => {
			const meta = PL_TEAMS.find((p) => p.shortName === t.shortName)
			return [t.id, meta?.strength ?? 60]
		}),
	)
	console.log(`Created ${teams.length} teams with FPL badge URLs`)

	// --- Rounds: 6 completed, 1 open, 2 upcoming ---
	const now = new Date()
	const rounds: RoundRow[] = []
	for (let n = 1; n <= 9; n++) {
		let status: 'upcoming' | 'open' | 'active' | 'completed'
		let deadline: Date
		if (n <= 6) {
			status = 'completed'
			deadline = addDays(now, -7 * (8 - n))
		} else if (n === 7) {
			status = 'open'
			deadline = addDays(now, 1)
		} else {
			status = 'upcoming'
			deadline = addDays(now, 1 + (n - 7) * 7)
		}
		const [r] = await db
			.insert(roundTable)
			.values({
				competitionId: pl.id,
				number: n,
				name: `Gameweek ${n}`,
				status,
				deadline,
			})
			.returning()
		rounds.push(r)
	}
	console.log(`Created ${rounds.length} rounds`)

	// --- Fixtures per round — strength-weighted scores, varied kickoffs ---
	const rng = prng(42)
	const allFixtures: FixtureRow[] = []
	for (const r of rounds) {
		// Rotate teams deterministically based on round number so pairings vary
		const rotation = r.number - 1
		const halfA = PL_TEAMS.slice(0, 10)
		const halfB = PL_TEAMS.slice(10)
		const rotatedB = [...halfB.slice(rotation % 10), ...halfB.slice(0, rotation % 10)]
		const matchups: Array<[TeamRow, TeamRow]> = []
		for (let i = 0; i < 10; i++) {
			const a = halfA[i]
			const b = rotatedB[i]
			const tA = teamByShort.get(a.shortName)
			const tB = teamByShort.get(b.shortName)
			if (!tA || !tB) continue
			// Alternate home/away across rounds
			if (r.number % 2 === 0) matchups.push([tA, tB])
			else matchups.push([tB, tA])
		}

		// Kickoffs staggered: Sat 12:30, 15:00, 17:30; Sun 14:00, 16:30
		const slots = [
			{ day: 5, hour: 12, minute: 30 },
			{ day: 5, hour: 15, minute: 0 },
			{ day: 5, hour: 15, minute: 0 },
			{ day: 5, hour: 15, minute: 0 },
			{ day: 5, hour: 15, minute: 0 },
			{ day: 5, hour: 15, minute: 0 },
			{ day: 5, hour: 17, minute: 30 },
			{ day: 6, hour: 14, minute: 0 },
			{ day: 6, hour: 14, minute: 0 },
			{ day: 6, hour: 16, minute: 30 },
		]

		for (let i = 0; i < matchups.length; i++) {
			const [homeTeam, awayTeam] = matchups[i]

			const baseDeadline = r.deadline ?? now
			const slot = slots[i]
			const kickoff = addHours(
				new Date(
					baseDeadline.getFullYear(),
					baseDeadline.getMonth(),
					baseDeadline.getDate(),
					0,
					0,
					0,
				),
				slot.day * 24 + slot.hour + slot.minute / 60,
			)

			let homeScore: number | null = null
			let awayScore: number | null = null
			let status: 'scheduled' | 'live' | 'finished' | 'postponed' = 'scheduled'
			if (r.status === 'completed') {
				const homeStr = strengthByTeamId.get(homeTeam.id) ?? 60
				const awayStr = strengthByTeamId.get(awayTeam.id) ?? 60
				// Home advantage bias
				const diff = homeStr + 5 - awayStr
				// Result probabilities weighted by strength diff
				const roll = rng()
				const homeWinP = 0.35 + Math.max(-0.25, Math.min(0.35, diff / 80))
				const drawP = 0.22
				if (roll < homeWinP) {
					homeScore = 1 + Math.floor(rng() * 3)
					awayScore = Math.floor(rng() * homeScore)
				} else if (roll < homeWinP + drawP) {
					const g = Math.floor(rng() * 3)
					homeScore = g
					awayScore = g
				} else {
					awayScore = 1 + Math.floor(rng() * 3)
					homeScore = Math.floor(rng() * awayScore)
				}
				status = 'finished'
			}

			const [f] = await db
				.insert(fixture)
				.values({
					roundId: r.id,
					homeTeamId: homeTeam.id,
					awayTeamId: awayTeam.id,
					kickoff,
					homeScore,
					awayScore,
					status,
				})
				.returning()
			allFixtures.push(f)
		}
	}
	console.log(`Created ${allFixtures.length} fixtures`)

	const fixturesByRound = new Map<string, FixtureRow[]>()
	for (const f of allFixtures) {
		const list = fixturesByRound.get(f.roundId) ?? []
		list.push(f)
		fixturesByRound.set(f.roundId, list)
	}

	function fixtureWinnerTeam(f: FixtureRow): TeamRow | null {
		if (f.homeScore == null || f.awayScore == null) return null
		if (f.homeScore === f.awayScore) return null
		const winnerId = f.homeScore > f.awayScore ? f.homeTeamId : f.awayTeamId
		return teams.find((t) => t.id === winnerId) ?? null
	}

	function fixtureLoserTeam(f: FixtureRow): TeamRow | null {
		if (f.homeScore == null || f.awayScore == null) return null
		if (f.homeScore === f.awayScore) return null
		const loserId = f.homeScore > f.awayScore ? f.awayTeamId : f.homeTeamId
		return teams.find((t) => t.id === loserId) ?? null
	}

	// --- Games ---
	const openRound = rounds.find((r) => r.status === 'open')
	if (!openRound) throw new Error('No open round')

	interface GameSeed {
		name: string
		mode: 'classic' | 'turbo' | 'cup'
		creatorEmail: string
		players: string[]
		entryFee?: string
		creatorEliminatedAtRound?: number
		creatorSubmittedCurrentPick?: boolean
		plannedEliminations?: Record<string, number>
		// Turbo-specific: which round this single-week game is played in
		turboRoundNumber?: number
		// Turbo-specific: whether to seed picks for all players (completed game) or
		// leave most of them unsubmitted so the pick interface is testable
		turboState?: 'live' | 'completed'
		// Missed deadline scenario: skip inserting a pick for this player in a specific round
		missedDeadlinePlayer?: string
		missedDeadlineRound?: number
	}

	const gameSeeds: GameSeed[] = [
		{
			name: 'The Lads LPS',
			mode: 'classic',
			creatorEmail: 'dev@example.com',
			players: [
				'dev@example.com',
				'dave@example.com',
				'mike@example.com',
				'rich@example.com',
				'sarah@example.com',
				'tom@example.com',
				'james@example.com',
				'rachel@example.com',
			],
			entryFee: '10.00',
			creatorSubmittedCurrentPick: false,
			plannedEliminations: { 'tom@example.com': 4, 'james@example.com': 2 },
			missedDeadlinePlayer: 'rachel@example.com',
			missedDeadlineRound: 3,
		},
		{
			name: 'Work Classic',
			mode: 'classic',
			creatorEmail: 'dave@example.com',
			players: ['dev@example.com', 'dave@example.com', 'mike@example.com', 'sarah@example.com'],
			entryFee: '20.00',
			creatorSubmittedCurrentPick: true,
		},
		{
			name: 'Family LPS',
			mode: 'classic',
			creatorEmail: 'mike@example.com',
			players: ['dev@example.com', 'mike@example.com', 'rich@example.com', 'james@example.com'],
			entryFee: '10.00',
			creatorEliminatedAtRound: 5,
			plannedEliminations: { 'dev@example.com': 5 },
		},
		{
			name: 'Turbo Tuesday (GW7)',
			mode: 'turbo',
			creatorEmail: 'dev@example.com',
			players: ['dev@example.com', 'dave@example.com', 'mike@example.com', 'rich@example.com'],
			entryFee: '10.00',
			turboRoundNumber: 7, // the open round — you can still make picks
			turboState: 'live',
		},
		{
			name: 'Turbo Last Week',
			mode: 'turbo',
			creatorEmail: 'dave@example.com',
			players: [
				'dev@example.com',
				'dave@example.com',
				'mike@example.com',
				'rich@example.com',
				'sarah@example.com',
			],
			entryFee: '10.00',
			turboRoundNumber: 6, // completed round — full standings
			turboState: 'completed',
		},
		{
			name: 'Cup Tuesday (GW7)',
			mode: 'cup',
			creatorEmail: 'dev@example.com',
			players: ['dev@example.com', 'dave@example.com', 'mike@example.com', 'rich@example.com'],
			entryFee: '10.00',
			turboRoundNumber: 7, // reuse the turbo seed's single-round model
			turboState: 'live',
		},
	]

	for (const seed of gameSeeds) {
		const creatorId = userIds[seed.creatorEmail]

		// Turbo/Cup games are tied to a single specific round; classic uses the open round.
		let gameRoundId = openRound.id
		let gameStatus: 'setup' | 'open' | 'active' | 'completed' = 'active'
		if ((seed.mode === 'turbo' || seed.mode === 'cup') && seed.turboRoundNumber) {
			const r = rounds.find((x) => x.number === seed.turboRoundNumber)
			if (r) {
				gameRoundId = r.id
				gameStatus = seed.turboState === 'completed' ? 'completed' : 'active'
			}
		}

		const [newGame] = await db
			.insert(game)
			.values({
				name: seed.name,
				createdBy: creatorId,
				competitionId: pl.id,
				gameMode: seed.mode,
				modeConfig:
					seed.mode === 'classic'
						? {}
						: seed.mode === 'turbo'
							? { numberOfPicks: 10 }
							: { startingLives: 3, numberOfPicks: 6 },
				entryFee: seed.entryFee ?? null,
				inviteCode: generateInviteCode(),
				status: gameStatus,
				currentRoundId: gameRoundId,
			})
			.returning()

		const playerRowsByEmail: Record<string, { id: string; userId: string }> = {}
		for (const email of seed.players) {
			const userId = userIds[email]
			const [gp] = await db
				.insert(gamePlayer)
				.values({
					gameId: newGame.id,
					userId,
					status: 'alive',
					livesRemaining: seed.mode === 'cup' ? 3 : 0,
				})
				.returning()
			playerRowsByEmail[email] = { id: gp.id, userId }

			if (seed.entryFee) {
				const paid = email === seed.creatorEmail || rng() > 0.35
				await db.insert(payment).values({
					gameId: newGame.id,
					userId,
					amount: seed.entryFee,
					status: paid ? 'paid' : 'pending',
					paidAt: paid ? new Date() : null,
				})
			}
		}

		const completedRounds = rounds.filter((r) => r.status === 'completed')

		if (seed.mode === 'classic') {
			for (const email of seed.players) {
				const playerRow = playerRowsByEmail[email]
				const usedTeamIds = new Set<string>()
				let eliminatedAt: number | null = null

				const plannedElim = seed.plannedEliminations?.[email] ?? null
				const isMissedDeadlinePlayer = email === seed.missedDeadlinePlayer
				const missedDeadlineRound = seed.missedDeadlineRound ?? null

				for (const r of completedRounds) {
					if (eliminatedAt !== null) break

					// Skip inserting a pick if this is the missed deadline player/round
					if (
						isMissedDeadlinePlayer &&
						missedDeadlineRound !== null &&
						r.number === missedDeadlineRound
					) {
						continue
					}

					const roundFixtures = fixturesByRound.get(r.id) ?? []
					const available = roundFixtures.filter(
						(f) => !usedTeamIds.has(f.homeTeamId) && !usedTeamIds.has(f.awayTeamId),
					)
					if (available.length === 0) break

					let pickedTeam: TeamRow | null = null
					let chosenFixture: FixtureRow | null = null

					if (plannedElim !== null && r.number === plannedElim) {
						// Eliminate this round — pick a losing team
						for (const f of available) {
							const loser = fixtureLoserTeam(f)
							if (loser && !usedTeamIds.has(loser.id)) {
								pickedTeam = loser
								chosenFixture = f
								break
							}
						}
						// Fallback: pick a drawing team
						if (!pickedTeam) {
							for (const f of available) {
								if (
									f.homeScore != null &&
									f.awayScore != null &&
									f.homeScore === f.awayScore &&
									!usedTeamIds.has(f.homeTeamId)
								) {
									pickedTeam = teams.find((t) => t.id === f.homeTeamId) ?? null
									chosenFixture = f
									break
								}
							}
						}
					}

					if (!pickedTeam) {
						// Pick a winner (prefer strong winners)
						const winnersWithFixture = available
							.map((f) => ({ f, winner: fixtureWinnerTeam(f) }))
							.filter((x) => x.winner && !usedTeamIds.has(x.winner.id))
						if (winnersWithFixture.length > 0) {
							// Use email hash to spread choices across players
							const idx =
								(email.charCodeAt(0) + email.length * r.number) % winnersWithFixture.length
							pickedTeam = winnersWithFixture[idx].winner
							chosenFixture = winnersWithFixture[idx].f
						} else {
							// Everyone drew — pick any
							const fallback = available[0]
							chosenFixture = fallback
							pickedTeam = teams.find((t) => t.id === fallback.homeTeamId) ?? null
						}
					}

					if (!pickedTeam || !chosenFixture) break
					usedTeamIds.add(pickedTeam.id)

					let result: 'win' | 'loss' | 'draw' = 'win'
					if (chosenFixture.homeScore != null && chosenFixture.awayScore != null) {
						const pickedHome = pickedTeam.id === chosenFixture.homeTeamId
						if (chosenFixture.homeScore === chosenFixture.awayScore) result = 'draw'
						else if (pickedHome)
							result = chosenFixture.homeScore > chosenFixture.awayScore ? 'win' : 'loss'
						else result = chosenFixture.awayScore > chosenFixture.homeScore ? 'win' : 'loss'
					}

					await db.insert(pick).values({
						gameId: newGame.id,
						gamePlayerId: playerRow.id,
						roundId: r.id,
						teamId: pickedTeam.id,
						fixtureId: chosenFixture.id,
						result,
						goalsScored:
							result === 'win'
								? pickedTeam.id === chosenFixture.homeTeamId
									? (chosenFixture.homeScore ?? 0)
									: (chosenFixture.awayScore ?? 0)
								: 0,
					})

					// Round 1 draws don't eliminate (GW1 exemption)
					if (result !== 'win' && r.number > 1) {
						eliminatedAt = r.number
					}
				}

				if (eliminatedAt !== null) {
					const elimRound = rounds.find((r) => r.number === eliminatedAt)
					if (elimRound) {
						await db
							.update(gamePlayer)
							.set({ status: 'eliminated', eliminatedRoundId: elimRound.id })
							.where(eq(gamePlayer.id, playerRow.id))
					}
				}
			}

			if (seed.creatorSubmittedCurrentPick) {
				const creatorRow = playerRowsByEmail[seed.creatorEmail]
				const roundFixtures = fixturesByRound.get(openRound.id) ?? []
				const creatorPrevPicks = await db.query.pick.findMany({
					where: eq(pick.gamePlayerId, creatorRow.id),
				})
				const usedIds = new Set(creatorPrevPicks.map((p) => p.teamId))
				const f = roundFixtures.find((f) => !usedIds.has(f.homeTeamId))
				if (f) {
					await db.insert(pick).values({
						gameId: newGame.id,
						gamePlayerId: creatorRow.id,
						roundId: openRound.id,
						teamId: f.homeTeamId,
						fixtureId: f.id,
						result: 'pending',
					})
				}
			}
		}

		if (seed.mode === 'turbo') {
			// Turbo is single-week — seed picks only for this game's specific round.
			const turboRound = rounds.find((r) => r.id === gameRoundId)
			if (!turboRound) continue
			const roundFixtures = fixturesByRound.get(turboRound.id) ?? []
			const isCompleted = seed.turboState === 'completed'

			for (const email of seed.players) {
				const playerRow = playerRowsByEmail[email]
				// For a live game, only some players have submitted picks yet —
				// everyone else shows as "no pick" so we can see the nudge UX.
				// Always skip the viewer (dev user) so they can actually make picks.
				const isViewer = email === 'dev@example.com'
				const shouldSubmit = isCompleted || (!isViewer && rng() < 0.65)
				if (!shouldSubmit) continue

				for (let i = 0; i < Math.min(10, roundFixtures.length); i++) {
					const f = roundFixtures[i]
					const predIdx = (i + turboRound.number + email.length) % 3
					const predictedResult = predIdx === 0 ? 'home_win' : predIdx === 1 ? 'draw' : 'away_win'

					let result: 'win' | 'loss' | 'pending' = isCompleted ? 'loss' : 'pending'
					let goals = 0
					if (isCompleted && f.homeScore != null && f.awayScore != null) {
						const actual =
							f.homeScore === f.awayScore
								? 'draw'
								: f.homeScore > f.awayScore
									? 'home_win'
									: 'away_win'
						if (actual === predictedResult) {
							result = 'win'
							if (predictedResult === 'home_win') goals = f.homeScore
							else if (predictedResult === 'away_win') goals = f.awayScore
							else goals = f.homeScore + f.awayScore
						}
					}

					await db.insert(pick).values({
						gameId: newGame.id,
						gamePlayerId: playerRow.id,
						roundId: turboRound.id,
						teamId: f.homeTeamId,
						fixtureId: f.id,
						confidenceRank: i + 1,
						predictedResult,
						result,
						goalsScored: goals,
					})
				}
			}
		}

		if (seed.mode === 'cup') {
			// Cup is single-week with ranked picks — seed picks only for this game's specific round.
			// Cup mode will functionally behave like turbo (since dev runs against PL with tier diff = 0).
			const cupRound = rounds.find((r) => r.id === gameRoundId)
			if (!cupRound) continue
			const roundFixtures = fixturesByRound.get(cupRound.id) ?? []
			const isCompleted = seed.turboState === 'completed'
			const numberOfPicksToSeed = 6 // from modeConfig.numberOfPicks

			for (const email of seed.players) {
				const playerRow = playerRowsByEmail[email]
				// For a live game, only some players have submitted picks yet —
				// everyone else shows as "no pick" so we can see the nudge UX.
				// Always skip the viewer (dev user) so they can actually make picks.
				const isViewer = email === 'dev@example.com'
				const shouldSubmit = isCompleted || (!isViewer && rng() < 0.65)
				if (!shouldSubmit) continue

				for (let i = 0; i < Math.min(numberOfPicksToSeed, roundFixtures.length); i++) {
					const f = roundFixtures[i]
					const predIdx = (i + cupRound.number + email.length) % 3
					const predictedResult = predIdx === 0 ? 'home_win' : predIdx === 1 ? 'draw' : 'away_win'

					let result: 'win' | 'loss' | 'pending' = isCompleted ? 'loss' : 'pending'
					let goals = 0
					if (isCompleted && f.homeScore != null && f.awayScore != null) {
						const actual =
							f.homeScore === f.awayScore
								? 'draw'
								: f.homeScore > f.awayScore
									? 'home_win'
									: 'away_win'
						if (actual === predictedResult) {
							result = 'win'
							if (predictedResult === 'home_win') goals = f.homeScore
							else if (predictedResult === 'away_win') goals = f.awayScore
							else goals = f.homeScore + f.awayScore
						}
					}

					await db.insert(pick).values({
						gameId: newGame.id,
						gamePlayerId: playerRow.id,
						roundId: cupRound.id,
						teamId: f.homeTeamId,
						fixtureId: f.id,
						confidenceRank: i + 1,
						predictedResult,
						result,
						goalsScored: goals,
					})
				}
			}
		}

		console.log(`Created "${seed.name}" (${seed.mode}) — ${seed.players.length} players`)
	}

	// --- Mid-match Cup game for live UI verification ---
	const round8 = rounds.find((r) => r.number === 8)
	if (round8) {
		const round8Fixtures = fixturesByRound.get(round8.id) ?? []
		const kickoffTime = round8Fixtures[0]?.kickoff ?? now
		const kickoff15MinAgo = new Date(kickoffTime.getTime() - 15 * 60 * 1000)

		// Update first two fixtures to live status with partial scores
		for (let i = 0; i < Math.min(2, round8Fixtures.length); i++) {
			const f = round8Fixtures[i]
			await db
				.update(fixture)
				.set({
					status: 'live',
					homeScore: 1,
					awayScore: Math.floor(rng() * 2),
					kickoff: kickoff15MinAgo,
				})
				.where(eq(fixture.id, f.id))
		}
		console.log(`Updated 2 fixtures in round 8 to live status for verification`)
	}

	console.log('\nSeed complete!')
	console.log('\nLog in with any of these (password: password123):')
	for (const u of DEV_USERS) console.log(`  ${u.email}`)
	process.exit(0)
}

seed().catch((err) => {
	console.error('Seed failed:', err)
	process.exit(1)
})
