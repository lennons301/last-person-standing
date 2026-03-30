import type { FPLBootstrapResponse, FPLFixture } from "./types"

const FPL_BASE = "https://fantasy.premierleague.com/api"

const headers = {
  "User-Agent": "Mozilla/5.0 (compatible; LastPersonStanding/1.0)",
}

export async function fetchBootstrap(): Promise<FPLBootstrapResponse> {
  const res = await fetch(`${FPL_BASE}/bootstrap-static/`, { headers })
  if (!res.ok) {
    throw new Error(`FPL bootstrap API error: ${res.status}`)
  }
  return res.json()
}

export async function fetchFixtures(): Promise<FPLFixture[]> {
  const res = await fetch(`${FPL_BASE}/fixtures/`, { headers })
  if (!res.ok) {
    throw new Error(`FPL fixtures API error: ${res.status}`)
  }
  return res.json()
}
