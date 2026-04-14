import { auth } from '../src/lib/auth'
import { db } from '../src/lib/db'
import { competition, fixture, round, team } from '../src/lib/schema/competition'

const PL_TEAMS = [
	{ name: 'Arsenal', shortName: 'ARS', primaryColor: '#EF0107' },
	{ name: 'Aston Villa', shortName: 'AVL', primaryColor: '#670E36' },
	{ name: 'Bournemouth', shortName: 'BOU', primaryColor: '#DA291C' },
	{ name: 'Brentford', shortName: 'BRE', primaryColor: '#e30613' },
	{ name: 'Brighton', shortName: 'BHA', primaryColor: '#0057B8' },
	{ name: 'Chelsea', shortName: 'CHE', primaryColor: '#034694' },
	{ name: 'Crystal Palace', shortName: 'CRY', primaryColor: '#1B458F' },
	{ name: 'Everton', shortName: 'EVE', primaryColor: '#003399' },
	{ name: 'Fulham', shortName: 'FUL', primaryColor: '#000000' },
	{ name: 'Ipswich Town', shortName: 'IPS', primaryColor: '#3a64a3' },
	{ name: 'Leicester City', shortName: 'LEI', primaryColor: '#003090' },
	{ name: 'Liverpool', shortName: 'LIV', primaryColor: '#C8102E' },
	{ name: 'Manchester City', shortName: 'MCI', primaryColor: '#6CABDD' },
	{ name: 'Manchester United', shortName: 'MUN', primaryColor: '#DA291C' },
	{ name: 'Newcastle United', shortName: 'NEW', primaryColor: '#241F20' },
	{ name: 'Nottingham Forest', shortName: 'NFO', primaryColor: '#DD0000' },
	{ name: 'Southampton', shortName: 'SOU', primaryColor: '#D71920' },
	{ name: 'Tottenham Hotspur', shortName: 'TOT', primaryColor: '#132257' },
	{ name: 'West Ham United', shortName: 'WHU', primaryColor: '#7A263A' },
	{ name: 'Wolverhampton', shortName: 'WOL', primaryColor: '#FDB913' },
]

async function seed() {
	console.log('Seeding database...')

	// Create a dev user via Better Auth
	try {
		await auth.api.signUpEmail({
			body: {
				name: 'Dev User',
				email: 'dev@example.com',
				password: 'password123',
			},
		})
		console.log('Created dev user: dev@example.com / password123')
	} catch {
		console.log('Dev user already exists, skipping')
	}

	// Create Premier League competition
	const [pl] = await db
		.insert(competition)
		.values({
			name: 'Premier League 2025/26',
			type: 'league',
			dataSource: 'fpl',
			season: '2025/26',
		})
		.onConflictDoNothing()
		.returning()

	if (!pl) {
		console.log('Competition already exists, skipping')
		process.exit(0)
	}

	console.log(`Created competition: ${pl.name}`)

	// Create teams
	const insertedTeams = await db.insert(team).values(PL_TEAMS).returning()

	console.log(`Created ${insertedTeams.length} teams`)

	// Create 3 sample rounds
	const rounds = await db
		.insert(round)
		.values([
			{ competitionId: pl.id, number: 1, name: 'Gameweek 1', status: 'completed' as const },
			{
				competitionId: pl.id,
				number: 2,
				name: 'Gameweek 2',
				status: 'open' as const,
				deadline: new Date(Date.now() + 86400000),
			},
			{ competitionId: pl.id, number: 3, name: 'Gameweek 3', status: 'upcoming' as const },
		])
		.returning()

	console.log(`Created ${rounds.length} rounds`)

	// Create sample fixtures for round 2 (the open round)
	const teamMap = new Map(insertedTeams.map((t) => [t.shortName, t]))
	const matchups = [
		['ARS', 'CHE'],
		['LIV', 'IPS'],
		['MCI', 'WOL'],
		['AVL', 'BRE'],
		['NEW', 'BOU'],
		['TOT', 'WHU'],
		['BHA', 'EVE'],
		['NFO', 'CRY'],
		['FUL', 'LEI'],
		['SOU', 'MUN'],
	]

	const fixtureValues = matchups.map(([home, away]) => {
		const homeTeam = teamMap.get(home)
		const awayTeam = teamMap.get(away)
		if (!homeTeam || !awayTeam) throw new Error(`Team not found: ${home} or ${away}`)
		return {
			roundId: rounds[1].id,
			homeTeamId: homeTeam.id,
			awayTeamId: awayTeam.id,
			kickoff: new Date(Date.now() + 86400000),
			status: 'scheduled' as const,
		}
	})

	await db.insert(fixture).values(fixtureValues)
	console.log(`Created ${fixtureValues.length} fixtures for ${rounds[1].name}`)

	console.log('Seed complete!')
	process.exit(0)
}

seed().catch((err) => {
	console.error('Seed failed:', err)
	process.exit(1)
})
