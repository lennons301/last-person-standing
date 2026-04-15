# Game Engine & API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete backend — pure game logic for all three modes (TDD), data adapters for FPL and football-data.org, and API routes for games, picks, admin, and cron jobs.

**Architecture:** Game logic lives in pure functions with zero database dependencies — they take plain data in, return results. API routes are the glue: fetch from DB, call logic, persist results. Data adapters implement a common interface for fetching competition data from external sources. All game logic is test-driven with Vitest.

**Tech Stack:** Vitest, Drizzle ORM (queries), Next.js 16 route handlers, node fetch (external APIs)

**Plan series:**
- Plan 1: Foundation ✅
- **Plan 2: Game Engine & API** (this plan)
- Plan 3: Frontend
- Plan 4: Advanced Features

---

## File Structure

```
src/
  lib/
    game-logic/
      common.ts                  # Shared: determine fixture outcome, types
      common.test.ts
      classic.ts                 # Classic mode evaluation
      classic.test.ts
      turbo.ts                   # Turbo mode evaluation
      turbo.test.ts
      cup.ts                     # Cup mode evaluation + lives
      cup.test.ts
      prizes.ts                  # Prize pot + payout calculation
      prizes.test.ts
    picks/
      validate.ts                # Pick validation (all modes)
      validate.test.ts
    data/
      types.ts                   # Common adapter interface
      fpl.ts                     # FPL API adapter
      fpl.test.ts
      football-data.ts           # football-data.org adapter
      football-data.test.ts
    game/
      process-round.ts           # Orchestrate: fetch data → evaluate → persist
      invite-code.ts             # Generate unique invite codes
  app/
    api/
      games/
        route.ts                 # GET (list my games), POST (create game)
        [id]/
          route.ts               # GET (game detail + standings)
          join/route.ts          # POST (join via invite code)
          admin/
            late-pick/route.ts   # POST (unlock deadline for a player)
            split-pot/route.ts   # POST (end game as split)
            payments/route.ts    # GET + PATCH (payment tracking)
      picks/
        [gameId]/
          [roundId]/
            route.ts             # GET (picks for round), POST (submit pick)
      cron/
        sync-fpl/route.ts       # POST (sync FPL teams/fixtures/deadlines)
        poll-scores/route.ts    # POST (poll live scores from football-data.org)
        process-rounds/route.ts # POST (process completed rounds → eliminations)
```

---

### Task 1: Common Game Logic Helpers

**Files:**
- Create: `src/lib/game-logic/common.ts`
- Create: `src/lib/game-logic/common.test.ts`

These shared helpers determine fixture outcomes from scores. Used by all three game modes.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game-logic/common.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { determineFixtureOutcome, determinePickResult } from './common'

describe('determineFixtureOutcome', () => {
  it('returns home_win when home score is higher', () => {
    expect(determineFixtureOutcome(2, 1)).toBe('home_win')
  })

  it('returns away_win when away score is higher', () => {
    expect(determineFixtureOutcome(0, 3)).toBe('away_win')
  })

  it('returns draw when scores are equal', () => {
    expect(determineFixtureOutcome(1, 1)).toBe('draw')
  })

  it('handles 0-0 draw', () => {
    expect(determineFixtureOutcome(0, 0)).toBe('draw')
  })
})

describe('determinePickResult', () => {
  it('returns win when picked team is home and home wins', () => {
    expect(
      determinePickResult({
        pickedTeamId: 'team-a',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 2,
        awayScore: 0,
      }),
    ).toBe('win')
  })

  it('returns win when picked team is away and away wins', () => {
    expect(
      determinePickResult({
        pickedTeamId: 'team-b',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 0,
        awayScore: 1,
      }),
    ).toBe('win')
  })

  it('returns loss when picked team is home and away wins', () => {
    expect(
      determinePickResult({
        pickedTeamId: 'team-a',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 0,
        awayScore: 2,
      }),
    ).toBe('loss')
  })

  it('returns loss when picked team is away and home wins', () => {
    expect(
      determinePickResult({
        pickedTeamId: 'team-b',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 3,
        awayScore: 1,
      }),
    ).toBe('loss')
  })

  it('returns draw when scores are equal', () => {
    expect(
      determinePickResult({
        pickedTeamId: 'team-a',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        homeScore: 1,
        awayScore: 1,
      }),
    ).toBe('draw')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/common.test.ts`
Expected: FAIL — module `./common` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/game-logic/common.ts`:

```typescript
export type FixtureOutcome = 'home_win' | 'away_win' | 'draw'
export type PickResult = 'win' | 'loss' | 'draw'

export function determineFixtureOutcome(homeScore: number, awayScore: number): FixtureOutcome {
  if (homeScore > awayScore) return 'home_win'
  if (awayScore > homeScore) return 'away_win'
  return 'draw'
}

export interface PickResultInput {
  pickedTeamId: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
}

export function determinePickResult(input: PickResultInput): PickResult {
  const outcome = determineFixtureOutcome(input.homeScore, input.awayScore)

  const pickedHome = input.pickedTeamId === input.homeTeamId

  if (outcome === 'draw') return 'draw'
  if (pickedHome && outcome === 'home_win') return 'win'
  if (!pickedHome && outcome === 'away_win') return 'win'
  return 'loss'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game-logic/common.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/common.ts src/lib/game-logic/common.test.ts
git commit -m "feat: add common game logic helpers (fixture outcome, pick result)"
```

---

### Task 2: Classic Mode Game Logic

**Files:**
- Create: `src/lib/game-logic/classic.ts`
- Create: `src/lib/game-logic/classic.test.ts`

Classic mode: one pick per round. Win = survive, draw or loss = eliminated.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game-logic/classic.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { processClassicRound } from './classic'
import type { ClassicRoundInput } from './classic'

function makeFixture(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
) {
  return {
    id: `fixture-${homeTeamId}-${awayTeamId}`,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
  }
}

describe('processClassicRound', () => {
  it('marks player as win when their picked team wins at home', () => {
    const input: ClassicRoundInput = {
      players: [
        { gamePlayerId: 'p1', pickedTeamId: 'arsenal' },
      ],
      fixtures: [makeFixture('arsenal', 'chelsea', 2, 0)],
    }

    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('win')
    expect(result.results[0].eliminated).toBe(false)
  })

  it('marks player as win when their picked team wins away', () => {
    const input: ClassicRoundInput = {
      players: [
        { gamePlayerId: 'p1', pickedTeamId: 'liverpool' },
      ],
      fixtures: [makeFixture('wolves', 'liverpool', 0, 3)],
    }

    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('win')
    expect(result.results[0].eliminated).toBe(false)
  })

  it('eliminates player when their picked team draws', () => {
    const input: ClassicRoundInput = {
      players: [
        { gamePlayerId: 'p1', pickedTeamId: 'arsenal' },
      ],
      fixtures: [makeFixture('arsenal', 'chelsea', 1, 1)],
    }

    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('draw')
    expect(result.results[0].eliminated).toBe(true)
  })

  it('eliminates player when their picked team loses', () => {
    const input: ClassicRoundInput = {
      players: [
        { gamePlayerId: 'p1', pickedTeamId: 'arsenal' },
      ],
      fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
    }

    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('loss')
    expect(result.results[0].eliminated).toBe(true)
  })

  it('processes multiple players in the same round', () => {
    const input: ClassicRoundInput = {
      players: [
        { gamePlayerId: 'p1', pickedTeamId: 'arsenal' },
        { gamePlayerId: 'p2', pickedTeamId: 'chelsea' },
        { gamePlayerId: 'p3', pickedTeamId: 'wolves' },
      ],
      fixtures: [
        makeFixture('arsenal', 'chelsea', 2, 0),
        makeFixture('wolves', 'liverpool', 1, 1),
      ],
    }

    const result = processClassicRound(input)

    const p1 = result.results.find((r) => r.gamePlayerId === 'p1')
    const p2 = result.results.find((r) => r.gamePlayerId === 'p2')
    const p3 = result.results.find((r) => r.gamePlayerId === 'p3')

    expect(p1?.result).toBe('win')
    expect(p1?.eliminated).toBe(false)

    expect(p2?.result).toBe('loss')
    expect(p2?.eliminated).toBe(true)

    expect(p3?.result).toBe('draw')
    expect(p3?.eliminated).toBe(true)
  })

  it('returns empty results for empty input', () => {
    const result = processClassicRound({ players: [], fixtures: [] })
    expect(result.results).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/game-logic/classic.ts`:

```typescript
import { type PickResult, determinePickResult } from './common'

export interface ClassicPlayerPick {
  gamePlayerId: string
  pickedTeamId: string
}

export interface ClassicFixture {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
}

export interface ClassicRoundInput {
  players: ClassicPlayerPick[]
  fixtures: ClassicFixture[]
}

export interface ClassicPlayerResult {
  gamePlayerId: string
  result: PickResult
  eliminated: boolean
}

export interface ClassicRoundOutput {
  results: ClassicPlayerResult[]
}

export function processClassicRound(input: ClassicRoundInput): ClassicRoundOutput {
  const fixturesByTeam = new Map<string, ClassicFixture>()
  for (const f of input.fixtures) {
    fixturesByTeam.set(f.homeTeamId, f)
    fixturesByTeam.set(f.awayTeamId, f)
  }

  const results: ClassicPlayerResult[] = input.players.map((player) => {
    const fixture = fixturesByTeam.get(player.pickedTeamId)
    if (!fixture) {
      return { gamePlayerId: player.gamePlayerId, result: 'loss' as const, eliminated: true }
    }

    const result = determinePickResult({
      pickedTeamId: player.pickedTeamId,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    })

    return {
      gamePlayerId: player.gamePlayerId,
      result,
      eliminated: result !== 'win',
    }
  })

  return { results }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/classic.ts src/lib/game-logic/classic.test.ts
git commit -m "feat: add classic mode game logic with TDD"
```

---

### Task 3: Turbo Mode Game Logic

**Files:**
- Create: `src/lib/game-logic/turbo.ts`
- Create: `src/lib/game-logic/turbo.test.ts`

Turbo mode: predict results for 10 fixtures ranked by confidence. Consecutive correct predictions from rank 1 determines streak. Goals scored in correct picks is the tiebreaker.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game-logic/turbo.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { evaluateTurboPicks, calculateTurboStandings } from './turbo'
import type { TurboPickInput } from './turbo'

function makePick(
  rank: number,
  predicted: 'home_win' | 'draw' | 'away_win',
  homeScore: number,
  awayScore: number,
): TurboPickInput {
  return {
    confidenceRank: rank,
    predictedResult: predicted,
    homeScore,
    awayScore,
  }
}

describe('evaluateTurboPicks', () => {
  it('calculates perfect streak when all predictions correct', () => {
    const picks = [
      makePick(1, 'home_win', 2, 0),
      makePick(2, 'away_win', 0, 1),
      makePick(3, 'draw', 1, 1),
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(3)
  })

  it('stops streak at first incorrect prediction', () => {
    const picks = [
      makePick(1, 'home_win', 2, 0),
      makePick(2, 'home_win', 0, 1), // wrong
      makePick(3, 'home_win', 3, 0),
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(1)
  })

  it('returns streak 0 when first prediction is wrong', () => {
    const picks = [
      makePick(1, 'away_win', 2, 0), // wrong
      makePick(2, 'home_win', 2, 0),
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(0)
  })

  it('counts goals scored in correct predictions only', () => {
    const picks = [
      makePick(1, 'home_win', 3, 1), // correct, goals: 3+1=4
      makePick(2, 'home_win', 0, 2), // wrong, goals should not count
      makePick(3, 'home_win', 2, 0), // correct but after break
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(1)
    expect(result.goalsInStreak).toBe(4)
  })

  it('counts goals across full streak', () => {
    const picks = [
      makePick(1, 'home_win', 2, 0), // correct, goals: 2
      makePick(2, 'away_win', 1, 3), // correct, goals: 4
      makePick(3, 'draw', 2, 2),     // correct, goals: 4
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(3)
    expect(result.goalsInStreak).toBe(10)
  })

  it('handles empty picks', () => {
    const result = evaluateTurboPicks([])
    expect(result.streak).toBe(0)
    expect(result.goalsInStreak).toBe(0)
  })

  it('sorts by confidence rank before evaluating', () => {
    const picks = [
      makePick(3, 'draw', 1, 1),
      makePick(1, 'home_win', 2, 0),
      makePick(2, 'away_win', 0, 1),
    ]

    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(3)
  })
})

describe('calculateTurboStandings', () => {
  it('ranks players by streak descending', () => {
    const players = [
      { gamePlayerId: 'p1', streak: 3, goalsInStreak: 5 },
      { gamePlayerId: 'p2', streak: 5, goalsInStreak: 2 },
      { gamePlayerId: 'p3', streak: 1, goalsInStreak: 10 },
    ]

    const standings = calculateTurboStandings(players)
    expect(standings[0].gamePlayerId).toBe('p2')
    expect(standings[1].gamePlayerId).toBe('p1')
    expect(standings[2].gamePlayerId).toBe('p3')
  })

  it('breaks ties by goals in streak', () => {
    const players = [
      { gamePlayerId: 'p1', streak: 3, goalsInStreak: 5 },
      { gamePlayerId: 'p2', streak: 3, goalsInStreak: 8 },
    ]

    const standings = calculateTurboStandings(players)
    expect(standings[0].gamePlayerId).toBe('p2')
    expect(standings[1].gamePlayerId).toBe('p1')
  })

  it('assigns positions correctly', () => {
    const players = [
      { gamePlayerId: 'p1', streak: 5, goalsInStreak: 10 },
      { gamePlayerId: 'p2', streak: 3, goalsInStreak: 8 },
    ]

    const standings = calculateTurboStandings(players)
    expect(standings[0].position).toBe(1)
    expect(standings[1].position).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/turbo.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/game-logic/turbo.ts`:

```typescript
import { determineFixtureOutcome } from './common'

export interface TurboPickInput {
  confidenceRank: number
  predictedResult: 'home_win' | 'draw' | 'away_win'
  homeScore: number
  awayScore: number
}

export interface TurboResult {
  streak: number
  goalsInStreak: number
  pickResults: Array<{
    confidenceRank: number
    correct: boolean
    goals: number
  }>
}

export function evaluateTurboPicks(picks: TurboPickInput[]): TurboResult {
  if (picks.length === 0) {
    return { streak: 0, goalsInStreak: 0, pickResults: [] }
  }

  const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)

  let streak = 0
  let goalsInStreak = 0
  let streakBroken = false

  const pickResults = sorted.map((pick) => {
    const actualOutcome = determineFixtureOutcome(pick.homeScore, pick.awayScore)
    const correct = actualOutcome === pick.predictedResult
    const goals = pick.homeScore + pick.awayScore

    if (!streakBroken && correct) {
      streak++
      goalsInStreak += goals
    } else {
      streakBroken = true
    }

    return { confidenceRank: pick.confidenceRank, correct, goals }
  })

  return { streak, goalsInStreak, pickResults }
}

export interface TurboPlayerScore {
  gamePlayerId: string
  streak: number
  goalsInStreak: number
}

export interface TurboStanding extends TurboPlayerScore {
  position: number
}

export function calculateTurboStandings(players: TurboPlayerScore[]): TurboStanding[] {
  const sorted = [...players].sort((a, b) => {
    if (b.streak !== a.streak) return b.streak - a.streak
    return b.goalsInStreak - a.goalsInStreak
  })

  return sorted.map((player, index) => ({
    ...player,
    position: index + 1,
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game-logic/turbo.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/turbo.ts src/lib/game-logic/turbo.test.ts
git commit -m "feat: add turbo mode game logic with TDD"
```

---

### Task 4: Cup Mode Game Logic

**Files:**
- Create: `src/lib/game-logic/cup.ts`
- Create: `src/lib/game-logic/cup.test.ts`

Cup mode: predict 10 cup fixtures ranked by confidence. Lives system with tier-based handicaps.

Rules:
- Correct pick against team 2+ tiers above chosen team → +1 life
- Draw against team 2+ tiers above → success (not a loss)
- Incorrect pick → costs 1 life (if available) or player eliminated
- Goals not counted when picking against team only 1 tier below

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game-logic/cup.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { evaluateCupPicks } from './cup'
import type { CupPickInput } from './cup'

function makePick(
  rank: number,
  predicted: 'home_win' | 'draw' | 'away_win',
  homeScore: number,
  awayScore: number,
  tierDifference: number,
): CupPickInput {
  return {
    confidenceRank: rank,
    predictedResult: predicted,
    homeScore,
    awayScore,
    tierDifference,
  }
}

describe('evaluateCupPicks', () => {
  it('correct pick with no tier advantage grants no life', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 2, 0, 0)],
      0,
    )
    expect(result.livesChange).toBe(0)
    expect(result.finalLives).toBe(0)
    expect(result.eliminated).toBe(false)
  })

  it('correct pick against team 2+ tiers above grants +1 life', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 2, 0, 2)],
      0,
    )
    expect(result.livesChange).toBe(1)
    expect(result.finalLives).toBe(1)
    expect(result.eliminated).toBe(false)
  })

  it('correct pick against team only 1 tier above does not grant life', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 2, 0, 1)],
      0,
    )
    expect(result.livesChange).toBe(0)
    expect(result.finalLives).toBe(0)
  })

  it('draw against team 2+ tiers above counts as success', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 1, 1, 2)],
      0,
    )
    // Prediction was wrong (predicted home_win, got draw)
    // But draw against 2+ tiers above is a success — no life lost
    expect(result.eliminated).toBe(false)
    expect(result.pickResults[0].savedByDraw).toBe(true)
  })

  it('incorrect pick costs 1 life when lives available', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 0, 2, 0)],
      1,
    )
    expect(result.livesChange).toBe(-1)
    expect(result.finalLives).toBe(0)
    expect(result.eliminated).toBe(false)
  })

  it('incorrect pick eliminates when no lives remain', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 0, 2, 0)],
      0,
    )
    expect(result.eliminated).toBe(true)
  })

  it('goals not counted when picking against team only 1 tier below', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 3, 0, -1)],
      0,
    )
    expect(result.pickResults[0].goalsCounted).toBe(0)
  })

  it('goals counted normally for other tier differences', () => {
    const result = evaluateCupPicks(
      [makePick(1, 'home_win', 3, 1, 0)],
      0,
    )
    expect(result.pickResults[0].goalsCounted).toBe(4)
  })

  it('processes multiple picks and accumulates lives', () => {
    const picks = [
      makePick(1, 'home_win', 2, 0, 3),  // correct, +1 life (tier 3)
      makePick(2, 'away_win', 2, 0, 0),  // wrong, -1 life
      makePick(3, 'home_win', 1, 0, 2),  // correct, +1 life (tier 2)
    ]

    const result = evaluateCupPicks(picks, 0)
    expect(result.livesChange).toBe(1) // +1 -1 +1 = 1
    expect(result.finalLives).toBe(1)
    expect(result.eliminated).toBe(false)
  })

  it('eliminates mid-round when lives run out', () => {
    const picks = [
      makePick(1, 'away_win', 2, 0, 0), // wrong, -1 life → 0 lives → eliminated
      makePick(2, 'home_win', 2, 0, 0), // correct but already eliminated
    ]

    const result = evaluateCupPicks(picks, 1)
    expect(result.eliminated).toBe(true)
  })

  it('sorts picks by confidence rank before processing', () => {
    const picks = [
      makePick(2, 'away_win', 2, 0, 0),  // wrong (processed second)
      makePick(1, 'home_win', 2, 0, 3),  // correct, +1 life (processed first)
    ]

    const result = evaluateCupPicks(picks, 0)
    // Rank 1 correct → +1 life → now have 1 life
    // Rank 2 wrong → -1 life → 0 lives, not eliminated
    expect(result.eliminated).toBe(false)
    expect(result.finalLives).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/cup.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/game-logic/cup.ts`:

```typescript
import { determineFixtureOutcome } from './common'

export interface CupPickInput {
  confidenceRank: number
  predictedResult: 'home_win' | 'draw' | 'away_win'
  homeScore: number
  awayScore: number
  tierDifference: number // positive = picked team is underdog (opponent is higher tier)
}

export interface CupPickResult {
  confidenceRank: number
  correct: boolean
  lifeGained: boolean
  lifeLost: boolean
  savedByDraw: boolean
  goalsCounted: number
}

export interface CupResult {
  livesChange: number
  finalLives: number
  eliminated: boolean
  pickResults: CupPickResult[]
}

export function evaluateCupPicks(picks: CupPickInput[], startingLives: number): CupResult {
  const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)

  let currentLives = startingLives
  let livesChange = 0
  let eliminated = false
  const pickResults: CupPickResult[] = []

  for (const pick of sorted) {
    if (eliminated) {
      pickResults.push({
        confidenceRank: pick.confidenceRank,
        correct: false,
        lifeGained: false,
        lifeLost: false,
        savedByDraw: false,
        goalsCounted: 0,
      })
      continue
    }

    const actualOutcome = determineFixtureOutcome(pick.homeScore, pick.awayScore)
    const correct = actualOutcome === pick.predictedResult
    const isHighTierMismatch = pick.tierDifference >= 2
    const isDraw = actualOutcome === 'draw'

    // Goals: not counted when picking against team only 1 tier below
    const goalsCounted = pick.tierDifference === -1 ? 0 : pick.homeScore + pick.awayScore

    let lifeGained = false
    let lifeLost = false
    let savedByDraw = false

    if (correct) {
      // Correct pick against team 2+ tiers above → +1 life
      if (isHighTierMismatch) {
        lifeGained = true
        currentLives++
        livesChange++
      }
    } else if (isDraw && isHighTierMismatch) {
      // Draw against team 2+ tiers above → success, no penalty
      savedByDraw = true
    } else {
      // Incorrect pick → lose a life or get eliminated
      if (currentLives > 0) {
        lifeLost = true
        currentLives--
        livesChange--
      } else {
        eliminated = true
        lifeLost = true
        livesChange--
      }
    }

    pickResults.push({
      confidenceRank: pick.confidenceRank,
      correct,
      lifeGained,
      lifeLost,
      savedByDraw,
      goalsCounted,
    })
  }

  return {
    livesChange,
    finalLives: Math.max(0, currentLives),
    eliminated,
    pickResults,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game-logic/cup.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/cup.ts src/lib/game-logic/cup.test.ts
git commit -m "feat: add cup mode game logic with lives system (TDD)"
```

---

### Task 5: Prize Calculation

**Files:**
- Create: `src/lib/game-logic/prizes.ts`
- Create: `src/lib/game-logic/prizes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game-logic/prizes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { calculatePot, calculatePayouts } from './prizes'

describe('calculatePot', () => {
  it('multiplies entry fee by player count', () => {
    expect(calculatePot('10.00', 12)).toBe('120.00')
  })

  it('returns 0 when no entry fee', () => {
    expect(calculatePot(null, 12)).toBe('0.00')
  })

  it('handles decimal entry fees', () => {
    expect(calculatePot('7.50', 8)).toBe('60.00')
  })
})

describe('calculatePayouts', () => {
  it('gives full pot to single winner', () => {
    const payouts = calculatePayouts('100.00', ['winner-1'])
    expect(payouts).toEqual([{ userId: 'winner-1', amount: '100.00', isSplit: false }])
  })

  it('splits pot equally among multiple winners', () => {
    const payouts = calculatePayouts('100.00', ['w1', 'w2'])
    expect(payouts).toEqual([
      { userId: 'w1', amount: '50.00', isSplit: true },
      { userId: 'w2', amount: '50.00', isSplit: true },
    ])
  })

  it('handles uneven splits with rounding', () => {
    const payouts = calculatePayouts('100.00', ['w1', 'w2', 'w3'])
    // 100 / 3 = 33.33 each, with 0.01 remainder to first winner
    expect(payouts[0].amount).toBe('33.34')
    expect(payouts[1].amount).toBe('33.33')
    expect(payouts[2].amount).toBe('33.33')
  })

  it('returns empty array when no winners', () => {
    expect(calculatePayouts('100.00', [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/prizes.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/game-logic/prizes.ts`:

```typescript
export function calculatePot(entryFee: string | null, playerCount: number): string {
  if (!entryFee) return '0.00'
  const fee = Number.parseFloat(entryFee)
  return (fee * playerCount).toFixed(2)
}

export interface PayoutEntry {
  userId: string
  amount: string
  isSplit: boolean
}

export function calculatePayouts(pot: string, winnerUserIds: string[]): PayoutEntry[] {
  if (winnerUserIds.length === 0) return []

  const totalCents = Math.round(Number.parseFloat(pot) * 100)
  const perWinnerCents = Math.floor(totalCents / winnerUserIds.length)
  let remainderCents = totalCents - perWinnerCents * winnerUserIds.length
  const isSplit = winnerUserIds.length > 1

  return winnerUserIds.map((userId) => {
    const extra = remainderCents > 0 ? 1 : 0
    remainderCents -= extra
    return {
      userId,
      amount: ((perWinnerCents + extra) / 100).toFixed(2),
      isSplit,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game-logic/prizes.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/prizes.ts src/lib/game-logic/prizes.test.ts
git commit -m "feat: add prize pot and payout calculation (TDD)"
```

---

### Task 6: Pick Validation

**Files:**
- Create: `src/lib/picks/validate.ts`
- Create: `src/lib/picks/validate.test.ts`

Validates whether a pick can be submitted. Pure function — caller provides all context.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/picks/validate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { validateClassicPick, validateTurboPicks } from './validate'

describe('validateClassicPick', () => {
  const base = {
    playerStatus: 'alive' as const,
    roundStatus: 'open' as const,
    deadline: new Date(Date.now() + 3600000), // 1 hour from now
    now: new Date(),
    usedTeamIds: ['team-used-1', 'team-used-2'],
    fixtureTeamIds: ['team-a', 'team-b', 'team-c', 'team-d'],
  }

  it('accepts a valid pick', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-a' })
    expect(result).toEqual({ valid: true })
  })

  it('rejects if player is eliminated', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-a', playerStatus: 'eliminated' })
    expect(result).toEqual({ valid: false, reason: 'Player is not alive' })
  })

  it('rejects if round is not open', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-a', roundStatus: 'completed' })
    expect(result).toEqual({ valid: false, reason: 'Round is not open for picks' })
  })

  it('rejects if deadline has passed', () => {
    const result = validateClassicPick({
      ...base,
      teamId: 'team-a',
      deadline: new Date(Date.now() - 1000),
    })
    expect(result).toEqual({ valid: false, reason: 'Deadline has passed' })
  })

  it('rejects if team already used', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-used-1' })
    expect(result).toEqual({ valid: false, reason: 'Team already used in a previous round' })
  })

  it('rejects if team not in fixtures', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-not-playing' })
    expect(result).toEqual({ valid: false, reason: 'Team is not playing in this round' })
  })

  it('accepts when deadline is null (no deadline set)', () => {
    const result = validateClassicPick({ ...base, teamId: 'team-a', deadline: null })
    expect(result).toEqual({ valid: true })
  })
})

describe('validateTurboPicks', () => {
  const base = {
    playerStatus: 'alive' as const,
    roundStatus: 'open' as const,
    deadline: new Date(Date.now() + 3600000),
    now: new Date(),
    numberOfPicks: 3,
    fixtureIds: ['f1', 'f2', 'f3', 'f4'],
  }

  it('accepts valid picks with correct count and unique fixtures', () => {
    const result = validateTurboPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' },
        { fixtureId: 'f3', confidenceRank: 3, predictedResult: 'away_win' },
      ],
    })
    expect(result).toEqual({ valid: true })
  })

  it('rejects wrong number of picks', () => {
    const result = validateTurboPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Expected 3 picks, got 1' })
  })

  it('rejects duplicate fixture IDs', () => {
    const result = validateTurboPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
        { fixtureId: 'f1', confidenceRank: 2, predictedResult: 'draw' },
        { fixtureId: 'f2', confidenceRank: 3, predictedResult: 'away_win' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Duplicate fixture in picks' })
  })

  it('rejects duplicate confidence ranks', () => {
    const result = validateTurboPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
        { fixtureId: 'f2', confidenceRank: 1, predictedResult: 'draw' },
        { fixtureId: 'f3', confidenceRank: 3, predictedResult: 'away_win' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Confidence ranks must be unique sequential integers from 1' })
  })

  it('rejects invalid fixture ID', () => {
    const result = validateTurboPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' },
        { fixtureId: 'invalid', confidenceRank: 3, predictedResult: 'away_win' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Invalid fixture ID: invalid' })
  })

  it('rejects if player is eliminated', () => {
    const result = validateTurboPicks({
      ...base,
      playerStatus: 'eliminated',
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win' },
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'draw' },
        { fixtureId: 'f3', confidenceRank: 3, predictedResult: 'away_win' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Player is not alive' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/picks/validate.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/picks/validate.ts`:

```typescript
type ValidationResult = { valid: true } | { valid: false; reason: string }

export interface ClassicPickValidation {
  teamId: string
  playerStatus: 'alive' | 'eliminated' | 'winner'
  roundStatus: 'upcoming' | 'open' | 'active' | 'completed'
  deadline: Date | null
  now: Date
  usedTeamIds: string[]
  fixtureTeamIds: string[]
}

export function validateClassicPick(input: ClassicPickValidation): ValidationResult {
  if (input.playerStatus !== 'alive') {
    return { valid: false, reason: 'Player is not alive' }
  }

  if (input.roundStatus !== 'open') {
    return { valid: false, reason: 'Round is not open for picks' }
  }

  if (input.deadline && input.now > input.deadline) {
    return { valid: false, reason: 'Deadline has passed' }
  }

  if (input.usedTeamIds.includes(input.teamId)) {
    return { valid: false, reason: 'Team already used in a previous round' }
  }

  if (!input.fixtureTeamIds.includes(input.teamId)) {
    return { valid: false, reason: 'Team is not playing in this round' }
  }

  return { valid: true }
}

export interface TurboPickEntry {
  fixtureId: string
  confidenceRank: number
  predictedResult: 'home_win' | 'draw' | 'away_win'
}

export interface TurboPicksValidation {
  playerStatus: 'alive' | 'eliminated' | 'winner'
  roundStatus: 'upcoming' | 'open' | 'active' | 'completed'
  deadline: Date | null
  now: Date
  numberOfPicks: number
  fixtureIds: string[]
  picks: TurboPickEntry[]
}

export function validateTurboPicks(input: TurboPicksValidation): ValidationResult {
  if (input.playerStatus !== 'alive') {
    return { valid: false, reason: 'Player is not alive' }
  }

  if (input.roundStatus !== 'open') {
    return { valid: false, reason: 'Round is not open for picks' }
  }

  if (input.deadline && input.now > input.deadline) {
    return { valid: false, reason: 'Deadline has passed' }
  }

  if (input.picks.length !== input.numberOfPicks) {
    return { valid: false, reason: `Expected ${input.numberOfPicks} picks, got ${input.picks.length}` }
  }

  // Check unique fixtures
  const fixtureSet = new Set(input.picks.map((p) => p.fixtureId))
  if (fixtureSet.size !== input.picks.length) {
    return { valid: false, reason: 'Duplicate fixture in picks' }
  }

  // Check confidence ranks are sequential 1..N
  const ranks = input.picks.map((p) => p.confidenceRank).sort((a, b) => a - b)
  const expectedRanks = Array.from({ length: input.numberOfPicks }, (_, i) => i + 1)
  if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks)) {
    return { valid: false, reason: 'Confidence ranks must be unique sequential integers from 1' }
  }

  // Check all fixture IDs are valid
  for (const pick of input.picks) {
    if (!input.fixtureIds.includes(pick.fixtureId)) {
      return { valid: false, reason: `Invalid fixture ID: ${pick.fixtureId}` }
    }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/picks/validate.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/picks/validate.ts src/lib/picks/validate.test.ts
git commit -m "feat: add pick validation for classic and turbo/cup modes (TDD)"
```

---

### Task 7: Invite Code Generator

**Files:**
- Create: `src/lib/game/invite-code.ts`
- Create: `src/lib/game/invite-code.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/invite-code.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { generateInviteCode } from './invite-code'

describe('generateInviteCode', () => {
  it('generates a string of the correct length', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(8)
  })

  it('only contains alphanumeric characters', () => {
    const code = generateInviteCode()
    expect(code).toMatch(/^[A-Z0-9]+$/)
  })

  it('generates different codes on multiple calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
    expect(codes.size).toBeGreaterThan(90) // allow very small collision chance
  })

  it('accepts custom length', () => {
    const code = generateInviteCode(12)
    expect(code).toHaveLength(12)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/game/invite-code.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/game/invite-code.ts`:

```typescript
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid confusion

export function generateInviteCode(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/game/invite-code.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/invite-code.ts src/lib/game/invite-code.test.ts
git commit -m "feat: add invite code generator"
```

---

### Task 8: Data Adapter Interface + FPL Adapter

**Files:**
- Create: `src/lib/data/types.ts`
- Create: `src/lib/data/fpl.ts`
- Create: `src/lib/data/fpl.test.ts`

- [ ] **Step 1: Create the adapter interface**

Create `src/lib/data/types.ts`:

```typescript
export interface CompetitionAdapter {
  /** Fetch all teams for this competition */
  fetchTeams(): Promise<AdapterTeam[]>
  /** Fetch rounds (gameweeks/matchdays) and their fixtures */
  fetchRounds(): Promise<AdapterRound[]>
  /** Fetch live/recent scores for in-progress fixtures */
  fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]>
}

export interface AdapterTeam {
  externalId: string
  name: string
  shortName: string
  badgeUrl: string | null
}

export interface AdapterRound {
  externalId: string
  number: number
  name: string
  deadline: Date | null
  finished: boolean
  fixtures: AdapterFixture[]
}

export interface AdapterFixture {
  externalId: string
  homeTeamExternalId: string
  awayTeamExternalId: string
  kickoff: Date | null
  status: 'scheduled' | 'live' | 'finished' | 'postponed'
  homeScore: number | null
  awayScore: number | null
}

export interface AdapterFixtureScore {
  externalId: string
  homeScore: number
  awayScore: number
  status: 'live' | 'finished'
}
```

- [ ] **Step 2: Write FPL adapter tests**

Create `src/lib/data/fpl.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FplAdapter } from './fpl'

const mockBootstrap = {
  teams: [
    { id: 1, name: 'Arsenal', short_name: 'ARS', code: 3 },
    { id: 2, name: 'Chelsea', short_name: 'CHE', code: 8 },
  ],
  events: [
    {
      id: 1,
      name: 'Gameweek 1',
      deadline_time: '2025-08-16T10:00:00Z',
      finished: true,
    },
    {
      id: 2,
      name: 'Gameweek 2',
      deadline_time: '2025-08-23T10:00:00Z',
      finished: false,
    },
  ],
}

const mockFixtures = [
  {
    id: 101,
    event: 1,
    team_h: 1,
    team_a: 2,
    kickoff_time: '2025-08-16T15:00:00Z',
    started: true,
    finished: true,
    finished_provisional: true,
    team_h_score: 2,
    team_a_score: 0,
  },
  {
    id: 102,
    event: 2,
    team_h: 2,
    team_a: 1,
    kickoff_time: '2025-08-23T15:00:00Z',
    started: false,
    finished: false,
    finished_provisional: false,
    team_h_score: null,
    team_a_score: null,
  },
]

describe('FplAdapter', () => {
  let adapter: FplAdapter

  beforeEach(() => {
    adapter = new FplAdapter()
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('bootstrap-static')) {
        return Promise.resolve(new Response(JSON.stringify(mockBootstrap)))
      }
      if (urlStr.includes('fixtures')) {
        return Promise.resolve(new Response(JSON.stringify(mockFixtures)))
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    })
  })

  it('fetches and maps teams', async () => {
    const teams = await adapter.fetchTeams()
    expect(teams).toHaveLength(2)
    expect(teams[0]).toEqual({
      externalId: '1',
      name: 'Arsenal',
      shortName: 'ARS',
      badgeUrl: 'https://resources.premierleague.com/premierleague/badges/rb/t3.svg',
    })
  })

  it('fetches rounds with fixtures', async () => {
    const rounds = await adapter.fetchRounds()
    expect(rounds).toHaveLength(2)
    expect(rounds[0].number).toBe(1)
    expect(rounds[0].finished).toBe(true)
    expect(rounds[0].fixtures).toHaveLength(1)
    expect(rounds[0].fixtures[0].homeScore).toBe(2)
  })

  it('maps fixture status correctly', async () => {
    const rounds = await adapter.fetchRounds()
    expect(rounds[0].fixtures[0].status).toBe('finished')
    expect(rounds[1].fixtures[0].status).toBe('scheduled')
  })
})
```

- [ ] **Step 3: Write the FPL adapter**

Create `src/lib/data/fpl.ts`:

```typescript
import type {
  CompetitionAdapter,
  AdapterTeam,
  AdapterRound,
  AdapterFixture,
  AdapterFixtureScore,
} from './types'

const FPL_BASE = 'https://fantasy.premierleague.com/api'

interface FplBootstrap {
  teams: Array<{ id: number; name: string; short_name: string; code: number }>
  events: Array<{
    id: number
    name: string
    deadline_time: string
    finished: boolean
  }>
}

interface FplFixture {
  id: number
  event: number | null
  team_h: number
  team_a: number
  kickoff_time: string | null
  started: boolean
  finished: boolean
  finished_provisional: boolean
  team_h_score: number | null
  team_a_score: number | null
}

export class FplAdapter implements CompetitionAdapter {
  private bootstrapCache: FplBootstrap | null = null
  private fixturesCache: FplFixture[] | null = null

  private async getBootstrap(): Promise<FplBootstrap> {
    if (this.bootstrapCache) return this.bootstrapCache
    const res = await fetch(`${FPL_BASE}/bootstrap-static/`)
    this.bootstrapCache = (await res.json()) as FplBootstrap
    return this.bootstrapCache
  }

  private async getFixtures(): Promise<FplFixture[]> {
    if (this.fixturesCache) return this.fixturesCache
    const res = await fetch(`${FPL_BASE}/fixtures/`)
    this.fixturesCache = (await res.json()) as FplFixture[]
    return this.fixturesCache
  }

  async fetchTeams(): Promise<AdapterTeam[]> {
    const data = await this.getBootstrap()
    return data.teams.map((t) => ({
      externalId: String(t.id),
      name: t.name,
      shortName: t.short_name,
      badgeUrl: `https://resources.premierleague.com/premierleague/badges/rb/t${t.code}.svg`,
    }))
  }

  async fetchRounds(): Promise<AdapterRound[]> {
    const [bootstrap, fixtures] = await Promise.all([this.getBootstrap(), this.getFixtures()])

    const fixturesByEvent = new Map<number, FplFixture[]>()
    for (const f of fixtures) {
      if (f.event == null) continue
      const list = fixturesByEvent.get(f.event) ?? []
      list.push(f)
      fixturesByEvent.set(f.event, list)
    }

    return bootstrap.events.map((event) => ({
      externalId: String(event.id),
      number: event.id,
      name: event.name,
      deadline: new Date(event.deadline_time),
      finished: event.finished,
      fixtures: (fixturesByEvent.get(event.id) ?? []).map(
        (f): AdapterFixture => ({
          externalId: String(f.id),
          homeTeamExternalId: String(f.team_h),
          awayTeamExternalId: String(f.team_a),
          kickoff: f.kickoff_time ? new Date(f.kickoff_time) : null,
          status: this.mapFixtureStatus(f),
          homeScore: f.team_h_score,
          awayScore: f.team_a_score,
        }),
      ),
    }))
  }

  async fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]> {
    const fixtures = await this.getFixtures()
    return fixtures
      .filter((f) => f.event === roundNumber && (f.started || f.finished))
      .filter((f) => f.team_h_score != null && f.team_a_score != null)
      .map((f) => ({
        externalId: String(f.id),
        homeScore: f.team_h_score as number,
        awayScore: f.team_a_score as number,
        status: f.finished ? ('finished' as const) : ('live' as const),
      }))
  }

  private mapFixtureStatus(f: FplFixture): AdapterFixture['status'] {
    if (f.finished || f.finished_provisional) return 'finished'
    if (f.started) return 'live'
    return 'scheduled'
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/data/fpl.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/fpl.ts src/lib/data/fpl.test.ts
git commit -m "feat: add data adapter interface and FPL adapter"
```

---

### Task 9: football-data.org Adapter

**Files:**
- Create: `src/lib/data/football-data.ts`
- Create: `src/lib/data/football-data.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/lib/data/football-data.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FootballDataAdapter } from './football-data'

const mockMatches = {
  matches: [
    {
      id: 501,
      matchday: 1,
      homeTeam: { id: 57, name: 'Arsenal', tla: 'ARS', crest: 'https://crests.football-data.org/57.png' },
      awayTeam: { id: 61, name: 'Chelsea', tla: 'CHE', crest: 'https://crests.football-data.org/61.png' },
      utcDate: '2025-08-16T15:00:00Z',
      status: 'FINISHED',
      score: { fullTime: { home: 2, away: 0 } },
    },
    {
      id: 502,
      matchday: 1,
      homeTeam: { id: 64, name: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
      awayTeam: { id: 66, name: 'Man United', tla: 'MUN', crest: 'https://crests.football-data.org/66.png' },
      utcDate: '2025-08-16T17:30:00Z',
      status: 'IN_PLAY',
      score: { fullTime: { home: 1, away: 1 } },
    },
  ],
}

const mockStandings = {
  standings: [
    {
      type: 'TOTAL',
      table: [
        { position: 1, team: { id: 57 }, playedGames: 10, won: 8, draw: 1, lost: 1, points: 25 },
        { position: 2, team: { id: 61 }, playedGames: 10, won: 7, draw: 2, lost: 1, points: 23 },
      ],
    },
  ],
}

describe('FootballDataAdapter', () => {
  let adapter: FootballDataAdapter

  beforeEach(() => {
    adapter = new FootballDataAdapter('PL', 'test-api-key')
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/matches')) {
        return Promise.resolve(new Response(JSON.stringify(mockMatches)))
      }
      if (urlStr.includes('/standings')) {
        return Promise.resolve(new Response(JSON.stringify(mockStandings)))
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    })
  })

  it('fetches teams from matches', async () => {
    const teams = await adapter.fetchTeams()
    expect(teams.length).toBeGreaterThanOrEqual(2)
    const arsenal = teams.find((t) => t.shortName === 'ARS')
    expect(arsenal).toEqual({
      externalId: '57',
      name: 'Arsenal',
      shortName: 'ARS',
      badgeUrl: 'https://crests.football-data.org/57.png',
    })
  })

  it('fetches rounds grouped by matchday', async () => {
    const rounds = await adapter.fetchRounds()
    expect(rounds).toHaveLength(1)
    expect(rounds[0].number).toBe(1)
    expect(rounds[0].fixtures).toHaveLength(2)
  })

  it('maps football-data.org status to adapter status', async () => {
    const rounds = await adapter.fetchRounds()
    expect(rounds[0].fixtures[0].status).toBe('finished')
    expect(rounds[0].fixtures[1].status).toBe('live')
  })

  it('fetches live scores for a round', async () => {
    const scores = await adapter.fetchLiveScores(1)
    expect(scores).toHaveLength(2)
    expect(scores[0]).toEqual({
      externalId: '501',
      homeScore: 2,
      awayScore: 0,
      status: 'finished',
    })
  })

  it('sends API key in headers', async () => {
    await adapter.fetchTeams()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Auth-Token': 'test-api-key' }),
      }),
    )
  })

  it('fetches standings', async () => {
    const standings = await adapter.fetchStandings()
    expect(standings).toHaveLength(2)
    expect(standings[0]).toEqual({
      teamExternalId: '57',
      position: 1,
      played: 10,
      won: 8,
      drawn: 1,
      lost: 1,
      points: 25,
    })
  })
})
```

- [ ] **Step 2: Write the implementation**

Create `src/lib/data/football-data.ts`:

```typescript
import type {
  CompetitionAdapter,
  AdapterTeam,
  AdapterRound,
  AdapterFixture,
  AdapterFixtureScore,
} from './types'

const BASE_URL = 'https://api.football-data.org/v4'

interface FdMatch {
  id: number
  matchday: number
  homeTeam: { id: number; name: string; tla: string; crest: string }
  awayTeam: { id: number; name: string; tla: string; crest: string }
  utcDate: string
  status: string
  score: { fullTime: { home: number | null; away: number | null } }
}

interface FdStandingEntry {
  position: number
  team: { id: number }
  playedGames: number
  won: number
  draw: number
  lost: number
  points: number
}

export interface StandingRow {
  teamExternalId: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  points: number
}

export class FootballDataAdapter implements CompetitionAdapter {
  constructor(
    private competitionCode: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'X-Auth-Token': this.apiKey },
    })
    return res.json() as Promise<T>
  }

  async fetchTeams(): Promise<AdapterTeam[]> {
    const data = await this.request<{ matches: FdMatch[] }>(
      `/competitions/${this.competitionCode}/matches`,
    )

    const teamMap = new Map<string, AdapterTeam>()
    for (const match of data.matches) {
      for (const t of [match.homeTeam, match.awayTeam]) {
        if (!teamMap.has(String(t.id))) {
          teamMap.set(String(t.id), {
            externalId: String(t.id),
            name: t.name,
            shortName: t.tla,
            badgeUrl: t.crest,
          })
        }
      }
    }

    return Array.from(teamMap.values())
  }

  async fetchRounds(): Promise<AdapterRound[]> {
    const data = await this.request<{ matches: FdMatch[] }>(
      `/competitions/${this.competitionCode}/matches`,
    )

    const roundMap = new Map<number, FdMatch[]>()
    for (const match of data.matches) {
      const list = roundMap.get(match.matchday) ?? []
      list.push(match)
      roundMap.set(match.matchday, list)
    }

    return Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([matchday, matches]) => ({
        externalId: String(matchday),
        number: matchday,
        name: `Matchday ${matchday}`,
        deadline: null,
        finished: matches.every((m) => m.status === 'FINISHED'),
        fixtures: matches.map(
          (m): AdapterFixture => ({
            externalId: String(m.id),
            homeTeamExternalId: String(m.homeTeam.id),
            awayTeamExternalId: String(m.awayTeam.id),
            kickoff: new Date(m.utcDate),
            status: this.mapStatus(m.status),
            homeScore: m.score.fullTime.home,
            awayScore: m.score.fullTime.away,
          }),
        ),
      }))
  }

  async fetchLiveScores(roundNumber: number): Promise<AdapterFixtureScore[]> {
    const data = await this.request<{ matches: FdMatch[] }>(
      `/competitions/${this.competitionCode}/matches?matchday=${roundNumber}`,
    )

    return data.matches
      .filter((m) => m.score.fullTime.home != null && m.score.fullTime.away != null)
      .map((m) => ({
        externalId: String(m.id),
        homeScore: m.score.fullTime.home as number,
        awayScore: m.score.fullTime.away as number,
        status: m.status === 'FINISHED' ? ('finished' as const) : ('live' as const),
      }))
  }

  async fetchStandings(): Promise<StandingRow[]> {
    const data = await this.request<{
      standings: Array<{ type: string; table: FdStandingEntry[] }>
    }>(`/competitions/${this.competitionCode}/standings`)

    const total = data.standings.find((s) => s.type === 'TOTAL')
    if (!total) return []

    return total.table.map((entry) => ({
      teamExternalId: String(entry.team.id),
      position: entry.position,
      played: entry.playedGames,
      won: entry.won,
      drawn: entry.draw,
      lost: entry.lost,
      points: entry.points,
    }))
  }

  private mapStatus(fdStatus: string): AdapterFixture['status'] {
    switch (fdStatus) {
      case 'FINISHED':
        return 'finished'
      case 'IN_PLAY':
      case 'PAUSED':
      case 'HALFTIME':
        return 'live'
      case 'POSTPONED':
      case 'CANCELLED':
        return 'postponed'
      default:
        return 'scheduled'
    }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/data/football-data.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/
git commit -m "feat: add football-data.org adapter with standings support"
```

---

### Task 10: Game CRUD API Routes

**Files:**
- Create: `src/app/api/games/route.ts`
- Create: `src/app/api/games/[id]/route.ts`
- Create: `src/app/api/games/[id]/join/route.ts`
- Create: `src/lib/game/invite-code.ts` (already exists from Task 7)

- [ ] **Step 1: Create `src/app/api/games/route.ts`** (list + create)

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { competition } from '@/lib/schema/competition'
import { payment } from '@/lib/schema/payment'
import { requireSession } from '@/lib/auth-helpers'
import { generateInviteCode } from '@/lib/game/invite-code'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await requireSession()

  const myGames = await db.query.gamePlayer.findMany({
    where: eq(gamePlayer.userId, session.user.id),
    with: {
      game: {
        with: {
          competition: true,
          players: true,
        },
      },
    },
  })

  const games = myGames.map((gp) => ({
    id: gp.game.id,
    name: gp.game.name,
    gameMode: gp.game.gameMode,
    status: gp.game.status,
    competition: gp.game.competition.name,
    playerCount: gp.game.players.length,
    aliveCount: gp.game.players.filter((p) => p.status === 'alive').length,
    myStatus: gp.status,
    entryFee: gp.game.entryFee,
    isAdmin: gp.game.createdBy === session.user.id,
  }))

  return NextResponse.json(games)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const body = await request.json()

  const { name, competitionId, gameMode, modeConfig, entryFee, maxPlayers } = body

  if (!name || !competitionId || !gameMode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify competition exists
  const comp = await db.query.competition.findFirst({
    where: eq(competition.id, competitionId),
  })

  if (!comp) {
    return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
  }

  const inviteCode = generateInviteCode()

  const [newGame] = await db
    .insert(game)
    .values({
      name,
      createdBy: session.user.id,
      competitionId,
      gameMode,
      modeConfig: modeConfig ?? {},
      entryFee: entryFee ?? null,
      maxPlayers: maxPlayers ?? null,
      inviteCode,
      status: 'open',
    })
    .returning()

  // Creator automatically joins the game
  await db.insert(gamePlayer).values({
    gameId: newGame.id,
    userId: session.user.id,
  })

  // Create payment record if entry fee is set
  if (entryFee) {
    await db.insert(payment).values({
      gameId: newGame.id,
      userId: session.user.id,
      amount: entryFee,
    })
  }

  return NextResponse.json(newGame, { status: 201 })
}
```

- [ ] **Step 2: Create `src/app/api/games/[id]/route.ts`** (game detail)

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'
import { calculatePot } from '@/lib/game-logic/prizes'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
    with: {
      competition: true,
      currentRound: true,
      players: true,
      picks: {
        with: { team: true, round: true },
      },
    },
  })

  if (!gameData) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  // Check if current user is a member
  const myMembership = gameData.players.find((p) => p.userId === session.user.id)

  // Get payment statuses
  const payments = await db.query.payment.findMany({
    where: eq(payment.gameId, id),
  })

  const pot = calculatePot(gameData.entryFee, gameData.players.length)

  return NextResponse.json({
    ...gameData,
    pot,
    myStatus: myMembership?.status ?? null,
    isMember: !!myMembership,
    isAdmin: gameData.createdBy === session.user.id,
    payments: gameData.createdBy === session.user.id ? payments : undefined,
  })
}
```

- [ ] **Step 3: Create `src/app/api/games/[id]/join/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
    with: { players: true },
  })

  if (!gameData) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (gameData.status !== 'open') {
    return NextResponse.json({ error: 'Game is not accepting new players' }, { status: 400 })
  }

  if (gameData.maxPlayers && gameData.players.length >= gameData.maxPlayers) {
    return NextResponse.json({ error: 'Game is full' }, { status: 400 })
  }

  const existing = gameData.players.find((p) => p.userId === session.user.id)
  if (existing) {
    return NextResponse.json({ error: 'Already a member of this game' }, { status: 400 })
  }

  const [player] = await db
    .insert(gamePlayer)
    .values({
      gameId: id,
      userId: session.user.id,
    })
    .returning()

  // Create payment record if entry fee is set
  if (gameData.entryFee) {
    await db.insert(payment).values({
      gameId: id,
      userId: session.user.id,
      amount: gameData.entryFee,
    })
  }

  return NextResponse.json(player, { status: 201 })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/games/
git commit -m "feat: add game CRUD and join API routes"
```

---

### Task 11: Picks API Routes

**Files:**
- Create: `src/app/api/picks/[gameId]/[roundId]/route.ts`

- [ ] **Step 1: Create the picks route**

Create `src/app/api/picks/[gameId]/[roundId]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { round, fixture } from '@/lib/schema/competition'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and, inArray } from 'drizzle-orm'
import { validateClassicPick, validateTurboPicks } from '@/lib/picks/validate'

type Params = Promise<{ gameId: string; roundId: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  const session = await requireSession()
  const { gameId, roundId } = await params

  const picks = await db.query.pick.findMany({
    where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
    with: { team: true, gamePlayer: true },
  })

  return NextResponse.json(picks)
}

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await requireSession()
  const { gameId, roundId } = await params
  const body = await request.json()

  // Get game and player
  const gameData = await db.query.game.findFirst({
    where: eq(game.id, gameId),
  })
  if (!gameData) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const player = await db.query.gamePlayer.findFirst({
    where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
  })
  if (!player) {
    return NextResponse.json({ error: 'Not a member of this game' }, { status: 403 })
  }

  // Get round
  const roundData = await db.query.round.findFirst({
    where: eq(round.id, roundId),
    with: { fixtures: true },
  })
  if (!roundData) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  const now = new Date()

  if (gameData.gameMode === 'classic') {
    const { teamId } = body

    // Get previously used teams
    const previousPicks = await db.query.pick.findMany({
      where: and(eq(pick.gamePlayerId, player.id), eq(pick.gameId, gameId)),
    })
    const usedTeamIds = previousPicks.map((p) => p.teamId)

    const fixtureTeamIds = roundData.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])

    const validation = validateClassicPick({
      teamId,
      playerStatus: player.status,
      roundStatus: roundData.status,
      deadline: roundData.deadline,
      now,
      usedTeamIds,
      fixtureTeamIds,
    })

    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400 })
    }

    // Find the fixture this team is in
    const teamFixture = roundData.fixtures.find(
      (f) => f.homeTeamId === teamId || f.awayTeamId === teamId,
    )

    // Upsert pick (replace if already submitted)
    const [newPick] = await db
      .insert(pick)
      .values({
        gameId,
        gamePlayerId: player.id,
        roundId,
        teamId,
        fixtureId: teamFixture?.id,
      })
      .onConflictDoUpdate({
        target: [pick.gamePlayerId, pick.roundId, pick.confidenceRank],
        set: { teamId, fixtureId: teamFixture?.id, createdAt: new Date() },
      })
      .returning()

    return NextResponse.json(newPick, { status: 201 })
  }

  // Turbo and Cup modes
  const { picks: pickEntries } = body
  const numberOfPicks = (gameData.modeConfig as { numberOfPicks?: number })?.numberOfPicks ?? 10

  const validation = validateTurboPicks({
    playerStatus: player.status,
    roundStatus: roundData.status,
    deadline: roundData.deadline,
    now,
    numberOfPicks,
    fixtureIds: roundData.fixtures.map((f) => f.id),
    picks: pickEntries,
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 400 })
  }

  // Delete existing picks for this round, then insert new ones
  const existingPicks = await db.query.pick.findMany({
    where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
  })
  if (existingPicks.length > 0) {
    const existingIds = existingPicks.map((p) => p.id)
    await db.delete(pick).where(inArray(pick.id, existingIds))
  }

  const newPicks = await db
    .insert(pick)
    .values(
      pickEntries.map((entry: { fixtureId: string; confidenceRank: number; predictedResult: string }) => ({
        gameId,
        gamePlayerId: player.id,
        roundId,
        teamId: entry.fixtureId, // For turbo/cup, teamId stores the fixture context
        fixtureId: entry.fixtureId,
        confidenceRank: entry.confidenceRank,
        predictedResult: entry.predictedResult,
      })),
    )
    .returning()

  return NextResponse.json(newPicks, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/picks/
git commit -m "feat: add picks API routes (submit and retrieve)"
```

---

### Task 12: Admin API Routes

**Files:**
- Create: `src/app/api/games/[id]/admin/late-pick/route.ts`
- Create: `src/app/api/games/[id]/admin/split-pot/route.ts`
- Create: `src/app/api/games/[id]/admin/payments/route.ts`

- [ ] **Step 1: Create late-pick route**

Create `src/app/api/games/[id]/admin/late-pick/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const { userId } = await request.json()

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
  })

  if (!gameData || gameData.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // For now, late pick just means we return a token the frontend uses
  // to allow submission past deadline. The actual deadline bypass is
  // handled by passing `bypassDeadline: true` in the pick submission.
  // Here we just verify the player exists and is alive.

  const player = await db.query.gamePlayer.findFirst({
    where: and(eq(gamePlayer.gameId, id), eq(gamePlayer.userId, userId)),
  })

  if (!player) {
    return NextResponse.json({ error: 'Player not found in game' }, { status: 404 })
  }

  if (player.status !== 'alive') {
    return NextResponse.json({ error: 'Player is not alive' }, { status: 400 })
  }

  return NextResponse.json({ allowed: true, playerId: player.id, gameId: id })
}
```

- [ ] **Step 2: Create split-pot route**

Create `src/app/api/games/[id]/admin/split-pot/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { payout } from '@/lib/schema/payment'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'
import { calculatePot, calculatePayouts } from '@/lib/game-logic/prizes'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
    with: { players: true },
  })

  if (!gameData || gameData.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (gameData.status === 'completed') {
    return NextResponse.json({ error: 'Game is already completed' }, { status: 400 })
  }

  const alivePlayers = gameData.players.filter((p) => p.status === 'alive')

  if (alivePlayers.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 alive players to split' }, { status: 400 })
  }

  const pot = calculatePot(gameData.entryFee, gameData.players.length)
  const winnerIds = alivePlayers.map((p) => p.userId)
  const payoutEntries = calculatePayouts(pot, winnerIds)

  // Mark players as winners
  for (const player of alivePlayers) {
    await db
      .update(gamePlayer)
      .set({ status: 'winner' })
      .where(eq(gamePlayer.id, player.id))
  }

  // Create payout records
  if (payoutEntries.length > 0) {
    await db.insert(payout).values(
      payoutEntries.map((p) => ({
        gameId: id,
        userId: p.userId,
        amount: p.amount,
        isSplit: p.isSplit,
      })),
    )
  }

  // Mark game as completed
  await db.update(game).set({ status: 'completed' }).where(eq(game.id, id))

  return NextResponse.json({ winners: payoutEntries, pot })
}
```

- [ ] **Step 3: Create payments route**

Create `src/app/api/games/[id]/admin/payments/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { requireSession } from '@/lib/auth-helpers'
import { eq, and } from 'drizzle-orm'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
  })

  if (!gameData || gameData.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const payments = await db.query.payment.findMany({
    where: eq(payment.gameId, id),
  })

  return NextResponse.json(payments)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const { userId, status: newStatus } = await request.json()

  const gameData = await db.query.game.findFirst({
    where: eq(game.id, id),
  })

  if (!gameData || gameData.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const [updated] = await db
    .update(payment)
    .set({
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date() : null,
    })
    .where(and(eq(payment.gameId, id), eq(payment.userId, userId)))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/games/[id]/admin/
git commit -m "feat: add admin API routes (late pick, split pot, payments)"
```

---

### Task 13: Cron API Routes

**Files:**
- Create: `src/app/api/cron/sync-fpl/route.ts`
- Create: `src/app/api/cron/poll-scores/route.ts`
- Create: `src/app/api/cron/process-rounds/route.ts`
- Create: `src/lib/game/process-round.ts`

- [ ] **Step 1: Create round processing orchestrator**

Create `src/lib/game/process-round.ts`:

```typescript
import { db } from '@/lib/db'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { round, fixture } from '@/lib/schema/competition'
import { eq, and } from 'drizzle-orm'
import { processClassicRound } from '@/lib/game-logic/classic'
import { evaluateTurboPicks, calculateTurboStandings } from '@/lib/game-logic/turbo'
import { evaluateCupPicks } from '@/lib/game-logic/cup'

export async function processGameRound(gameId: string, roundId: string) {
  const gameData = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: { players: true },
  })
  if (!gameData) throw new Error(`Game ${gameId} not found`)

  const roundData = await db.query.round.findFirst({
    where: eq(round.id, roundId),
    with: { fixtures: true },
  })
  if (!roundData) throw new Error(`Round ${roundId} not found`)

  // Check all fixtures are finished
  const allFinished = roundData.fixtures.every((f) => f.status === 'finished')
  if (!allFinished) return { processed: false, reason: 'Not all fixtures finished' }

  const alivePlayers = gameData.players.filter((p) => p.status === 'alive')

  const allPicks = await db.query.pick.findMany({
    where: and(eq(pick.gameId, gameId), eq(pick.roundId, roundId)),
  })

  if (gameData.gameMode === 'classic') {
    const completedFixtures = roundData.fixtures
      .filter((f) => f.homeScore != null && f.awayScore != null)
      .map((f) => ({
        id: f.id,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeScore: f.homeScore as number,
        awayScore: f.awayScore as number,
      }))

    const playerPicks = alivePlayers.map((p) => {
      const playerPick = allPicks.find((pk) => pk.gamePlayerId === p.id)
      return {
        gamePlayerId: p.id,
        pickedTeamId: playerPick?.teamId ?? '',
      }
    })

    const result = processClassicRound({ players: playerPicks, fixtures: completedFixtures })

    // Update picks and player statuses
    for (const pr of result.results) {
      const playerPick = allPicks.find((pk) => pk.gamePlayerId === pr.gamePlayerId)
      if (playerPick) {
        await db.update(pick).set({ result: pr.result }).where(eq(pick.id, playerPick.id))
      }
      if (pr.eliminated) {
        await db
          .update(gamePlayer)
          .set({ status: 'eliminated', eliminatedRoundId: roundId })
          .where(eq(gamePlayer.id, pr.gamePlayerId))
      }
    }

    return { processed: true, eliminations: result.results.filter((r) => r.eliminated).length }
  }

  if (gameData.gameMode === 'turbo') {
    const playerResults = []
    for (const player of alivePlayers) {
      const playerPicks = allPicks
        .filter((pk) => pk.gamePlayerId === player.id)
        .map((pk) => {
          const f = roundData.fixtures.find((fx) => fx.id === pk.fixtureId)
          return {
            confidenceRank: pk.confidenceRank ?? 0,
            predictedResult: (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win',
            homeScore: f?.homeScore ?? 0,
            awayScore: f?.awayScore ?? 0,
          }
        })

      const result = evaluateTurboPicks(playerPicks)
      playerResults.push({
        gamePlayerId: player.id,
        streak: result.streak,
        goalsInStreak: result.goalsInStreak,
      })

      // Update each pick result
      for (const pr of result.pickResults) {
        const matchingPick = allPicks.find(
          (pk) => pk.gamePlayerId === player.id && pk.confidenceRank === pr.confidenceRank,
        )
        if (matchingPick) {
          await db
            .update(pick)
            .set({ result: pr.correct ? 'win' : 'loss', goalsScored: pr.goals })
            .where(eq(pick.id, matchingPick.id))
        }
      }
    }

    const standings = calculateTurboStandings(playerResults)
    return { processed: true, eliminations: 0, standings }
  }

  if (gameData.gameMode === 'cup') {
    let eliminations = 0
    for (const player of alivePlayers) {
      const playerPicks = allPicks
        .filter((pk) => pk.gamePlayerId === player.id)
        .map((pk) => {
          const f = roundData.fixtures.find((fx) => fx.id === pk.fixtureId)
          return {
            confidenceRank: pk.confidenceRank ?? 0,
            predictedResult: (pk.predictedResult ?? 'draw') as 'home_win' | 'draw' | 'away_win',
            homeScore: f?.homeScore ?? 0,
            awayScore: f?.awayScore ?? 0,
            tierDifference: 0, // TODO: store tier_difference on fixture in cup competitions
          }
        })

      const startingLives = player.livesRemaining
      const result = evaluateCupPicks(playerPicks, startingLives)

      await db
        .update(gamePlayer)
        .set({
          livesRemaining: result.finalLives,
          ...(result.eliminated
            ? { status: 'eliminated' as const, eliminatedRoundId: roundId }
            : {}),
        })
        .where(eq(gamePlayer.id, player.id))

      if (result.eliminated) eliminations++

      // Update each pick result
      for (const pr of result.pickResults) {
        const matchingPick = allPicks.find(
          (pk) => pk.gamePlayerId === player.id && pk.confidenceRank === pr.confidenceRank,
        )
        if (matchingPick) {
          await db
            .update(pick)
            .set({
              result: pr.correct ? 'win' : pr.savedByDraw ? 'draw' : pr.lifeLost ? 'saved_by_life' : 'loss',
              goalsScored: pr.goalsCounted,
            })
            .where(eq(pick.id, matchingPick.id))
        }
      }
    }

    return { processed: true, eliminations }
  }

  return { processed: false, reason: 'Unknown game mode' }
}
```

- [ ] **Step 2: Create sync-fpl cron route**

Create `src/app/api/cron/sync-fpl/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { competition, round, team, fixture } from '@/lib/schema/competition'
import { eq, and } from 'drizzle-orm'
import { FplAdapter } from '@/lib/data/fpl'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adapter = new FplAdapter()

  // Find or create PL competition
  let pl = await db.query.competition.findFirst({
    where: and(eq(competition.dataSource, 'fpl'), eq(competition.status, 'active')),
  })

  if (!pl) {
    const [created] = await db
      .insert(competition)
      .values({
        name: 'Premier League',
        type: 'league',
        dataSource: 'fpl',
        season: '2025/26',
      })
      .returning()
    pl = created
  }

  // Sync teams
  const adapterTeams = await adapter.fetchTeams()
  for (const at of adapterTeams) {
    await db
      .insert(team)
      .values({
        name: at.name,
        shortName: at.shortName,
        badgeUrl: at.badgeUrl,
        externalIds: { fpl: at.externalId },
      })
      .onConflictDoNothing()
  }

  // Sync rounds and fixtures
  const adapterRounds = await adapter.fetchRounds()
  for (const ar of adapterRounds) {
    const existingRound = await db.query.round.findFirst({
      where: and(eq(round.competitionId, pl.id), eq(round.number, ar.number)),
    })

    let roundId: string
    if (existingRound) {
      roundId = existingRound.id
      await db
        .update(round)
        .set({
          deadline: ar.deadline,
          status: ar.finished ? 'completed' : existingRound.status,
        })
        .where(eq(round.id, existingRound.id))
    } else {
      const [newRound] = await db
        .insert(round)
        .values({
          competitionId: pl.id,
          number: ar.number,
          name: ar.name,
          deadline: ar.deadline,
          status: ar.finished ? 'completed' : 'upcoming',
        })
        .returning()
      roundId = newRound.id
    }

    // Sync fixtures for this round
    for (const af of ar.fixtures) {
      // Look up team IDs by external ID
      const homeTeam = await db.query.team.findFirst({
        where: eq(team.externalIds, { fpl: af.homeTeamExternalId } as Record<string, string | number>),
      })
      const awayTeam = await db.query.team.findFirst({
        where: eq(team.externalIds, { fpl: af.awayTeamExternalId } as Record<string, string | number>),
      })

      if (!homeTeam || !awayTeam) continue

      await db
        .insert(fixture)
        .values({
          roundId,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          kickoff: af.kickoff,
          status: af.status,
          homeScore: af.homeScore,
          awayScore: af.awayScore,
          externalId: af.externalId,
        })
        .onConflictDoNothing()
    }
  }

  return NextResponse.json({ synced: true, rounds: adapterRounds.length })
}
```

- [ ] **Step 3: Create poll-scores cron route**

Create `src/app/api/cron/poll-scores/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fixture, round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'
import { eq, and, inArray } from 'drizzle-orm'
import { FootballDataAdapter } from '@/lib/data/football-data'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.FOOTBALL_DATA_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 500 })
  }

  // Find active rounds (status = 'active') for active games
  const activeGames = await db.query.game.findMany({
    where: eq(game.status, 'active'),
    with: { currentRound: true },
  })

  const activeRoundIds = activeGames
    .map((g) => g.currentRoundId)
    .filter((id): id is string => id != null)

  if (activeRoundIds.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  const adapter = new FootballDataAdapter('PL', apiKey)
  let totalUpdated = 0

  for (const roundId of [...new Set(activeRoundIds)]) {
    const roundData = await db.query.round.findFirst({
      where: eq(round.id, roundId),
    })
    if (!roundData) continue

    const scores = await adapter.fetchLiveScores(roundData.number)

    for (const score of scores) {
      const result = await db
        .update(fixture)
        .set({
          homeScore: score.homeScore,
          awayScore: score.awayScore,
          status: score.status,
        })
        .where(eq(fixture.externalId, score.externalId))

      totalUpdated++
    }
  }

  return NextResponse.json({ updated: totalUpdated })
}
```

- [ ] **Step 4: Create process-rounds cron route**

Create `src/app/api/cron/process-rounds/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { round, fixture } from '@/lib/schema/competition'
import { eq, and } from 'drizzle-orm'
import { processGameRound } from '@/lib/game/process-round'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find active games with a current round
  const activeGames = await db.query.game.findMany({
    where: eq(game.status, 'active'),
  })

  const results = []

  for (const g of activeGames) {
    if (!g.currentRoundId) continue

    // Check if the round's fixtures are all finished
    const roundData = await db.query.round.findFirst({
      where: eq(round.id, g.currentRoundId),
      with: { fixtures: true },
    })

    if (!roundData) continue

    const allFinished = roundData.fixtures.every(
      (f) => f.status === 'finished' && f.homeScore != null && f.awayScore != null,
    )

    if (!allFinished) continue

    const result = await processGameRound(g.id, g.currentRoundId)
    results.push({ gameId: g.id, ...result })

    // If round was processed, mark it as completed
    if (result.processed) {
      await db.update(round).set({ status: 'completed' }).where(eq(round.id, g.currentRoundId))
    }
  }

  return NextResponse.json({ processed: results })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/process-round.ts src/app/api/cron/
git commit -m "feat: add cron routes for FPL sync, score polling, round processing"
```

---

### Task 14: Run All Tests and Verify

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `pnpm exec vitest run`
Expected: All game logic tests pass (common, classic, turbo, cup, prizes, validation, invite-code, fpl, football-data).

- [ ] **Step 2: Run lint**

Run: `pnpm exec biome check .`
Expected: Clean (or auto-fixable warnings only — run `biome check --write .` if needed)

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Production build succeeds.

- [ ] **Step 5: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve lint/type issues from game engine and API implementation"
```

---

## Summary

After completing this plan, the project has:

- **Pure game logic** for Classic, Turbo, and Cup modes — fully tested with TDD
- **Pick validation** for all modes — tested
- **Prize calculation** with split pot support — tested
- **Data adapters** for FPL API and football-data.org — tested with mocks
- **API routes** for game CRUD, picks, admin actions, and cron jobs
- **Round processing** that evaluates picks and updates player statuses

**Test coverage:** ~50 unit tests covering all game logic, validation, prize calculation, and data adapters.

**Next:** Plan 3 (Frontend) builds the UI with the Kit Room visual system and all screens.
