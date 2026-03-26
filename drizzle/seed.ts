import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { teams, gameweeks, fixtures } from "../src/lib/schema/domain"

async function seed() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL is required")
    process.exit(1)
  }

  const client = postgres(url)
  const db = drizzle(client)

  console.log("Seeding teams...")
  await db
    .insert(teams)
    .values([
      { id: 1, name: "Arsenal", shortName: "ARS", code: 3 },
      { id: 2, name: "Aston Villa", shortName: "AVL", code: 7 },
      { id: 3, name: "Bournemouth", shortName: "BOU", code: 91 },
      { id: 4, name: "Brentford", shortName: "BRE", code: 94 },
      { id: 5, name: "Brighton", shortName: "BHA", code: 36 },
      { id: 6, name: "Chelsea", shortName: "CHE", code: 8 },
      { id: 7, name: "Crystal Palace", shortName: "CRY", code: 31 },
      { id: 8, name: "Everton", shortName: "EVE", code: 11 },
      { id: 9, name: "Fulham", shortName: "FUL", code: 54 },
      { id: 10, name: "Ipswich Town", shortName: "IPS", code: 40 },
      { id: 11, name: "Leicester", shortName: "LEI", code: 13 },
      { id: 12, name: "Liverpool", shortName: "LIV", code: 14 },
      { id: 13, name: "Man City", shortName: "MCI", code: 43 },
      { id: 14, name: "Man Utd", shortName: "MUN", code: 1 },
      { id: 15, name: "Newcastle", shortName: "NEW", code: 4 },
      { id: 16, name: "Nott'm Forest", shortName: "NFO", code: 17 },
      { id: 17, name: "Southampton", shortName: "SOU", code: 20 },
      { id: 18, name: "Spurs", shortName: "TOT", code: 6 },
      { id: 19, name: "West Ham", shortName: "WHU", code: 21 },
      { id: 20, name: "Wolves", shortName: "WOL", code: 39 },
    ])
    .onConflictDoNothing()

  console.log("Seeding gameweeks...")
  await db
    .insert(gameweeks)
    .values([
      {
        id: 1,
        name: "Gameweek 1",
        deadline: new Date("2025-08-16T10:00:00Z"),
        finished: true,
      },
      {
        id: 2,
        name: "Gameweek 2",
        deadline: new Date("2025-08-23T10:00:00Z"),
        finished: true,
      },
      {
        id: 3,
        name: "Gameweek 3",
        deadline: new Date("2025-08-30T10:00:00Z"),
        finished: false,
      },
    ])
    .onConflictDoNothing()

  console.log("Seeding fixtures...")
  await db
    .insert(fixtures)
    .values([
      {
        id: 1,
        gameweekId: 1,
        homeTeamId: 1,
        awayTeamId: 12,
        homeScore: 2,
        awayScore: 1,
        kickoff: new Date("2025-08-16T14:00:00Z"),
        started: true,
        finished: true,
      },
      {
        id: 2,
        gameweekId: 1,
        homeTeamId: 6,
        awayTeamId: 13,
        homeScore: 0,
        awayScore: 2,
        kickoff: new Date("2025-08-16T16:30:00Z"),
        started: true,
        finished: true,
      },
      {
        id: 3,
        gameweekId: 2,
        homeTeamId: 12,
        awayTeamId: 6,
        homeScore: 3,
        awayScore: 1,
        kickoff: new Date("2025-08-23T14:00:00Z"),
        started: true,
        finished: true,
      },
      {
        id: 4,
        gameweekId: 3,
        homeTeamId: 1,
        awayTeamId: 6,
        homeScore: null,
        awayScore: null,
        kickoff: new Date("2025-08-30T14:00:00Z"),
        started: false,
        finished: false,
      },
    ])
    .onConflictDoNothing()

  console.log("Seed complete!")
  await client.end()
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
