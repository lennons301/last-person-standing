import { NextResponse } from "next/server"
import { fetchBootstrap, fetchFixtures } from "@/lib/fpl/client"
import { syncTeams, syncGameweeks, syncFixtures } from "@/lib/fpl/sync"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [bootstrap, fplFixtures] = await Promise.all([
      fetchBootstrap(),
      fetchFixtures(),
    ])

    await syncTeams(bootstrap.teams)
    await syncGameweeks(bootstrap.events)
    await syncFixtures(fplFixtures)

    return NextResponse.json({
      success: true,
      synced: {
        teams: bootstrap.teams.length,
        gameweeks: bootstrap.events.length,
        fixtures: fplFixtures.length,
      },
    })
  } catch (error) {
    console.error("FPL sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
