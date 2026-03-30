import { db } from "@/lib/db"
import { teams, gameweeks, fixtures } from "@/lib/schema/domain"
import type { FPLBootstrapResponse, FPLFixture } from "./types"

export async function syncTeams(fplTeams: FPLBootstrapResponse["teams"]) {
  for (const team of fplTeams) {
    await db
      .insert(teams)
      .values({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        code: team.code,
      })
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          name: team.name,
          shortName: team.short_name,
          code: team.code,
        },
      })
  }
}

export async function syncGameweeks(events: FPLBootstrapResponse["events"]) {
  for (const event of events) {
    await db
      .insert(gameweeks)
      .values({
        id: event.id,
        name: event.name,
        deadline: new Date(event.deadline_time),
        finished: event.finished,
      })
      .onConflictDoUpdate({
        target: gameweeks.id,
        set: {
          name: event.name,
          deadline: new Date(event.deadline_time),
          finished: event.finished,
        },
      })
  }
}

export async function syncFixtures(fplFixtures: FPLFixture[]) {
  for (const fixture of fplFixtures) {
    await db
      .insert(fixtures)
      .values({
        id: fixture.id,
        gameweekId: fixture.event,
        homeTeamId: fixture.team_h,
        awayTeamId: fixture.team_a,
        homeScore: fixture.team_h_score,
        awayScore: fixture.team_a_score,
        kickoff: fixture.kickoff_time ? new Date(fixture.kickoff_time) : null,
        started: fixture.started,
        finished: fixture.finished,
      })
      .onConflictDoUpdate({
        target: fixtures.id,
        set: {
          gameweekId: fixture.event,
          homeTeamId: fixture.team_h,
          awayTeamId: fixture.team_a,
          homeScore: fixture.team_h_score,
          awayScore: fixture.team_a_score,
          kickoff: fixture.kickoff_time ? new Date(fixture.kickoff_time) : null,
          started: fixture.started,
          finished: fixture.finished,
        },
      })
  }
}
