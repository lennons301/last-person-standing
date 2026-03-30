# Last Person Standing — Implementation Plan (Refreshed)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean-room Next.js 16 App Router application replacing the Lovable-built Vite SPA, at `/home/sean/code/last-person-standing`.

**Architecture:** Next.js 16 App Router with Server Components by default. Neon (serverless Postgres) for production, local Postgres 17 via Docker for dev. Drizzle ORM for type-safe queries. Better Auth for email/password authentication with database sessions. Game logic in TypeScript (not Postgres RPCs). FPL data synced via Vercel Cron API routes. Authorization enforced in TypeScript, not Postgres RLS.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4, shadcn/ui (new-york), Drizzle ORM + postgres.js driver, Better Auth, Vitest, Vercel (lhr1 region), Doppler for secrets

**Design Spec:** `/home/sean/code/premier-league-survivor-picks/docs/superpowers/specs/2026-03-19-last-person-standing-migration-design.md`

**Platform Standards:** `~/code/platform/` — environments, secrets (Doppler), local dev (Docker), testing, documentation

**Previous plan (superseded):** `/home/sean/code/premier-league-survivor-picks/docs/superpowers/plans/2026-03-22-last-person-standing-implementation.md`

---

## Completed Tasks

These tasks are already done and committed:

- **Task 1:** Scaffold Next.js 16 project (commit `25a3c58`)
- **Task 2:** Install dependencies, vitest, shadcn/ui components (commit `ca531ab`)
- **Task 3:** Database & auth foundation — Drizzle schema, Better Auth config, docker-compose, seed script, verified against local Postgres 17 (commit `51e7615`)

---

## What Exists

```
src/
  app/
    api/auth/[...all]/route.ts    # Better Auth API route handler
    layout.tsx                     # Root layout (Geist fonts, scaffold default)
    page.tsx                       # Placeholder "Last Person Standing"
    globals.css                    # Tailwind + shadcn theme (light+dark)
  components/ui/                   # ~15 shadcn/ui components installed
  lib/
    auth.ts                        # Better Auth server config (email+password, Drizzle adapter)
    auth-client.ts                 # Better Auth client (useSession, signIn, signUp, signOut)
    db.ts                          # Drizzle + postgres.js connection
    schema/
      auth.ts                      # Better Auth tables (user, session, account, verification)
      domain.ts                    # App tables (teams, gameweeks, fixtures, games, picks, etc.)
      index.ts                     # Re-exports
    utils.ts                       # cn() utility
drizzle/
  seed.ts                          # Seed script (teams, gameweeks, fixtures)
drizzle.config.ts                  # Drizzle Kit config
docker-compose.yml                 # Local Postgres 17
package.json                       # All deps installed
vitest.config.ts                   # Vitest configured
```

---

## File Structure (Final)

```
src/
├── app/
│   ├── layout.tsx                          # Root layout: fonts, theme, metadata, providers
│   ├── (auth)/
│   │   ├── layout.tsx                      # Centered card layout for auth pages
│   │   ├── login/page.tsx                  # Email/password login
│   │   └── signup/page.tsx                 # Registration form
│   ├── (app)/
│   │   ├── layout.tsx                      # Authenticated layout with navbar
│   │   ├── page.tsx                        # Home — active games, picks due
│   │   ├── games/
│   │   │   ├── page.tsx                    # Game list — browse, join
│   │   │   ├── new/page.tsx                # Create game form
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # Game detail — standings, fixtures
│   │   │       ├── admin/page.tsx          # Game admin — manage players, settings
│   │   │       └── progress/page.tsx       # Elimination timeline, stats
│   │   └── pick/
│   │       └── [gameId]/
│   │           └── [mode]/page.tsx         # Unified pick page (classic/turbo/cup/escalating)
│   └── api/
│       ├── auth/[...all]/route.ts          # Better Auth handler (EXISTS)
│       ├── fpl/sync/route.ts               # FPL data sync (cron + manual)
│       ├── scores/poll/route.ts            # Live scores polling (cron)
│       ├── games/process/route.ts          # Game processing (cron)
│       └── picks/route.ts                  # Pick submission
├── components/
│   ├── ui/                                 # shadcn/ui primitives (EXISTS)
│   ├── providers.tsx                       # Client-side providers (theme, toaster)
│   └── features/
│       ├── navigation/
│       │   ├── navbar.tsx                  # Top nav bar
│       │   └── user-menu.tsx               # User dropdown (profile, sign out)
│       ├── games/
│       │   ├── game-card.tsx               # Game summary card
│       │   ├── game-list.tsx               # Grid of game cards
│       │   ├── create-game-form.tsx        # Create game form
│       │   └── join-game-button.tsx        # Join game action
│       ├── picks/
│       │   ├── pick-selector.tsx           # Unified pick UI (adapts per mode)
│       │   ├── fixture-row.tsx             # Single fixture with team badges, scores
│       │   └── team-badge.tsx              # Team crest + name
│       ├── leaderboard/
│       │   └── leaderboard.tsx             # Adaptive leaderboard (columns per mode)
│       ├── progress/
│       │   └── elimination-grid.tsx        # Elimination timeline grid
│       └── admin/
│           └── player-management.tsx       # Add/remove players, status
├── lib/
│   ├── auth.ts                             # Better Auth server config (EXISTS)
│   ├── auth-client.ts                      # Better Auth client (EXISTS)
│   ├── auth-helpers.ts                     # Session helpers for server components
│   ├── db.ts                               # Drizzle + postgres.js (EXISTS)
│   ├── schema/                             # Drizzle schema (EXISTS)
│   ├── types.ts                            # Inferred types from Drizzle schema
│   ├── fpl/
│   │   ├── types.ts                        # FPL API response types
│   │   ├── client.ts                       # FPL API client
│   │   └── sync.ts                         # Upsert logic for teams/gameweeks/fixtures
│   ├── scores/
│   │   ├── types.ts                        # ScoresProvider interface
│   │   └── provider.ts                     # Stub provider
│   ├── game-logic/
│   │   ├── classic.ts                      # Classic elimination rules
│   │   ├── classic.test.ts
│   │   ├── turbo.ts                        # Turbo scoring + completion
│   │   ├── turbo.test.ts
│   │   ├── cup.ts                          # Cup bracket progression
│   │   ├── cup.test.ts
│   │   ├── escalating.ts                   # Escalating stake logic
│   │   ├── escalating.test.ts
│   │   ├── gameweeks.ts                    # Deadline activation, gameweek lifecycle
│   │   ├── gameweeks.test.ts
│   │   ├── prizes.ts                       # Prize pot calculation
│   │   └── prizes.test.ts
│   ├── picks/
│   │   ├── validation.ts                   # Pick validation
│   │   └── validation.test.ts
│   └── utils.ts                            # cn() utility (EXISTS)
├── proxy.ts                                # Next.js 16 proxy (replaces middleware.ts)
├── vercel.json                             # Region + cron config
├── scripts/
│   └── migrate-data.ts                     # One-time data migration
└── .github/workflows/
    └── ci.yml                              # Lint, typecheck, test, build
```

---

## Task 4: Domain Types

**Files:**
- Create: `src/lib/types.ts`

Drizzle infers types from the schema. We export them from a single file so the rest of the codebase imports from `@/lib/types` rather than reaching into schema internals.

**Important:** Drizzle maps `numeric` columns to `string` (arbitrary precision). The `entryFee` and `stake` fields are strings, not numbers. The `settings` field is `jsonb` → `unknown`. We define a proper type for it.

- [ ] **Step 1: Create types file**

Create `src/lib/types.ts`:

```typescript
import type {
  teams,
  gameweeks,
  fixtures,
  games,
  gamePlayers,
  gameGameweeks,
  picks,
  cupFixtures,
  gameWinners,
  gameModeEnum,
  gameStatusEnum,
  playerStatusEnum,
  gameweekStatusEnum,
  pickResultEnum,
} from "./schema/domain"
import type { user } from "./schema/auth"

// Row types (what you get back from a SELECT)
export type Team = typeof teams.$inferSelect
export type Gameweek = typeof gameweeks.$inferSelect
export type Fixture = typeof fixtures.$inferSelect
export type Game = typeof games.$inferSelect
export type GamePlayer = typeof gamePlayers.$inferSelect
export type GameGameweek = typeof gameGameweeks.$inferSelect
export type Pick = typeof picks.$inferSelect
export type CupFixture = typeof cupFixtures.$inferSelect
export type GameWinner = typeof gameWinners.$inferSelect
export type User = typeof user.$inferSelect

// Insert types (what you pass to INSERT)
export type NewTeam = typeof teams.$inferInsert
export type NewGameweek = typeof gameweeks.$inferInsert
export type NewFixture = typeof fixtures.$inferInsert
export type NewGame = typeof games.$inferInsert
export type NewGamePlayer = typeof gamePlayers.$inferInsert
export type NewPick = typeof picks.$inferInsert

// Enum value types
export type GameMode = (typeof gameModeEnum.enumValues)[number]
export type GameStatus = (typeof gameStatusEnum.enumValues)[number]
export type PlayerStatus = (typeof playerStatusEnum.enumValues)[number]
export type GameweekStatus = (typeof gameweekStatusEnum.enumValues)[number]
export type PickResult = (typeof pickResultEnum.enumValues)[number]

// Game settings (typed from the jsonb column)
export interface GameSettings {
  maxPlayers?: number
  allowRebuys?: boolean
}
```

- [ ] **Step 2: Verify types compile**

```bash
doppler run -- npx tsc --noEmit src/lib/types.ts
```

Expected: No errors. If there are, fix the import paths or type references.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add domain types inferred from Drizzle schema"
```

---

## Task 5: Auth Helpers & Proxy

**Files:**
- Create: `src/lib/auth-helpers.ts`, `src/proxy.ts`

Better Auth handles sessions via database-backed cookies. We need:
1. `getSession()` — cached session lookup for Server Components (avoids re-fetching per component)
2. `requireSession()` — same but redirects to `/login` if unauthenticated
3. `proxy.ts` — route protection at the middleware level

**Note:** Check `node_modules/next/dist/docs/` for Next.js 16 proxy.ts API before implementing. The export name and signature may differ from `middleware.ts`.

- [ ] **Step 1: Create auth helpers**

Create `src/lib/auth-helpers.ts`:

```typescript
import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "./auth"

/**
 * Get the current session. Cached per request via React.cache()
 * so multiple Server Components can call this without re-querying.
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
})

/**
 * Get the current session or redirect to /login.
 * Use in Server Components that require authentication.
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}
```

- [ ] **Step 2: Create proxy.ts**

Check `node_modules/next/dist/docs/` for the exact proxy.ts export API, then create `src/proxy.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Better Auth API routes pass through
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Cron routes authenticated by CRON_SECRET header, not session
  if (
    pathname.startsWith("/api/fpl") ||
    pathname.startsWith("/api/scores") ||
    pathname.startsWith("/api/games/process")
  ) {
    return NextResponse.next()
  }

  // Public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return NextResponse.next()
  }

  // Static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next()
  }

  // Check session for all other routes
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

**Important:** The export name may need to be `proxy` instead of `middleware` in Next.js 16. Read the Next.js 16 proxy docs in `node_modules/next/dist/docs/` and adjust the export name accordingly.

- [ ] **Step 3: Verify dev server starts**

```bash
doppler run -- npm run dev
```

Expected: Dev server starts, no errors. Navigate to `http://localhost:3000` — should redirect to `/login` (which 404s for now, that's OK).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth-helpers.ts src/proxy.ts
git commit -m "feat: add auth session helpers and route protection proxy"
```

---

## Task 6: Game Logic — Classic Mode (TDD)

**Files:**
- Create: `src/lib/game-logic/classic.ts`, `src/lib/game-logic/classic.test.ts`

Pure functions. No DB access. Types come from `@/lib/types`.

Classic mode: each alive player picks a team each gameweek. If the team wins, they survive. If it loses or draws, they're eliminated. Last player standing wins. If all remaining players are eliminated in the same gameweek, they split the pot.

- [ ] **Step 1: Write failing tests for classic evaluation**

Create `src/lib/game-logic/classic.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  evaluateClassicPicks,
  determineClassicWinner,
} from "./classic"
import type { Pick, Fixture, GamePlayer } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1",
    gameId: "game-1",
    playerId: "player-1",
    gameweekId: 1,
    teamId: 1,
    fixtureId: 1,
    mode: "classic",
    prediction: null,
    stake: null,
    cupRound: null,
    result: "pending",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    gameweekId: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 2,
    awayScore: 1,
    kickoff: new Date("2025-01-01T15:00:00Z"),
    started: true,
    finished: true,
    ...overrides,
  }
}

function makeGamePlayer(overrides: Partial<GamePlayer> = {}): GamePlayer {
  return {
    id: "gp-1",
    gameId: "game-1",
    playerId: "player-1",
    status: "alive",
    eliminatedAtGameweek: null,
    joinedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

describe("evaluateClassicPicks", () => {
  it("marks pick as won when picked team wins at home", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks pick as won when picked team wins away", () => {
    const picks = [makePick({ teamId: 2, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 0, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks pick as lost when picked team loses", () => {
    const picks = [makePick({ teamId: 2, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 3, awayScore: 0 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("marks pick as lost on a draw (classic: must win)", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("keeps pick as pending when fixture has no scores", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1 })]
    const fixtures = [
      makeFixture({ id: 1, homeScore: null, awayScore: null, finished: false }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("pending")
  })

  it("finds the correct fixture for each pick", () => {
    const picks = [
      makePick({ id: "p1", teamId: 1, fixtureId: 1 }),
      makePick({ id: "p2", playerId: "player-2", teamId: 3, fixtureId: 2 }),
    ]
    const fixtures = [
      makeFixture({ id: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 0 }),
      makeFixture({ id: 2, homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 1 }),
    ]
    const results = evaluateClassicPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
    expect(results[1].result).toBe("lost")
  })
})

describe("determineClassicWinner", () => {
  it("returns no winner when multiple players alive", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "alive" }),
      makeGamePlayer({ playerId: "p2", status: "alive" }),
    ]
    expect(determineClassicWinner(players)).toBeNull()
  })

  it("returns single winner", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "alive" }),
      makeGamePlayer({ playerId: "p2", status: "eliminated" }),
      makeGamePlayer({ playerId: "p3", status: "eliminated" }),
    ]
    const result = determineClassicWinner(players)
    expect(result).toEqual({ winners: ["p1"], isSplit: false })
  })

  it("returns split when all remaining eliminated in same gameweek", () => {
    const players = [
      makeGamePlayer({ playerId: "p1", status: "eliminated", eliminatedAtGameweek: 5 }),
      makeGamePlayer({ playerId: "p2", status: "eliminated", eliminatedAtGameweek: 5 }),
      makeGamePlayer({ playerId: "p3", status: "eliminated", eliminatedAtGameweek: 3 }),
    ]
    const result = determineClassicWinner(players)
    expect(result).toEqual({ winners: ["p1", "p2"], isSplit: true })
  })

  it("returns null when no players at all", () => {
    expect(determineClassicWinner([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
doppler run -- npx vitest run src/lib/game-logic/classic.test.ts
```

Expected: FAIL — module `./classic` not found.

- [ ] **Step 3: Implement classic game logic**

Create `src/lib/game-logic/classic.ts`:

```typescript
import type { Pick, Fixture, GamePlayer, PickResult } from "@/lib/types"

interface EvaluatedPick extends Pick {
  result: PickResult
}

function didTeamWin(teamId: number, fixture: Fixture): boolean | null {
  if (fixture.homeScore === null || fixture.awayScore === null) return null
  if (fixture.homeTeamId === teamId) return fixture.homeScore > fixture.awayScore
  if (fixture.awayTeamId === teamId) return fixture.awayScore > fixture.homeScore
  return null
}

export function evaluateClassicPicks(
  picks: Pick[],
  fixtures: Fixture[]
): EvaluatedPick[] {
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]))

  return picks.map((pick) => {
    const fixture = fixtureMap.get(pick.fixtureId!)
    if (!fixture) return { ...pick, result: "pending" as const }

    const won = didTeamWin(pick.teamId, fixture)
    if (won === null) return { ...pick, result: "pending" as const }

    return { ...pick, result: won ? ("won" as const) : ("lost" as const) }
  })
}

interface WinnerResult {
  winners: string[]
  isSplit: boolean
}

export function determineClassicWinner(
  players: GamePlayer[]
): WinnerResult | null {
  if (players.length === 0) return null

  const alive = players.filter((p) => p.status === "alive")

  if (alive.length === 1) {
    return { winners: [alive[0].playerId], isSplit: false }
  }

  if (alive.length > 1) return null

  // All eliminated — find who was eliminated last (highest gameweek)
  const maxGw = Math.max(
    ...players
      .filter((p) => p.eliminatedAtGameweek !== null)
      .map((p) => p.eliminatedAtGameweek!)
  )

  const lastEliminated = players.filter(
    (p) => p.eliminatedAtGameweek === maxGw
  )

  return {
    winners: lastEliminated.map((p) => p.playerId),
    isSplit: lastEliminated.length > 1,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
doppler run -- npx vitest run src/lib/game-logic/classic.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/classic.ts src/lib/game-logic/classic.test.ts
git commit -m "feat: add classic mode game logic with tests"
```

---

## Task 7: Game Logic — Turbo Mode (TDD)

**Files:**
- Create: `src/lib/game-logic/turbo.ts`, `src/lib/game-logic/turbo.test.ts`

Turbo mode: players predict home/draw/away for each fixture. Correct prediction = 1 point. Ranked by total points at end of gameweek.

- [ ] **Step 1: Write failing tests**

Create `src/lib/game-logic/turbo.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { scoreTurboPicks, rankTurboPlayers } from "./turbo"
import type { Pick, Fixture } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1",
    gameId: "game-1",
    playerId: "player-1",
    gameweekId: 1,
    teamId: 1,
    fixtureId: 1,
    mode: "turbo",
    prediction: "home",
    stake: null,
    cupRound: null,
    result: "pending",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    gameweekId: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 2,
    awayScore: 1,
    kickoff: new Date("2025-01-01T15:00:00Z"),
    started: true,
    finished: true,
    ...overrides,
  }
}

describe("scoreTurboPicks", () => {
  it("awards won for correct home prediction", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 2, awayScore: 0 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("awards won for correct draw prediction", () => {
    const picks = [makePick({ prediction: "draw", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 1, awayScore: 1 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("awards won for correct away prediction", () => {
    const picks = [makePick({ prediction: "away", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 0, awayScore: 2 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks lost for incorrect prediction", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: 0, awayScore: 2 })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })

  it("keeps pending when scores not available", () => {
    const picks = [makePick({ prediction: "home", fixtureId: 1 })]
    const fixtures = [makeFixture({ homeScore: null, awayScore: null })]
    const results = scoreTurboPicks(picks, fixtures)
    expect(results[0].result).toBe("pending")
  })
})

describe("rankTurboPlayers", () => {
  it("ranks players by correct predictions descending", () => {
    const picks = [
      makePick({ playerId: "p1", fixtureId: 1, result: "won" }),
      makePick({ playerId: "p1", fixtureId: 2, result: "won" }),
      makePick({ playerId: "p2", fixtureId: 1, result: "won" }),
      makePick({ playerId: "p2", fixtureId: 2, result: "lost" }),
    ]
    const rankings = rankTurboPlayers(picks)
    expect(rankings[0]).toEqual({ playerId: "p1", points: 2 })
    expect(rankings[1]).toEqual({ playerId: "p2", points: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
doppler run -- npx vitest run src/lib/game-logic/turbo.test.ts
```

Expected: FAIL — module `./turbo` not found.

- [ ] **Step 3: Implement turbo game logic**

Create `src/lib/game-logic/turbo.ts`:

```typescript
import type { Pick, Fixture, PickResult } from "@/lib/types"

interface EvaluatedPick extends Pick {
  result: PickResult
}

function getActualResult(fixture: Fixture): "home" | "draw" | "away" | null {
  if (fixture.homeScore === null || fixture.awayScore === null) return null
  if (fixture.homeScore > fixture.awayScore) return "home"
  if (fixture.awayScore > fixture.homeScore) return "away"
  return "draw"
}

export function scoreTurboPicks(
  picks: Pick[],
  fixtures: Fixture[]
): EvaluatedPick[] {
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]))

  return picks.map((pick) => {
    const fixture = fixtureMap.get(pick.fixtureId!)
    if (!fixture) return { ...pick, result: "pending" as const }

    const actual = getActualResult(fixture)
    if (!actual) return { ...pick, result: "pending" as const }

    const correct = pick.prediction === actual
    return { ...pick, result: correct ? ("won" as const) : ("lost" as const) }
  })
}

export interface TurboRanking {
  playerId: string
  points: number
}

export function rankTurboPlayers(picks: Pick[]): TurboRanking[] {
  const pointsByPlayer = new Map<string, number>()

  for (const pick of picks) {
    const current = pointsByPlayer.get(pick.playerId) ?? 0
    pointsByPlayer.set(
      pick.playerId,
      current + (pick.result === "won" ? 1 : 0)
    )
  }

  return Array.from(pointsByPlayer.entries())
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
doppler run -- npx vitest run src/lib/game-logic/turbo.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/turbo.ts src/lib/game-logic/turbo.test.ts
git commit -m "feat: add turbo mode game logic with tests"
```

---

## Task 8: Game Logic — Escalating & Cup Modes (TDD)

**Files:**
- Create: `src/lib/game-logic/escalating.ts`, `src/lib/game-logic/escalating.test.ts`, `src/lib/game-logic/cup.ts`, `src/lib/game-logic/cup.test.ts`

Escalating: same win/loss logic as classic, but each pick has a stake. The difference is in prize calculation (sum of stakes), not in evaluation.

Cup: bracket-based. Two players each pick a side of a real PL fixture. The player whose side wins advances.

- [ ] **Step 1: Write failing tests for escalating mode**

Create `src/lib/game-logic/escalating.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { evaluateEscalatingPicks } from "./escalating"
import type { Pick, Fixture } from "@/lib/types"

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: "pick-1",
    gameId: "game-1",
    playerId: "player-1",
    gameweekId: 1,
    teamId: 1,
    fixtureId: 1,
    mode: "escalating",
    prediction: null,
    stake: "10",
    cupRound: null,
    result: "pending",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    gameweekId: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 2,
    awayScore: 1,
    kickoff: new Date("2025-01-01T15:00:00Z"),
    started: true,
    finished: true,
    ...overrides,
  }
}

describe("evaluateEscalatingPicks", () => {
  it("uses same win/loss logic as classic (team must win, draw = loss)", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1, stake: "10" })]
    const fixtures = [makeFixture({ homeScore: 2, awayScore: 1 })]
    const results = evaluateEscalatingPicks(picks, fixtures)
    expect(results[0].result).toBe("won")
  })

  it("marks draw as loss", () => {
    const picks = [makePick({ teamId: 1, fixtureId: 1, stake: "20" })]
    const fixtures = [makeFixture({ homeScore: 1, awayScore: 1 })]
    const results = evaluateEscalatingPicks(picks, fixtures)
    expect(results[0].result).toBe("lost")
  })
})
```

- [ ] **Step 2: Implement escalating mode**

Create `src/lib/game-logic/escalating.ts`:

```typescript
import type { Pick, Fixture, PickResult } from "@/lib/types"
import { evaluateClassicPicks } from "./classic"

// Escalating uses the same win/loss logic as classic.
// The difference is that each pick has a stake amount.
// Elimination works the same way — team must win outright.
export function evaluateEscalatingPicks(
  picks: Pick[],
  fixtures: Fixture[]
): (Pick & { result: PickResult })[] {
  return evaluateClassicPicks(picks, fixtures)
}
```

- [ ] **Step 3: Write failing tests for cup mode**

Create `src/lib/game-logic/cup.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { resolveCupFixture } from "./cup"

describe("resolveCupFixture", () => {
  it("returns player1 as winner when fixture result favours them", () => {
    const result = resolveCupFixture({
      player1Id: "p1",
      player2Id: "p2",
      fixtureHomeScore: 2,
      fixtureAwayScore: 1,
      player1PickedHome: true,
    })
    expect(result).toBe("p1")
  })

  it("returns player2 as winner when fixture result favours them", () => {
    const result = resolveCupFixture({
      player1Id: "p1",
      player2Id: "p2",
      fixtureHomeScore: 0,
      fixtureAwayScore: 2,
      player1PickedHome: true,
    })
    expect(result).toBe("p2")
  })

  it("returns null when fixture is a draw", () => {
    const result = resolveCupFixture({
      player1Id: "p1",
      player2Id: "p2",
      fixtureHomeScore: 1,
      fixtureAwayScore: 1,
      player1PickedHome: true,
    })
    expect(result).toBeNull()
  })

  it("handles player1 picking away side", () => {
    const result = resolveCupFixture({
      player1Id: "p1",
      player2Id: "p2",
      fixtureHomeScore: 0,
      fixtureAwayScore: 3,
      player1PickedHome: false,
    })
    expect(result).toBe("p1")
  })
})
```

- [ ] **Step 4: Implement cup mode**

Create `src/lib/game-logic/cup.ts`:

```typescript
interface CupFixtureInput {
  player1Id: string
  player2Id: string
  fixtureHomeScore: number
  fixtureAwayScore: number
  player1PickedHome: boolean
}

/**
 * Resolve a cup fixture matchup.
 * Each player picks a side (home or away) of a real PL fixture.
 * The player whose side wins the real fixture advances.
 * Returns winner player ID, or null if draw.
 */
export function resolveCupFixture(input: CupFixtureInput): string | null {
  const {
    player1Id,
    player2Id,
    fixtureHomeScore,
    fixtureAwayScore,
    player1PickedHome,
  } = input

  if (fixtureHomeScore === fixtureAwayScore) return null

  const homeWins = fixtureHomeScore > fixtureAwayScore

  if (player1PickedHome) {
    return homeWins ? player1Id : player2Id
  } else {
    return homeWins ? player2Id : player1Id
  }
}
```

- [ ] **Step 5: Run all game logic tests**

```bash
doppler run -- npx vitest run src/lib/game-logic/
```

Expected: All tests PASS (classic + turbo + escalating + cup).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game-logic/escalating.ts src/lib/game-logic/escalating.test.ts src/lib/game-logic/cup.ts src/lib/game-logic/cup.test.ts
git commit -m "feat: add escalating and cup mode game logic with tests"
```

---

## Task 9: Game Logic — Gameweeks & Prizes (TDD)

**Files:**
- Create: `src/lib/game-logic/gameweeks.ts`, `src/lib/game-logic/gameweeks.test.ts`, `src/lib/game-logic/prizes.ts`, `src/lib/game-logic/prizes.test.ts`

- [ ] **Step 1: Write failing tests for gameweek lifecycle**

Create `src/lib/game-logic/gameweeks.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { getGameweeksToActivate, isGameweekComplete } from "./gameweeks"
import type { Gameweek, Fixture } from "@/lib/types"

describe("getGameweeksToActivate", () => {
  it("returns gameweeks past their deadline", () => {
    const now = new Date("2025-08-20T12:00:00Z")
    const gameweeks: Gameweek[] = [
      { id: 1, name: "GW1", deadline: new Date("2025-08-16T10:00:00Z"), finished: false },
      { id: 2, name: "GW2", deadline: new Date("2025-08-23T10:00:00Z"), finished: false },
    ]
    const result = getGameweeksToActivate(gameweeks, now)
    expect(result).toEqual([1])
  })

  it("excludes already-finished gameweeks", () => {
    const now = new Date("2025-08-20T12:00:00Z")
    const gameweeks: Gameweek[] = [
      { id: 1, name: "GW1", deadline: new Date("2025-08-16T10:00:00Z"), finished: true },
    ]
    const result = getGameweeksToActivate(gameweeks, now)
    expect(result).toEqual([])
  })
})

describe("isGameweekComplete", () => {
  it("returns true when all fixtures finished", () => {
    const fixtures: Fixture[] = [
      { id: 1, gameweekId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, kickoff: null, started: true, finished: true },
      { id: 2, gameweekId: 1, homeTeamId: 3, awayTeamId: 4, homeScore: 0, awayScore: 0, kickoff: null, started: true, finished: true },
    ]
    expect(isGameweekComplete(fixtures)).toBe(true)
  })

  it("returns false when any fixture not finished", () => {
    const fixtures: Fixture[] = [
      { id: 1, gameweekId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1, kickoff: null, started: true, finished: true },
      { id: 2, gameweekId: 1, homeTeamId: 3, awayTeamId: 4, homeScore: null, awayScore: null, kickoff: null, started: false, finished: false },
    ]
    expect(isGameweekComplete(fixtures)).toBe(false)
  })

  it("returns false when no fixtures", () => {
    expect(isGameweekComplete([])).toBe(false)
  })
})
```

- [ ] **Step 2: Implement gameweek logic**

Create `src/lib/game-logic/gameweeks.ts`:

```typescript
import type { Gameweek, Fixture } from "@/lib/types"

export function getGameweeksToActivate(
  gameweeks: Gameweek[],
  now: Date
): number[] {
  return gameweeks
    .filter((gw) => !gw.finished && gw.deadline < now)
    .map((gw) => gw.id)
}

export function isGameweekComplete(fixtures: Fixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => f.finished)
}
```

- [ ] **Step 3: Write failing tests for prize calculation**

Create `src/lib/game-logic/prizes.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { calculatePrizePot, splitPrize } from "./prizes"

describe("calculatePrizePot", () => {
  it("calculates pot from entry fee x player count", () => {
    expect(calculatePrizePot("10", 8)).toBe(80)
  })

  it("returns 0 when no entry fee", () => {
    expect(calculatePrizePot(null, 8)).toBe(0)
  })
})

describe("splitPrize", () => {
  it("divides pot equally among winners", () => {
    expect(splitPrize(100, 2)).toBe(50)
  })

  it("returns full pot for single winner", () => {
    expect(splitPrize(100, 1)).toBe(100)
  })

  it("returns 0 when no winners", () => {
    expect(splitPrize(100, 0)).toBe(0)
  })
})
```

- [ ] **Step 4: Implement prize logic**

Create `src/lib/game-logic/prizes.ts`:

```typescript
/**
 * Calculate prize pot from entry fee and player count.
 * entryFee is a string because Drizzle maps numeric columns to string.
 */
export function calculatePrizePot(
  entryFee: string | null,
  playerCount: number
): number {
  if (!entryFee) return 0
  return parseFloat(entryFee) * playerCount
}

export function splitPrize(pot: number, winnerCount: number): number {
  if (winnerCount === 0) return 0
  return pot / winnerCount
}
```

- [ ] **Step 5: Run all tests**

```bash
doppler run -- npx vitest run src/lib/game-logic/
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game-logic/gameweeks.ts src/lib/game-logic/gameweeks.test.ts src/lib/game-logic/prizes.ts src/lib/game-logic/prizes.test.ts
git commit -m "feat: add gameweek lifecycle and prize calculation with tests"
```

---

## Task 10: Pick Validation (TDD)

**Files:**
- Create: `src/lib/picks/validation.ts`, `src/lib/picks/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/picks/validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { validateClassicPick } from "./validation"
import type { PlayerStatus } from "@/lib/types"

describe("validateClassicPick", () => {
  const baseContext = {
    gameweekDeadline: new Date("2025-08-30T10:00:00Z"),
    now: new Date("2025-08-29T12:00:00Z"),
    playerStatus: "alive" as PlayerStatus,
    previousTeamIds: [1, 5, 12],
  }

  it("allows valid pick before deadline", () => {
    const result = validateClassicPick({ teamId: 6, ...baseContext })
    expect(result).toEqual({ valid: true })
  })

  it("rejects pick after deadline", () => {
    const result = validateClassicPick({
      teamId: 6,
      ...baseContext,
      now: new Date("2025-08-30T11:00:00Z"),
    })
    expect(result).toEqual({ valid: false, reason: "Deadline has passed" })
  })

  it("rejects pick from eliminated player", () => {
    const result = validateClassicPick({
      teamId: 6,
      ...baseContext,
      playerStatus: "eliminated",
    })
    expect(result).toEqual({ valid: false, reason: "Player is eliminated" })
  })

  it("rejects pick reusing a previously picked team", () => {
    const result = validateClassicPick({
      teamId: 12,
      ...baseContext,
    })
    expect(result).toEqual({
      valid: false,
      reason: "Team already used in this game",
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
doppler run -- npx vitest run src/lib/picks/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pick validation**

Create `src/lib/picks/validation.ts`:

```typescript
import type { PlayerStatus } from "@/lib/types"

interface ClassicPickInput {
  teamId: number
  gameweekDeadline: Date
  now: Date
  playerStatus: PlayerStatus
  previousTeamIds: number[]
}

interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateClassicPick(
  input: ClassicPickInput
): ValidationResult {
  if (input.playerStatus === "eliminated") {
    return { valid: false, reason: "Player is eliminated" }
  }

  if (input.now >= input.gameweekDeadline) {
    return { valid: false, reason: "Deadline has passed" }
  }

  if (input.previousTeamIds.includes(input.teamId)) {
    return { valid: false, reason: "Team already used in this game" }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
doppler run -- npx vitest run src/lib/picks/validation.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/picks/validation.ts src/lib/picks/validation.test.ts
git commit -m "feat: add pick validation with tests"
```

---

## Task 11: FPL Client & Sync Logic

**Files:**
- Create: `src/lib/fpl/types.ts`, `src/lib/fpl/client.ts`, `src/lib/fpl/sync.ts`

Sync uses Drizzle upserts, not Supabase client.

- [ ] **Step 1: Create FPL API types**

Create `src/lib/fpl/types.ts`:

```typescript
export interface FPLBootstrapResponse {
  events: FPLEvent[]
  teams: FPLTeam[]
}

export interface FPLEvent {
  id: number
  name: string
  deadline_time: string
  finished: boolean
}

export interface FPLTeam {
  id: number
  name: string
  short_name: string
  code: number
}

export interface FPLFixture {
  id: number
  event: number
  finished: boolean
  kickoff_time: string
  started: boolean
  team_a: number
  team_a_score: number | null
  team_h: number
  team_h_score: number | null
}
```

- [ ] **Step 2: Create FPL API client**

Create `src/lib/fpl/client.ts`:

```typescript
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
```

- [ ] **Step 3: Create sync logic with Drizzle upserts**

Create `src/lib/fpl/sync.ts`:

```typescript
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

export async function syncGameweeks(
  events: FPLBootstrapResponse["events"]
) {
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
        kickoff: fixture.kickoff_time
          ? new Date(fixture.kickoff_time)
          : null,
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
          kickoff: fixture.kickoff_time
            ? new Date(fixture.kickoff_time)
            : null,
          started: fixture.started,
          finished: fixture.finished,
        },
      })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/fpl/
git commit -m "feat: add FPL API client and Drizzle sync logic"
```

---

## Task 12: Scores Provider Interface

**Files:**
- Create: `src/lib/scores/types.ts`, `src/lib/scores/provider.ts`

Provider TBD. Define the interface now, implement later.

- [ ] **Step 1: Create provider-agnostic interface**

Create `src/lib/scores/types.ts`:

```typescript
export interface ScoresProvider {
  fetchLiveScores(): Promise<LiveScore[]>
  fetchResults(gameweekId: number): Promise<MatchResult[]>
}

export interface LiveScore {
  fixtureId: number
  homeTeamId: number
  awayTeamId: number
  homeScore: number
  awayScore: number
  status: "scheduled" | "in_progress" | "finished"
  minute?: number
}

export interface MatchResult {
  fixtureId: number
  homeScore: number
  awayScore: number
  finished: boolean
}
```

- [ ] **Step 2: Create stub provider**

Create `src/lib/scores/provider.ts`:

```typescript
import type { ScoresProvider, LiveScore, MatchResult } from "./types"

/**
 * Stub provider — returns empty results.
 * Replace with a concrete implementation when a scores API is selected.
 * Candidates: football-data.org, API-Football, SportMonks.
 */
export const stubProvider: ScoresProvider = {
  async fetchLiveScores(): Promise<LiveScore[]> {
    console.warn("ScoresProvider: using stub — no live scores available")
    return []
  },
  async fetchResults(_gameweekId: number): Promise<MatchResult[]> {
    console.warn("ScoresProvider: using stub — no results available")
    return []
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scores/
git commit -m "feat: add scores provider interface with stub implementation"
```

---

## Task 13: API Routes — FPL Sync, Scores Poll, Game Processing

**Files:**
- Create: `src/app/api/fpl/sync/route.ts`, `src/app/api/scores/poll/route.ts`, `src/app/api/games/process/route.ts`, `vercel.json`

All cron routes authenticate via `CRON_SECRET` header. DB access via Drizzle. No Supabase service role key.

- [ ] **Step 1: Create FPL sync API route**

Create `src/app/api/fpl/sync/route.ts`:

```typescript
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
```

- [ ] **Step 2: Create scores poll API route**

Create `src/app/api/scores/poll/route.ts`:

```typescript
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Implement when scores provider is selected.
  // Will: fetch live scores, update fixtures table, mark finished.
  return NextResponse.json({
    success: true,
    message: "Scores provider not configured",
  })
}
```

- [ ] **Step 3: Create game processing API route**

Create `src/app/api/games/process/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  gameweeks,
  fixtures,
  games,
  gamePlayers,
  gameGameweeks,
  picks,
  gameWinners,
} from "@/lib/schema/domain"
import {
  getGameweeksToActivate,
  isGameweekComplete,
} from "@/lib/game-logic/gameweeks"
import {
  evaluateClassicPicks,
  determineClassicWinner,
} from "@/lib/game-logic/classic"
import { scoreTurboPicks } from "@/lib/game-logic/turbo"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // 1. Activate gameweeks past deadline
    const allGameweeks = await db.select().from(gameweeks)
    const toActivate = getGameweeksToActivate(allGameweeks, new Date())

    for (const gwId of toActivate) {
      await db
        .update(gameGameweeks)
        .set({ status: "active" })
        .where(
          and(
            eq(gameGameweeks.gameweekId, gwId),
            eq(gameGameweeks.status, "pending")
          )
        )
    }

    // 2. Check complete gameweeks and process games
    const activeGameGws = await db
      .select()
      .from(gameGameweeks)
      .where(eq(gameGameweeks.status, "active"))

    for (const ggw of activeGameGws) {
      const gwFixtures = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.gameweekId, ggw.gameweekId))

      if (!isGameweekComplete(gwFixtures)) continue

      // Mark gameweek complete
      await db
        .update(gameGameweeks)
        .set({ status: "complete" })
        .where(eq(gameGameweeks.id, ggw.id))

      // Get game
      const [game] = await db
        .select()
        .from(games)
        .where(eq(games.id, ggw.gameId))

      if (!game) continue

      // Get picks for this game+gameweek
      const gwPicks = await db
        .select()
        .from(picks)
        .where(
          and(
            eq(picks.gameId, game.id),
            eq(picks.gameweekId, ggw.gameweekId)
          )
        )

      if (game.mode === "classic" || game.mode === "escalating") {
        const evaluated = evaluateClassicPicks(gwPicks, gwFixtures)

        for (const pick of evaluated) {
          await db
            .update(picks)
            .set({ result: pick.result })
            .where(eq(picks.id, pick.id))

          if (pick.result === "lost") {
            await db
              .update(gamePlayers)
              .set({
                status: "eliminated",
                eliminatedAtGameweek: ggw.gameweekId,
              })
              .where(
                and(
                  eq(gamePlayers.gameId, game.id),
                  eq(gamePlayers.playerId, pick.playerId)
                )
              )
          }
        }

        // Check for winner
        const players = await db
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, game.id))

        const winnerResult = determineClassicWinner(players)
        if (winnerResult) {
          await db
            .update(games)
            .set({ status: "finished" })
            .where(eq(games.id, game.id))

          for (const winnerId of winnerResult.winners) {
            await db.insert(gameWinners).values({
              gameId: game.id,
              playerId: winnerId,
              isSplit: winnerResult.isSplit,
            })
          }
        }
      }

      if (game.mode === "turbo") {
        const scored = scoreTurboPicks(gwPicks, gwFixtures)
        for (const pick of scored) {
          await db
            .update(picks)
            .set({ result: pick.result })
            .where(eq(picks.id, pick.id))
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Game processing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Create `vercel.json`**

Create `vercel.json`:

```json
{
  "regions": ["lhr1"],
  "crons": [
    {
      "path": "/api/fpl/sync",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/scores/poll",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/games/process",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Note: Using 5-minute intervals for scores/poll (compatible with Hobby plan). Increase frequency on Pro plan if needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fpl/ src/app/api/scores/ src/app/api/games/ vercel.json
git commit -m "feat: add cron API routes for FPL sync, scores, and game processing"
```

---

## Task 14: Pick Submission API Route

**Files:**
- Create: `src/app/api/picks/route.ts`

Uses Better Auth for session, Drizzle for queries.

- [ ] **Step 1: Create pick submission route**

Create `src/app/api/picks/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { gamePlayers, gameweeks, picks } from "@/lib/schema/domain"
import { validateClassicPick } from "@/lib/picks/validation"
import type { PlayerStatus } from "@/lib/types"

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const {
    gameId,
    gameweekId,
    teamId,
    fixtureId,
    mode,
    prediction,
    stake,
  } = body

  // Check player is alive in this game
  const [gamePlayer] = await db
    .select()
    .from(gamePlayers)
    .where(
      and(
        eq(gamePlayers.gameId, gameId),
        eq(gamePlayers.playerId, session.user.id)
      )
    )

  if (!gamePlayer) {
    return NextResponse.json(
      { error: "Not a player in this game" },
      { status: 403 }
    )
  }

  // Get gameweek deadline
  const [gameweek] = await db
    .select()
    .from(gameweeks)
    .where(eq(gameweeks.id, gameweekId))

  if (!gameweek) {
    return NextResponse.json(
      { error: "Gameweek not found" },
      { status: 404 }
    )
  }

  // Validate for classic/escalating modes
  if (mode === "classic" || mode === "escalating") {
    const previousPicks = await db
      .select({ teamId: picks.teamId })
      .from(picks)
      .where(
        and(
          eq(picks.gameId, gameId),
          eq(picks.playerId, session.user.id)
        )
      )

    const validation = validateClassicPick({
      teamId,
      gameweekDeadline: gameweek.deadline,
      now: new Date(),
      playerStatus: gamePlayer.status as PlayerStatus,
      previousTeamIds: previousPicks.map((p) => p.teamId),
    })

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400 }
      )
    }
  }

  // Insert pick
  try {
    const [pick] = await db
      .insert(picks)
      .values({
        gameId,
        playerId: session.user.id,
        gameweekId,
        teamId,
        fixtureId: fixtureId ?? null,
        mode,
        prediction: prediction ?? null,
        stake: stake ?? null,
      })
      .returning()

    return NextResponse.json(pick)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to submit pick",
      },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/picks/route.ts
git commit -m "feat: add pick submission API route with validation"
```

---

## Task 15: App Shell — Root Layout, Providers, Theme

**Files:**
- Create: `src/components/providers.tsx`
- Modify: `src/app/layout.tsx`

The `globals.css` already has the shadcn dark theme configured. Geist fonts are already imported in the layout. We need to add providers (ThemeProvider, Toaster) and update metadata.

- [ ] **Step 1: Create client-side providers**

Create `src/components/providers.tsx`:

```tsx
"use client"

import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Update root layout**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Last Person Standing",
  description: "Premier League survivor picks game",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify dev server starts**

```bash
doppler run -- npm run dev
```

Expected: Dark background, no console errors. Page says "Last Person Standing".

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/components/providers.tsx
git commit -m "feat: add app shell with dark theme, providers, updated metadata"
```

---

## Task 16: Auth Pages — Login & Signup

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`

Uses Better Auth client (`signIn.email`, `signUp.email`), not Supabase Auth.

- [ ] **Step 1: Create auth layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await signIn.email({ email, password })

    if (result.error) {
      setError(result.error.message ?? "Login failed")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Log in</CardTitle>
        <CardDescription>Enter your credentials to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signUp } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function SignupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await signUp.email({ name, email, password })

    if (result.error) {
      setError(result.error.message ?? "Signup failed")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Sign up</CardTitle>
        <CardDescription>Create your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Verify pages render**

```bash
doppler run -- npm run dev
```

Navigate to `http://localhost:3000/login` and `http://localhost:3000/signup`. Expected: Both pages render with forms, dark theme, shadcn cards.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/"
git commit -m "feat: add login and signup pages with Better Auth"
```

---

## Task 17: Authenticated Layout & Navigation

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/features/navigation/navbar.tsx`, `src/components/features/navigation/user-menu.tsx`

Uses `requireSession()` from auth helpers. Queries user name from the Better Auth `user` table via Drizzle.

- [ ] **Step 1: Create user menu component**

Create `src/components/features/navigation/user-menu.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut } from "lucide-react"

export function UserMenu({ displayName }: { displayName: string }) {
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Create navbar**

Create `src/components/features/navigation/navbar.tsx`:

```tsx
import Link from "next/link"
import { UserMenu } from "./user-menu"

export function Navbar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Last Person Standing
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/games"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Games
          </Link>
          <UserMenu displayName={displayName} />
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create authenticated layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { requireSession } from "@/lib/auth-helpers"
import { Navbar } from "@/components/features/navigation/navbar"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  return (
    <>
      <Navbar displayName={session.user.name ?? session.user.email} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  )
}
```

- [ ] **Step 4: Create placeholder home page**

Create `src/app/(app)/page.tsx`:

```tsx
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { gamePlayers, games } from "@/lib/schema/domain"

export default async function HomePage() {
  const session = await requireSession()

  const myGames = await db
    .select({
      gameId: gamePlayers.gameId,
      gameName: games.name,
      gameMode: games.mode,
      gameStatus: games.status,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(eq(gamePlayers.playerId, session.user.id))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Home</h1>
      <p className="text-muted-foreground">
        {myGames.length > 0
          ? `You're in ${myGames.length} game${myGames.length === 1 ? "" : "s"}.`
          : "You haven't joined any games yet."}
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Remove the old placeholder page**

Delete the existing `src/app/page.tsx` (the one at root that says "Last Person Standing"). The `(app)/page.tsx` now serves as the home page for authenticated users.

Replace `src/app/page.tsx` with a redirect to the app:

```tsx
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-helpers"

export default async function RootPage() {
  const session = await getSession()
  if (session) redirect("/")
  redirect("/login")
}
```

Wait — this creates a redirect loop since `(app)/page.tsx` also matches `/`. The `(app)` route group doesn't add a URL segment, so `(app)/page.tsx` IS the `/` route. Delete `src/app/page.tsx` entirely — the `(app)/page.tsx` handles it.

Actually, both `src/app/page.tsx` and `src/app/(app)/page.tsx` would conflict on the `/` route. Delete `src/app/page.tsx`.

```bash
rm src/app/page.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/ src/components/features/navigation/
git rm src/app/page.tsx
git commit -m "feat: add authenticated layout with navbar and home page"
```

---

## Task 18: Games List & Create Pages

**Files:**
- Create: `src/app/(app)/games/page.tsx`, `src/app/(app)/games/new/page.tsx`, `src/components/features/games/game-card.tsx`, `src/components/features/games/game-list.tsx`, `src/components/features/games/create-game-form.tsx`

- [ ] **Step 1: Create game card component**

Create `src/components/features/games/game-card.tsx`:

```tsx
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GameMode, GameStatus } from "@/lib/types"

interface GameCardProps {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  playerCount: number
}

const modeLabels: Record<GameMode, string> = {
  classic: "Classic",
  turbo: "Turbo",
  cup: "Cup",
  escalating: "Escalating",
}

const statusVariants: Record<GameStatus, "default" | "secondary" | "outline"> =
  {
    open: "default",
    active: "secondary",
    finished: "outline",
  }

export function GameCard({
  id,
  name,
  mode,
  status,
  playerCount,
}: GameCardProps) {
  return (
    <Link href={`/games/${id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge variant={statusVariants[status]}>{status}</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="outline">{modeLabels[mode]}</Badge>
            <span>
              {playerCount} player{playerCount !== 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: Create game list component**

Create `src/components/features/games/game-list.tsx`:

```tsx
import { GameCard } from "./game-card"
import type { GameMode, GameStatus } from "@/lib/types"

interface GameWithCount {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  playerCount: number
}

export function GameList({ games }: { games: GameWithCount[] }) {
  if (games.length === 0) {
    return <p className="text-muted-foreground">No games found.</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {games.map((game) => (
        <GameCard key={game.id} {...game} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create games list page**

Create `src/app/(app)/games/page.tsx`:

```tsx
import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { GameList } from "@/components/features/games/game-list"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { GameMode, GameStatus } from "@/lib/types"

export default async function GamesPage() {
  await requireSession()

  const gamesWithCount = await db
    .select({
      id: games.id,
      name: games.name,
      mode: games.mode,
      status: games.status,
      playerCount: sql<number>`count(${gamePlayers.id})::int`,
    })
    .from(games)
    .leftJoin(gamePlayers, eq(games.id, gamePlayers.gameId))
    .groupBy(games.id)
    .orderBy(desc(games.createdAt))

  const formatted = gamesWithCount.map((g) => ({
    id: g.id,
    name: g.name,
    mode: g.mode as GameMode,
    status: g.status as GameStatus,
    playerCount: g.playerCount ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Games</h1>
        <Button asChild>
          <Link href="/games/new">
            <Plus className="mr-2 h-4 w-4" />
            New game
          </Link>
        </Button>
      </div>
      <GameList games={formatted} />
    </div>
  )
}
```

- [ ] **Step 4: Create the create-game form**

Create `src/components/features/games/create-game-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { GameMode } from "@/lib/types"

const modes: { value: GameMode; label: string; description: string }[] = [
  {
    value: "classic",
    label: "Classic",
    description: "Pick a team each week. If they lose, you're out.",
  },
  {
    value: "turbo",
    label: "Turbo",
    description: "Predict results for every fixture. Most points wins.",
  },
  {
    value: "cup",
    label: "Cup",
    description: "Head-to-head knockout bracket.",
  },
  {
    value: "escalating",
    label: "Escalating",
    description: "Classic rules with increasing stakes.",
  },
]

export function CreateGameForm({
  gameweeks,
}: {
  gameweeks: { id: number; name: string }[]
}) {
  const [name, setName] = useState("")
  const [mode, setMode] = useState<GameMode>("classic")
  const [entryFee, setEntryFee] = useState("")
  const [startingGameweek, setStartingGameweek] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mode,
        entryFee: entryFee || null,
        startingGameweek: startingGameweek
          ? parseInt(startingGameweek)
          : null,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create game")
      setLoading(false)
      return
    }

    const game = await res.json()
    router.push(`/games/${game.id}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a new game</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Game name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as GameMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {modes.find((m) => m.value === mode)?.description}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fee">Entry fee (optional)</Label>
            <Input
              id="fee"
              type="number"
              step="0.01"
              min="0"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Starting gameweek</Label>
            <Select
              value={startingGameweek}
              onValueChange={setStartingGameweek}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select gameweek" />
              </SelectTrigger>
              <SelectContent>
                {gameweeks.map((gw) => (
                  <SelectItem key={gw.id} value={String(gw.id)}>
                    {gw.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create game"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Create the game creation API route**

Create `src/app/api/games/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { name, mode, entryFee, startingGameweek } = await request.json()

  const [game] = await db
    .insert(games)
    .values({
      name,
      mode,
      createdBy: session.user.id,
      entryFee: entryFee ?? null,
      startingGameweek: startingGameweek ?? null,
    })
    .returning()

  // Auto-join creator as first player
  await db.insert(gamePlayers).values({
    gameId: game.id,
    playerId: session.user.id,
  })

  return NextResponse.json(game)
}
```

- [ ] **Step 6: Create new game page**

Create `src/app/(app)/games/new/page.tsx`:

```tsx
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { gameweeks } from "@/lib/schema/domain"
import { CreateGameForm } from "@/components/features/games/create-game-form"

export default async function NewGamePage() {
  await requireSession()

  const futureGameweeks = await db
    .select({ id: gameweeks.id, name: gameweeks.name })
    .from(gameweeks)
    .where(eq(gameweeks.finished, false))
    .orderBy(gameweeks.id)

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">New game</h1>
      <CreateGameForm gameweeks={futureGameweeks} />
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/games/" src/app/api/games/route.ts src/components/features/games/
git commit -m "feat: add games list, create game form, and game creation API"
```

---

## Task 19: Game Detail Page

**Files:**
- Create: `src/app/(app)/games/[id]/page.tsx`, `src/components/features/games/join-game-button.tsx`, `src/components/features/leaderboard/leaderboard.tsx`

- [ ] **Step 1: Create join game button**

Create `src/components/features/games/join-game-button.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function JoinGameButton({ gameId }: { gameId: string }) {
  const router = useRouter()

  async function handleJoin() {
    const res = await fetch(`/api/games/${gameId}/join`, { method: "POST" })
    if (!res.ok) {
      toast.error("Failed to join game")
      return
    }
    toast.success("Joined game!")
    router.refresh()
  }

  return <Button onClick={handleJoin}>Join game</Button>
}
```

- [ ] **Step 2: Create join game API route**

Create `src/app/api/games/[id]/join/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { gamePlayers } from "@/lib/schema/domain"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await db.insert(gamePlayers).values({
      gameId: id,
      playerId: session.user.id,
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Already in this game" },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 3: Create adaptive leaderboard**

Create `src/components/features/leaderboard/leaderboard.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { GameMode, PlayerStatus } from "@/lib/types"

interface LeaderboardEntry {
  playerId: string
  displayName: string
  status: PlayerStatus
  eliminatedAt?: number | null
  points?: number
}

const statusColors: Record<PlayerStatus, string> = {
  alive: "text-green-500",
  eliminated: "text-red-500",
  winner: "text-amber-500",
}

export function Leaderboard({
  entries,
  mode,
}: {
  entries: LeaderboardEntry[]
  mode: GameMode
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          {mode === "turbo" && (
            <TableHead className="text-right font-mono">Points</TableHead>
          )}
          {(mode === "classic" || mode === "escalating") && (
            <TableHead>Eliminated</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.playerId}>
            <TableCell className="font-medium">
              {entry.displayName}
            </TableCell>
            <TableCell>
              <span className={statusColors[entry.status]}>
                {entry.status}
              </span>
            </TableCell>
            {mode === "turbo" && (
              <TableCell className="text-right font-mono">
                {entry.points ?? 0}
              </TableCell>
            )}
            {(mode === "classic" || mode === "escalating") && (
              <TableCell className="font-mono text-muted-foreground">
                {entry.eliminatedAt ? `GW${entry.eliminatedAt}` : "\u2014"}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 4: Create game detail page**

Create `src/app/(app)/games/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { Leaderboard } from "@/components/features/leaderboard/leaderboard"
import { JoinGameButton } from "@/components/features/games/join-game-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { GameMode, PlayerStatus } from "@/lib/types"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()

  const players = await db
    .select({
      playerId: gamePlayers.playerId,
      status: gamePlayers.status,
      eliminatedAtGameweek: gamePlayers.eliminatedAtGameweek,
      displayName: user.name,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const isPlayer = players.some((p) => p.playerId === session.user.id)
  const isCreator = game.createdBy === session.user.id

  const leaderboardEntries = players.map((p) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    status: p.status as PlayerStatus,
    eliminatedAt: p.eliminatedAtGameweek,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{game.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline">{game.mode}</Badge>
            <Badge variant="secondary">{game.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {!isPlayer && game.status === "open" && (
            <JoinGameButton gameId={id} />
          )}
          {isPlayer && game.status !== "finished" && (
            <Button asChild>
              <Link href={`/pick/${id}/${game.mode}`}>Make pick</Link>
            </Button>
          )}
          {isCreator && (
            <Button variant="outline" asChild>
              <Link href={`/games/${id}/admin`}>Admin</Link>
            </Button>
          )}
        </div>
      </div>

      <Leaderboard
        entries={leaderboardEntries}
        mode={game.mode as GameMode}
      />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/games/[id]/" src/app/api/games/\[id\]/ src/components/features/games/join-game-button.tsx src/components/features/leaderboard/
git commit -m "feat: add game detail page with leaderboard and join button"
```

---

## Task 20: Unified Pick Page

**Files:**
- Create: `src/app/(app)/pick/[gameId]/[mode]/page.tsx`, `src/components/features/picks/pick-selector.tsx`, `src/components/features/picks/fixture-row.tsx`, `src/components/features/picks/team-badge.tsx`

- [ ] **Step 1: Create team badge component**

Create `src/components/features/picks/team-badge.tsx`:

```tsx
export function TeamBadge({ shortName }: { shortName: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{shortName}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create fixture row component**

Create `src/components/features/picks/fixture-row.tsx`:

```tsx
"use client"

import { TeamBadge } from "./team-badge"
import { cn } from "@/lib/utils"

interface FixtureRowProps {
  fixtureId: number
  homeTeam: { id: number; shortName: string }
  awayTeam: { id: number; shortName: string }
  homeScore: number | null
  awayScore: number | null
  kickoff: Date | null
  selectedTeamId?: number
  onSelectTeam?: (teamId: number, fixtureId: number) => void
  disabled?: boolean
}

export function FixtureRow({
  fixtureId,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  kickoff,
  selectedTeamId,
  onSelectTeam,
  disabled,
}: FixtureRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTeam?.(homeTeam.id, fixtureId)}
        className={cn(
          "flex-1 rounded-md p-2 text-left transition-colors",
          selectedTeamId === homeTeam.id
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <TeamBadge shortName={homeTeam.shortName} />
      </button>

      <div className="flex min-w-[4rem] flex-col items-center font-mono text-sm">
        {homeScore !== null && awayScore !== null ? (
          <span>
            {homeScore} - {awayScore}
          </span>
        ) : kickoff ? (
          <span className="text-muted-foreground">
            {kickoff.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">TBD</span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTeam?.(awayTeam.id, fixtureId)}
        className={cn(
          "flex-1 rounded-md p-2 text-right transition-colors",
          selectedTeamId === awayTeam.id
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <TeamBadge shortName={awayTeam.shortName} />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create pick selector component**

Create `src/components/features/picks/pick-selector.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FixtureRow } from "./fixture-row"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { GameMode } from "@/lib/types"

interface FixtureData {
  id: number
  homeTeam: { id: number; shortName: string }
  awayTeam: { id: number; shortName: string }
  homeScore: number | null
  awayScore: number | null
  kickoff: Date | null
  started: boolean
}

interface PickSelectorProps {
  gameId: string
  gameweekId: number
  mode: GameMode
  fixtures: FixtureData[]
  previousTeamIds: number[]
}

export function PickSelector({
  gameId,
  gameweekId,
  mode,
  fixtures,
  previousTeamIds,
}: PickSelectorProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function handleSelectTeam(teamId: number, fixtureId: number) {
    if (mode === "classic" && previousTeamIds.includes(teamId)) {
      toast.error("You already used this team")
      return
    }
    setSelectedTeamId(teamId)
    setSelectedFixtureId(fixtureId)
  }

  async function handleSubmit() {
    if (!selectedTeamId || !selectedFixtureId) return
    setLoading(true)

    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        gameweekId,
        teamId: selectedTeamId,
        fixtureId: selectedFixtureId,
        mode,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error || "Failed to submit pick")
      setLoading(false)
      return
    }

    toast.success("Pick submitted!")
    router.push(`/games/${gameId}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {fixtures.map((fixture) => (
        <FixtureRow
          key={fixture.id}
          fixtureId={fixture.id}
          homeTeam={fixture.homeTeam}
          awayTeam={fixture.awayTeam}
          homeScore={fixture.homeScore}
          awayScore={fixture.awayScore}
          kickoff={fixture.kickoff}
          selectedTeamId={
            selectedFixtureId === fixture.id
              ? (selectedTeamId ?? undefined)
              : undefined
          }
          onSelectTeam={handleSelectTeam}
          disabled={fixture.started}
        />
      ))}
      <Button
        onClick={handleSubmit}
        disabled={!selectedTeamId || loading}
        className="w-full"
      >
        {loading ? "Submitting..." : "Submit pick"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Create unified pick page**

Create `src/app/(app)/pick/[gameId]/[mode]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { eq, and } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import {
  games,
  gameGameweeks,
  fixtures,
  teams,
  picks,
} from "@/lib/schema/domain"
import { PickSelector } from "@/components/features/picks/pick-selector"
import type { GameMode } from "@/lib/types"

export default async function PickPage({
  params,
}: {
  params: Promise<{ gameId: string; mode: string }>
}) {
  const { gameId, mode } = await params
  const session = await requireSession()

  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))

  if (!game || game.mode !== mode) notFound()

  // Get active gameweek for this game
  const [activeGw] = await db
    .select()
    .from(gameGameweeks)
    .where(
      and(
        eq(gameGameweeks.gameId, gameId),
        eq(gameGameweeks.status, "active")
      )
    )

  if (!activeGw) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Make your pick</h1>
        <p className="text-muted-foreground">
          No active gameweek — picks aren&apos;t open yet.
        </p>
      </div>
    )
  }

  // Fetch fixtures with team data
  const homeTeams = db
    .select({ id: teams.id, shortName: teams.shortName })
    .from(teams)
    .as("home_teams")

  const awayTeams = db
    .select({ id: teams.id, shortName: teams.shortName })
    .from(teams)
    .as("away_teams")

  const gwFixtures = await db
    .select({
      id: fixtures.id,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      kickoff: fixtures.kickoff,
      started: fixtures.started,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
    })
    .from(fixtures)
    .where(eq(fixtures.gameweekId, activeGw.gameweekId))
    .orderBy(fixtures.kickoff)

  // Get team names for the fixtures
  const teamIds = [
    ...new Set(gwFixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
  ]
  const teamRows =
    teamIds.length > 0
      ? await db.select().from(teams)
      : []
  const teamMap = new Map(teamRows.map((t) => [t.id, t]))

  const fixtureData = gwFixtures.map((f) => ({
    id: f.id,
    homeTeam: {
      id: f.homeTeamId,
      shortName: teamMap.get(f.homeTeamId)?.shortName ?? "???",
    },
    awayTeam: {
      id: f.awayTeamId,
      shortName: teamMap.get(f.awayTeamId)?.shortName ?? "???",
    },
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    kickoff: f.kickoff,
    started: f.started,
  }))

  // Get previous team picks for classic mode
  const previousPicks = await db
    .select({ teamId: picks.teamId })
    .from(picks)
    .where(
      and(eq(picks.gameId, gameId), eq(picks.playerId, session.user.id))
    )

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Make your pick</h1>
      <p className="text-muted-foreground">
        Select a team for Gameweek {activeGw.gameweekId}
      </p>
      <PickSelector
        gameId={gameId}
        gameweekId={activeGw.gameweekId}
        mode={mode as GameMode}
        fixtures={fixtureData}
        previousTeamIds={previousPicks.map((p) => p.teamId)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pick/" src/components/features/picks/
git commit -m "feat: add unified pick page with fixture selection"
```

---

## Task 21: Game Progress & Admin Pages

**Files:**
- Create: `src/app/(app)/games/[id]/progress/page.tsx`, `src/app/(app)/games/[id]/admin/page.tsx`, `src/components/features/progress/elimination-grid.tsx`, `src/components/features/admin/player-management.tsx`

- [ ] **Step 1: Create elimination grid**

Create `src/components/features/progress/elimination-grid.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface PlayerProgress {
  displayName: string
  picks: {
    gameweekId: number
    teamShortName: string
    result: string | null
  }[]
  status: string
}

export function EliminationGrid({
  players,
  gameweekIds,
}: {
  players: PlayerProgress[]
  gameweekIds: number[]
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">
              Player
            </TableHead>
            {gameweekIds.map((gw) => (
              <TableHead key={gw} className="text-center font-mono">
                GW{gw}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => (
            <TableRow key={player.displayName}>
              <TableCell className="sticky left-0 bg-background font-medium">
                {player.displayName}
              </TableCell>
              {gameweekIds.map((gwId) => {
                const pick = player.picks.find(
                  (p) => p.gameweekId === gwId
                )
                return (
                  <TableCell
                    key={gwId}
                    className={cn(
                      "text-center font-mono text-sm",
                      pick?.result === "won" && "text-green-500",
                      pick?.result === "lost" && "text-red-500"
                    )}
                  >
                    {pick?.teamShortName ?? "\u2014"}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Create progress page**

Create `src/app/(app)/games/[id]/progress/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers, picks, teams } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { EliminationGrid } from "@/components/features/progress/elimination-grid"

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()

  const players = await db
    .select({
      playerId: gamePlayers.playerId,
      status: gamePlayers.status,
      displayName: user.name,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const allPicks = await db
    .select({
      playerId: picks.playerId,
      gameweekId: picks.gameweekId,
      result: picks.result,
      teamShortName: teams.shortName,
    })
    .from(picks)
    .innerJoin(teams, eq(picks.teamId, teams.id))
    .where(eq(picks.gameId, id))
    .orderBy(picks.gameweekId)

  const gameweekIds = [
    ...new Set(allPicks.map((p) => p.gameweekId)),
  ].sort((a, b) => a - b)

  const playerProgress = players.map((p) => ({
    displayName: p.displayName,
    status: p.status,
    picks: allPicks
      .filter((pick) => pick.playerId === p.playerId)
      .map((pick) => ({
        gameweekId: pick.gameweekId,
        teamShortName: pick.teamShortName,
        result: pick.result,
      })),
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {game.name} — Progress
      </h1>
      <EliminationGrid players={playerProgress} gameweekIds={gameweekIds} />
    </div>
  )
}
```

- [ ] **Step 3: Create player management component**

Create `src/components/features/admin/player-management.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { PlayerStatus } from "@/lib/types"

interface Player {
  id: string
  playerId: string
  displayName: string
  status: PlayerStatus
}

export function PlayerManagement({
  players,
  gameId,
}: {
  players: Player[]
  gameId: string
}) {
  const router = useRouter()

  async function handleRemove(playerId: string) {
    const res = await fetch(`/api/games/${gameId}/players/${playerId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      toast.error("Failed to remove player")
      return
    }
    toast.success("Player removed")
    router.refresh()
  }

  async function handleToggleElimination(
    playerId: string,
    currentStatus: PlayerStatus
  ) {
    const newStatus =
      currentStatus === "eliminated" ? "alive" : "eliminated"
    const res = await fetch(`/api/games/${gameId}/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      toast.error("Failed to update player")
      return
    }
    toast.success(
      `Player ${newStatus === "eliminated" ? "eliminated" : "reinstated"}`
    )
    router.refresh()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {players.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.displayName}</TableCell>
            <TableCell>{p.status}</TableCell>
            <TableCell className="space-x-2 text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleToggleElimination(p.playerId, p.status)
                }
              >
                {p.status === "eliminated" ? "Reinstate" : "Eliminate"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleRemove(p.playerId)}
              >
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 4: Create admin player management API route**

Create `src/app/api/games/[id]/players/[playerId]/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"

async function verifyCreator(request: Request, gameId: string) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null

  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))

  if (!game || game.createdBy !== session.user.id) return null
  return session
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  if (!(await verifyCreator(request, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await db
    .delete(gamePlayers)
    .where(
      and(eq(gamePlayers.gameId, id), eq(gamePlayers.playerId, playerId))
    )

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params
  if (!(await verifyCreator(request, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { status } = await request.json()

  await db
    .update(gamePlayers)
    .set({
      status,
      eliminatedAtGameweek: status === "alive" ? null : undefined,
    })
    .where(
      and(eq(gamePlayers.gameId, id), eq(gamePlayers.playerId, playerId))
    )

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Create admin page**

Create `src/app/(app)/games/[id]/admin/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers } from "@/lib/schema/domain"
import { user } from "@/lib/schema/auth"
import { PlayerManagement } from "@/components/features/admin/player-management"
import type { PlayerStatus } from "@/lib/types"

export default async function AdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const [game] = await db.select().from(games).where(eq(games.id, id))
  if (!game) notFound()
  if (game.createdBy !== session.user.id) redirect(`/games/${id}`)

  const players = await db
    .select({
      id: gamePlayers.id,
      playerId: gamePlayers.playerId,
      status: gamePlayers.status,
      displayName: user.name,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(gamePlayers.playerId, user.id))
    .where(eq(gamePlayers.gameId, id))

  const formatted = players.map((p) => ({
    id: p.id,
    playerId: p.playerId,
    displayName: p.displayName,
    status: p.status as PlayerStatus,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {game.name} — Admin
      </h1>
      <PlayerManagement players={formatted} gameId={id} />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/games/[id]/" src/app/api/games/\[id\]/players/ src/components/features/progress/ src/components/features/admin/
git commit -m "feat: add game progress, admin pages, and player management API"
```

---

## Task 22: Deployment Config & CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

No Supabase CLI — we use Drizzle migrations. CI runs lint, typecheck, tests, and build. Drizzle migrations are applied via `npm run db:migrate` in deployment (or manually).

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm run test:run

      - name: Build
        run: npm run build
        env:
          DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder"
          BETTER_AUTH_SECRET: "ci-placeholder-secret"
          NEXT_PUBLIC_APP_URL: "http://localhost:3000"
```

- [ ] **Step 2: Verify build succeeds locally**

```bash
doppler run -- npm run build
```

Expected: Build completes. Fix any TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "feat: add CI workflow for lint, typecheck, test, and build"
```

---

## Task 23: Data Migration Script

**Files:**
- Create: `scripts/migrate-data.ts`

One-time script to move data from old Supabase project to new Neon database. Skeleton for now — implement when both databases are ready.

- [ ] **Step 1: Create data migration script skeleton**

Create `scripts/migrate-data.ts`:

```typescript
/**
 * One-time data migration from old Supabase project to new Neon database.
 *
 * Usage:
 *   doppler run -- npx tsx scripts/migrate-data.ts
 *
 * Requires env vars:
 *   OLD_DATABASE_URL — direct Postgres connection to old Supabase project
 *   DATABASE_URL — connection to new Neon database
 *
 * Steps:
 *   1. Export profiles (old auth.users → new Better Auth user table)
 *   2. Export teams, gameweeks, fixtures
 *   3. Export games, game_players, game_gameweeks, game_winners
 *   4. Export and merge picks → unified picks table with mode discriminator
 *   5. Export cup_fixtures
 *   6. Verify row counts
 *
 * Key mappings from old to new schema:
 *   - user_id (uuid, FK → auth.users) → playerId (text, FK → user.id)
 *   - profile.id (uuid) → user.id (text, Better Auth generates IDs)
 *   - gameweek (int) → gameweekId (int, FK → gameweeks)
 *   - is_eliminated boolean → status enum ('alive'|'eliminated'|'winner')
 *   - Supabase RLS → TypeScript authorization
 *   - snake_case columns → camelCase Drizzle properties
 *
 * IMPORTANT: Better Auth generates its own user IDs (text, not uuid).
 * The migration needs to either:
 *   a) Pre-create Better Auth users with matching IDs, or
 *   b) Create a mapping table from old UUIDs to new text IDs
 */

console.log("Data migration script — implement when both databases are ready")
console.log(
  "See design spec: docs/superpowers/specs/2026-03-19-last-person-standing-migration-design.md"
)
```

- [ ] **Step 2: Commit**

```bash
git add scripts/
git commit -m "feat: add data migration script skeleton"
```

---

## Task 24: CLAUDE.md Update

**Files:**
- Modify: `CLAUDE.md`

Update the project CLAUDE.md with all conventions, patterns, and key files introduced in this implementation phase.

- [ ] **Step 1: Update CLAUDE.md**

The existing CLAUDE.md already covers the stack pivot. Update it to include new file structure and conventions from this phase. Add to the Key Conventions section:

- Auth helpers: `getSession()` (cached), `requireSession()` (redirects) in `src/lib/auth-helpers.ts`
- Types: inferred from Drizzle schema in `src/lib/types.ts` — use `Pick`, `Fixture`, `Game` etc., not hand-written interfaces
- Game logic: pure functions in `src/lib/game-logic/`, tested with vitest, no DB dependencies
- API routes: cron routes use `CRON_SECRET` header, user routes use Better Auth session
- Pages: `(auth)` group for login/signup, `(app)` group for authenticated pages
- DB queries: Drizzle query builder in page/route files, not a separate queries layer
- `proxy.ts` handles route protection (redirect unauthenticated users to `/login`)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with implementation conventions"
```

---

## Task 25: Final Verification

- [ ] **Step 1: Run all tests**

```bash
doppler run -- npx vitest run
```

Expected: All game logic and validation tests pass.

- [ ] **Step 2: Run type check**

```bash
doppler run -- npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No lint errors.

- [ ] **Step 4: Build succeeds**

```bash
doppler run -- npm run build
```

Expected: Build completes without errors.

- [ ] **Step 5: Manual smoke test**

```bash
docker compose up -d
doppler run -- npm run db:push
doppler run -- npm run db:seed
doppler run -- npm run dev
```

Expected: Dev server starts. Navigate to:
- `/login` — login form renders
- `/signup` — signup form renders
- Sign up a test user → redirects to home
- `/games` — empty games list
- `/games/new` — create game form with gameweek dropdown
- Create a game → redirects to game detail
- Game detail shows leaderboard with one player

- [ ] **Step 6: Fix any issues found, commit**

If any issues found in steps 1-5, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve build/lint/type errors from final verification"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Scaffold Next.js 16 project | DONE |
| 2 | Dependencies, Vitest, shadcn/ui | DONE |
| 3 | Database & auth foundation (Neon + Drizzle + Better Auth) | DONE |
| 4 | Domain types (Drizzle inferred) | TODO |
| 5 | Auth helpers & proxy | TODO |
| 6 | Classic mode game logic (TDD) | TODO |
| 7 | Turbo mode game logic (TDD) | TODO |
| 8 | Escalating + cup game logic (TDD) | TODO |
| 9 | Gameweeks + prizes (TDD) | TODO |
| 10 | Pick validation (TDD) | TODO |
| 11 | FPL client + Drizzle sync | TODO |
| 12 | Scores provider interface | TODO |
| 13 | Cron API routes + vercel.json | TODO |
| 14 | Pick submission API | TODO |
| 15 | App shell, theme, providers | TODO |
| 16 | Auth pages (login, signup) | TODO |
| 17 | Authenticated layout + navbar | TODO |
| 18 | Games list + create pages | TODO |
| 19 | Game detail + leaderboard | TODO |
| 20 | Unified pick page | TODO |
| 21 | Progress + admin pages | TODO |
| 22 | CI/CD | TODO |
| 23 | Data migration script | TODO |
| 24 | CLAUDE.md update | TODO |
| 25 | Final verification | TODO |
