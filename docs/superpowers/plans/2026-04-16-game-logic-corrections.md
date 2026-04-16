# Game Logic Corrections Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all game logic to match the actual rules from the existing app (premier-league-survivor-picks). 14 discrete issues across Classic, Turbo, and Cup modes.

**Architecture:** TDD approach — write failing tests encoding the correct behaviour from the old app, then fix the implementation to make them pass. Each task is one logical fix with its own tests and commit.

**Tech Stack:** Vitest, TypeScript

**Context:** The old app at ~/code/premier-league-survivor-picks is the source of truth for all game rules. The stored procedures in supabase/migrations/ contain the authoritative logic.

---

## Discrepancy Source

All discrepancies originate from the design spec being written from high-level descriptions rather than reading the old app's actual code. The existing tests pass because they test the wrong spec.

---

### Task 1: Fix Turbo Goals Counting

**Issue:** Turbo mode currently counts `homeScore + awayScore` for all correct picks. The old app counts differently per prediction type:
- `home_win` prediction correct → count `homeScore` only
- `away_win` prediction correct → count `awayScore` only
- `draw` prediction correct → count `homeScore + awayScore`

**Files:**
- Modify: `src/lib/game-logic/turbo.test.ts`
- Modify: `src/lib/game-logic/turbo.ts`

- [ ] **Step 1: Write failing tests for correct goals counting**

Add to `src/lib/game-logic/turbo.test.ts`:

```typescript
describe('goals counting per prediction type', () => {
  it('counts only home goals for correct home_win prediction', () => {
    const picks = [makePick(1, 'home_win', 3, 1)]
    const result = evaluateTurboPicks(picks)
    expect(result.goalsInStreak).toBe(3) // home goals only, not 4
  })

  it('counts only away goals for correct away_win prediction', () => {
    const picks = [makePick(1, 'away_win', 1, 4)]
    const result = evaluateTurboPicks(picks)
    expect(result.goalsInStreak).toBe(4) // away goals only, not 5
  })

  it('counts both goals for correct draw prediction', () => {
    const picks = [makePick(1, 'draw', 2, 2)]
    const result = evaluateTurboPicks(picks)
    expect(result.goalsInStreak).toBe(4) // both goals
  })

  it('counts goals correctly across mixed streak', () => {
    const picks = [
      makePick(1, 'home_win', 3, 0), // correct, goals: 3 (home only)
      makePick(2, 'draw', 1, 1),     // correct, goals: 2 (both)
      makePick(3, 'away_win', 0, 2), // correct, goals: 2 (away only)
    ]
    const result = evaluateTurboPicks(picks)
    expect(result.streak).toBe(3)
    expect(result.goalsInStreak).toBe(7) // 3 + 2 + 2
  })
})
```

- [ ] **Step 2: Run tests, verify failures**

Run: `pnpm exec vitest run src/lib/game-logic/turbo.test.ts`
Expected: New tests FAIL (goals counting is wrong)

- [ ] **Step 3: Fix the implementation**

In `src/lib/game-logic/turbo.ts`, change the goals calculation in `evaluateTurboPicks`:

Replace:
```typescript
const goals = pick.homeScore + pick.awayScore
```

With:
```typescript
let goals = 0
if (correct) {
  if (pick.predictedResult === 'home_win') goals = pick.homeScore
  else if (pick.predictedResult === 'away_win') goals = pick.awayScore
  else goals = pick.homeScore + pick.awayScore // draw: both
}
```

Also update the `pickResults` to return the correct goals value.

- [ ] **Step 4: Fix existing test that assumed wrong goals counting**

The existing test "counts goals across full streak" uses total goals. Update it:
```typescript
it('counts goals across full streak with correct per-type counting', () => {
  const picks = [
    makePick(1, 'home_win', 2, 0), // correct, home goals: 2
    makePick(2, 'away_win', 1, 3), // correct, away goals: 3
    makePick(3, 'draw', 2, 2),     // correct, both goals: 4
  ]
  const result = evaluateTurboPicks(picks)
  expect(result.streak).toBe(3)
  expect(result.goalsInStreak).toBe(9) // 2 + 3 + 4
})
```

- [ ] **Step 5: Run all turbo tests, verify pass**

Run: `pnpm exec vitest run src/lib/game-logic/turbo.test.ts`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/game-logic/turbo.ts src/lib/game-logic/turbo.test.ts
git commit -m "fix: turbo goals counting — home/away/draw counted differently per prediction type"
```

---

### Task 2: Add Classic First-Gameweek Exemption

**Issue:** The old app has a "rebuy" rule: non-wins in the starting gameweek don't eliminate players. Our implementation always eliminates on non-win.

**Files:**
- Modify: `src/lib/game-logic/classic.test.ts`
- Modify: `src/lib/game-logic/classic.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/game-logic/classic.test.ts`:

```typescript
describe('first gameweek exemption', () => {
  it('does not eliminate on loss in starting round', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
      fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
      isStartingRound: true,
    }
    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('loss')
    expect(result.results[0].eliminated).toBe(false)
  })

  it('does not eliminate on draw in starting round', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
      fixtures: [makeFixture('arsenal', 'chelsea', 1, 1)],
      isStartingRound: true,
    }
    const result = processClassicRound(input)
    expect(result.results[0].result).toBe('draw')
    expect(result.results[0].eliminated).toBe(false)
  })

  it('still eliminates on loss after starting round', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
      fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
      isStartingRound: false,
    }
    const result = processClassicRound(input)
    expect(result.results[0].eliminated).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, verify failures**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: FAIL — `isStartingRound` not in the interface

- [ ] **Step 3: Fix the implementation**

Add `isStartingRound` to `ClassicRoundInput`:
```typescript
export interface ClassicRoundInput {
  players: ClassicPlayerPick[]
  fixtures: ClassicFixture[]
  isStartingRound?: boolean
}
```

Update the elimination logic in `processClassicRound`:
```typescript
return {
  gamePlayerId: player.gamePlayerId,
  result,
  eliminated: result !== 'win' && !input.isStartingRound,
}
```

- [ ] **Step 4: Update existing tests to pass `isStartingRound: false`**

All existing tests assume non-starting round behaviour. Add `isStartingRound: false` to their inputs (or leave undefined since `!undefined` is `true`, which means elimination still happens — verify this works).

Actually: `!input.isStartingRound` where `isStartingRound` is `undefined` → `!undefined` → `true`, so elimination happens. Existing tests work without changes.

- [ ] **Step 5: Run all classic tests, verify pass**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/game-logic/classic.ts src/lib/game-logic/classic.test.ts
git commit -m "fix: add first-gameweek exemption (rebuy) to classic mode"
```

---

### Task 3: Add Classic Goals Tracking and All-Eliminated Tiebreaker

**Issue:** Classic mode doesn't track goals on winning picks and has no logic for when all players are eliminated simultaneously (winner determined by total goals from winning picks).

**Files:**
- Modify: `src/lib/game-logic/classic.test.ts`
- Modify: `src/lib/game-logic/classic.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/game-logic/classic.test.ts`:

```typescript
describe('goals tracking on wins', () => {
  it('tracks picked team goals on a win', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
      fixtures: [makeFixture('arsenal', 'chelsea', 3, 1)],
    }
    const result = processClassicRound(input)
    expect(result.results[0].goalsScored).toBe(3) // picked team (home) goals
  })

  it('tracks away team goals when picking away winner', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'liverpool' }],
      fixtures: [makeFixture('wolves', 'liverpool', 0, 4)],
    }
    const result = processClassicRound(input)
    expect(result.results[0].goalsScored).toBe(4)
  })

  it('sets goals to 0 on loss', () => {
    const input: ClassicRoundInput = {
      players: [{ gamePlayerId: 'p1', pickedTeamId: 'arsenal' }],
      fixtures: [makeFixture('arsenal', 'chelsea', 0, 2)],
    }
    const result = processClassicRound(input)
    expect(result.results[0].goalsScored).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests, verify failures**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: FAIL — `goalsScored` not in output

- [ ] **Step 3: Fix the implementation**

Add `goalsScored` to `ClassicPlayerResult`:
```typescript
export interface ClassicPlayerResult {
  gamePlayerId: string
  result: PickResult
  eliminated: boolean
  goalsScored: number
}
```

Update the result mapping to calculate goals:
```typescript
const pickedHome = player.pickedTeamId === fixture.homeTeamId
const goalsScored = result === 'win'
  ? (pickedHome ? fixture.homeScore : fixture.awayScore)
  : 0

return {
  gamePlayerId: player.gamePlayerId,
  result,
  eliminated: result !== 'win' && !input.isStartingRound,
  goalsScored,
}
```

- [ ] **Step 4: Run all classic tests, verify pass**

Run: `pnpm exec vitest run src/lib/game-logic/classic.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/classic.ts src/lib/game-logic/classic.test.ts
git commit -m "fix: track goals on winning classic picks for tiebreaker"
```

---

### Task 4: Rewrite Cup Mode

**Issue:** Cup mode has 9 discrepancies — effectively needs a full rewrite. The fundamental problem is that `tierDifference` needs to be relative to the picked side, not the fixture. The old app stores tier_difference from the home perspective and inverts it based on which team was picked.

**Files:**
- Rewrite: `src/lib/game-logic/cup.ts`
- Rewrite: `src/lib/game-logic/cup.test.ts`

- [ ] **Step 1: Write the complete cup test file encoding all correct rules**

Replace `src/lib/game-logic/cup.test.ts` entirely:

```typescript
import { describe, expect, it } from 'vitest'
import { evaluateCupPicks } from './cup'
import type { CupPickInput } from './cup'

/**
 * tierDifference is from the HOME team's perspective:
 *   positive = home is higher tier (favoured)
 *   negative = away is higher tier
 * pickedTeam: 'home' or 'away'
 * The function internally calculates tierDiffFromPicked:
 *   pickedTeam === 'home' ? tierDifference : -tierDifference
 *   positive tierDiffFromPicked = picked team is favourite
 *   negative tierDiffFromPicked = picked team is underdog
 */

function makePick(
  rank: number,
  pickedTeam: 'home' | 'away',
  homeScore: number,
  awayScore: number,
  tierDifference: number,
): CupPickInput {
  return { confidenceRank: rank, pickedTeam, homeScore, awayScore, tierDifference }
}

describe('evaluateCupPicks', () => {
  // === PICK RESTRICTIONS ===

  describe('pick restrictions', () => {
    it('rejects picks where picked team is >1 tier above opponent', () => {
      // Home is +2 tier, picking home → tierDiffFromPicked = +2 → INVALID
      const result = evaluateCupPicks(
        [makePick(1, 'home', 3, 0, 2)],
        0,
      )
      expect(result.pickResults[0].restricted).toBe(true)
    })

    it('allows picks where picked team is exactly 1 tier above', () => {
      // Home is +1 tier, picking home → tierDiffFromPicked = +1 → valid, no goals
      const result = evaluateCupPicks(
        [makePick(1, 'home', 3, 0, 1)],
        0,
      )
      expect(result.pickResults[0].restricted).toBe(false)
    })

    it('allows underdog picks', () => {
      // Home is +3 tier, picking away → tierDiffFromPicked = -3 → underdog, valid
      const result = evaluateCupPicks(
        [makePick(1, 'away', 0, 2, 3)],
        0,
      )
      expect(result.pickResults[0].restricted).toBe(false)
    })
  })

  // === LIVES EARNED ON WIN ===

  describe('lives earned on win', () => {
    it('earns lives proportional to tier gap when underdog wins', () => {
      // Home +3, picking away → tierDiffFromPicked = -3, away wins
      const result = evaluateCupPicks(
        [makePick(1, 'away', 0, 2, 3)],
        0,
      )
      expect(result.pickResults[0].livesGained).toBe(3)
      expect(result.finalLives).toBe(3)
    })

    it('earns 1 life when 1-tier underdog wins', () => {
      // Home +1, picking away → tierDiffFromPicked = -1, away wins
      const result = evaluateCupPicks(
        [makePick(1, 'away', 0, 1, 1)],
        0,
      )
      expect(result.pickResults[0].livesGained).toBe(1)
    })

    it('earns 0 lives when same-tier team wins', () => {
      // Same tier, picking home → tierDiffFromPicked = 0, home wins
      const result = evaluateCupPicks(
        [makePick(1, 'home', 2, 0, 0)],
        0,
      )
      expect(result.pickResults[0].livesGained).toBe(0)
    })

    it('earns 0 lives when 1-tier favourite wins', () => {
      // Home +1, picking home → tierDiffFromPicked = +1, home wins
      const result = evaluateCupPicks(
        [makePick(1, 'home', 2, 0, 1)],
        0,
      )
      expect(result.pickResults[0].livesGained).toBe(0)
    })
  })

  // === DRAW HANDLING ===

  describe('draw handling', () => {
    it('draw is success when picked team is underdog (tierDiffFromPicked <= -1)', () => {
      // Home +2, picking away → tierDiffFromPicked = -2, draw
      const result = evaluateCupPicks(
        [makePick(1, 'away', 1, 1, 2)],
        0,
      )
      expect(result.pickResults[0].result).toBe('draw_success')
      expect(result.eliminated).toBe(false)
    })

    it('draw earns exactly 1 life when tierDiffFromPicked <= -2', () => {
      // Home +3, picking away → tierDiffFromPicked = -3, draw
      const result = evaluateCupPicks(
        [makePick(1, 'away', 1, 1, 3)],
        0,
      )
      expect(result.pickResults[0].livesGained).toBe(1) // exactly 1, not 3
    })

    it('draw earns 0 lives when tierDiffFromPicked = -1', () => {
      // Home +1, picking away → tierDiffFromPicked = -1, draw
      const result = evaluateCupPicks(
        [makePick(1, 'away', 1, 1, 1)],
        0,
      )
      expect(result.pickResults[0].result).toBe('draw_success')
      expect(result.pickResults[0].livesGained).toBe(0)
    })

    it('draw is a loss when picked team is favourite or same tier', () => {
      // Same tier, picking home, draw → loss
      const result = evaluateCupPicks(
        [makePick(1, 'home', 1, 1, 0)],
        0,
      )
      expect(result.pickResults[0].result).toBe('loss')
      expect(result.eliminated).toBe(true)
    })

    it('draw loss can be saved by life', () => {
      // Same tier, picking home, draw → loss, but has life
      const result = evaluateCupPicks(
        [makePick(1, 'home', 1, 1, 0)],
        1,
      )
      expect(result.pickResults[0].result).toBe('saved_by_life')
      expect(result.finalLives).toBe(0)
      expect(result.eliminated).toBe(false)
    })
  })

  // === GOALS COUNTING ===

  describe('goals counting', () => {
    it('counts picked team goals on win (home pick)', () => {
      // Home wins 3-1, picking home
      const result = evaluateCupPicks(
        [makePick(1, 'home', 3, 1, 0)],
        0,
      )
      expect(result.pickResults[0].goalsCounted).toBe(3) // home goals only
    })

    it('counts picked team goals on win (away pick)', () => {
      // Away wins 1-4, picking away
      const result = evaluateCupPicks(
        [makePick(1, 'away', 1, 4, 0)],
        0,
      )
      expect(result.pickResults[0].goalsCounted).toBe(4) // away goals only
    })

    it('does NOT count goals when tierDiffFromPicked = 1 (slight favourite)', () => {
      // Home +1, picking home → tierDiffFromPicked = +1, home wins 3-0
      const result = evaluateCupPicks(
        [makePick(1, 'home', 3, 0, 1)],
        0,
      )
      expect(result.pickResults[0].goalsCounted).toBe(0)
    })

    it('counts goals when saved by life', () => {
      // Loss but saved by life — goals still count
      const result = evaluateCupPicks(
        [makePick(1, 'home', 1, 3, 0)],
        1,
      )
      expect(result.pickResults[0].result).toBe('saved_by_life')
      expect(result.pickResults[0].goalsCounted).toBe(1) // home goals
    })
  })

  // === STREAK AND ELIMINATION ===

  describe('streak and elimination', () => {
    it('eliminates on loss with no lives', () => {
      const result = evaluateCupPicks(
        [makePick(1, 'home', 0, 2, 0)],
        0,
      )
      expect(result.eliminated).toBe(true)
    })

    it('saves with life on loss when lives available', () => {
      const result = evaluateCupPicks(
        [makePick(1, 'home', 0, 2, 0)],
        1,
      )
      expect(result.pickResults[0].result).toBe('saved_by_life')
      expect(result.eliminated).toBe(false)
      expect(result.finalLives).toBe(0)
    })

    it('streak broken prevents further life spending', () => {
      const picks = [
        makePick(1, 'home', 0, 2, 0), // loss, no lives → streak broken
        makePick(2, 'home', 0, 1, 0), // loss, streak already broken → loss
      ]
      const result = evaluateCupPicks(picks, 0)
      expect(result.pickResults[0].result).toBe('loss')
      expect(result.pickResults[1].result).toBe('loss')
    })

    it('can spend multiple lives before streak breaks', () => {
      const picks = [
        makePick(1, 'away', 0, 2, 3), // win, earns 3 lives
        makePick(2, 'home', 0, 1, 0), // loss, spend 1 life (2 left)
        makePick(3, 'home', 0, 1, 0), // loss, spend 1 life (1 left)
        makePick(4, 'home', 0, 1, 0), // loss, spend 1 life (0 left)
        makePick(5, 'home', 0, 1, 0), // loss, no lives → streak broken
      ]
      const result = evaluateCupPicks(picks, 0)
      expect(result.pickResults[0].result).toBe('win')
      expect(result.pickResults[1].result).toBe('saved_by_life')
      expect(result.pickResults[2].result).toBe('saved_by_life')
      expect(result.pickResults[3].result).toBe('saved_by_life')
      expect(result.pickResults[4].result).toBe('loss')
      expect(result.eliminated).toBe(true)
      expect(result.finalLives).toBe(0)
    })

    it('processes picks in confidence rank order', () => {
      const picks = [
        makePick(2, 'home', 0, 1, 0), // loss (processed second)
        makePick(1, 'away', 0, 2, 3), // win +3 lives (processed first)
      ]
      const result = evaluateCupPicks(picks, 0)
      // Pick 1 (rank 1): win, earn 3 lives → 3 lives
      // Pick 2 (rank 2): loss, spend 1 life → 2 lives
      expect(result.eliminated).toBe(false)
      expect(result.finalLives).toBe(2)
    })
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm exec vitest run src/lib/game-logic/cup.test.ts`
Expected: Most tests FAIL — interface doesn't match, logic is wrong

- [ ] **Step 3: Rewrite the implementation**

Replace `src/lib/game-logic/cup.ts` entirely:

```typescript
export interface CupPickInput {
  confidenceRank: number
  pickedTeam: 'home' | 'away'
  homeScore: number
  awayScore: number
  tierDifference: number // from HOME team perspective: positive = home higher tier
}

export interface CupPickResult {
  confidenceRank: number
  result: 'win' | 'draw_success' | 'saved_by_life' | 'loss' | 'restricted'
  livesGained: number
  goalsCounted: number
  restricted: boolean
}

export interface CupResult {
  finalLives: number
  eliminated: boolean
  pickResults: CupPickResult[]
}

export function evaluateCupPicks(picks: CupPickInput[], startingLives: number): CupResult {
  const sorted = [...picks].sort((a, b) => a.confidenceRank - b.confidenceRank)
  let currentLives = startingLives
  let streakBroken = false
  const pickResults: CupPickResult[] = []

  for (const pick of sorted) {
    // Calculate tier diff from picked team's perspective
    const tierDiffFromPicked =
      pick.pickedTeam === 'home' ? pick.tierDifference : -pick.tierDifference

    // Restriction: can't pick team >1 tier above opponent
    if (tierDiffFromPicked > 1) {
      pickResults.push({
        confidenceRank: pick.confidenceRank,
        result: 'restricted',
        livesGained: 0,
        goalsCounted: 0,
        restricted: true,
      })
      continue
    }

    const pickedTeamGoals =
      pick.pickedTeam === 'home' ? pick.homeScore : pick.awayScore
    const opponentGoals =
      pick.pickedTeam === 'home' ? pick.awayScore : pick.homeScore
    const pickedTeamWon = pickedTeamGoals > opponentGoals
    const isDraw = pickedTeamGoals === opponentGoals

    let result: CupPickResult['result'] = 'loss'
    let livesGained = 0
    let goalsCounted = 0

    if (pickedTeamWon) {
      result = 'win'

      // Goals: count picked team's goals UNLESS tierDiffFromPicked = 1 (slight favourite)
      if (tierDiffFromPicked !== 1) {
        goalsCounted = pickedTeamGoals
      }

      // Lives: earn abs(tierDiffFromPicked) when underdog (tierDiffFromPicked < 0)
      if (tierDiffFromPicked < 0) {
        livesGained = Math.abs(tierDiffFromPicked)
        currentLives += livesGained
      }
    } else if (isDraw) {
      if (tierDiffFromPicked <= -1) {
        // Draw is a success for underdogs
        result = 'draw_success'
        goalsCounted = pickedTeamGoals

        // Earn exactly 1 life if 2+ tiers below
        if (tierDiffFromPicked <= -2) {
          livesGained = 1
          currentLives += 1
        }
      } else {
        // Draw is a loss for favourites/same tier
        if (!streakBroken && currentLives > 0) {
          result = 'saved_by_life'
          currentLives--
          goalsCounted = pickedTeamGoals
        } else {
          result = 'loss'
          streakBroken = true
        }
      }
    } else {
      // Loss
      if (!streakBroken && currentLives > 0) {
        result = 'saved_by_life'
        currentLives--
        goalsCounted = pickedTeamGoals
      } else {
        result = 'loss'
        streakBroken = true
      }
    }

    pickResults.push({
      confidenceRank: pick.confidenceRank,
      result,
      livesGained,
      goalsCounted,
      restricted: false,
    })
  }

  return {
    finalLives: currentLives,
    eliminated: streakBroken,
    pickResults,
  }
}
```

- [ ] **Step 4: Run all cup tests, verify pass**

Run: `pnpm exec vitest run src/lib/game-logic/cup.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-logic/cup.ts src/lib/game-logic/cup.test.ts
git commit -m "fix: rewrite cup mode to match old app rules

- tierDifference now from home perspective, inverted per picked side
- Lives proportional to tier gap (not always +1)
- Draw success for underdogs, draw loss for favourites
- Pick restriction: can't pick team >1 tier above opponent
- Goals: picked team's goals only, not total
- Streak broken mechanic prevents further life spending
- Draw earns exactly 1 life at 2+ tier gap"
```

---

### Task 5: Add Cup Pick Validation

**Issue:** No validation that prevents picking a team >1 tier above their opponent.

**Files:**
- Modify: `src/lib/picks/validate.test.ts`
- Modify: `src/lib/picks/validate.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/picks/validate.test.ts`:

```typescript
describe('validateCupPicks', () => {
  const base = {
    playerStatus: 'alive' as const,
    roundStatus: 'open' as const,
    deadline: new Date(Date.now() + 3600000),
    now: new Date(),
    numberOfPicks: 2,
    fixtures: [
      { fixtureId: 'f1', tierDifference: 3 },  // home +3 tiers
      { fixtureId: 'f2', tierDifference: 0 },  // same tier
    ],
  }

  it('rejects pick where picked team is >1 tier above opponent', () => {
    const result = validateCupPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
        // home is +3, picking home → tierDiffFromPicked = +3 → INVALID
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
      ],
    })
    expect(result).toEqual({ valid: false, reason: 'Cannot pick a team more than 1 tier above their opponent (fixture f1)' })
  })

  it('accepts pick where picked team is 1 tier above', () => {
    const result = validateCupPicks({
      ...base,
      fixtures: [
        { fixtureId: 'f1', tierDifference: 1 },
        { fixtureId: 'f2', tierDifference: 0 },
      ],
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'home_win', pickedTeam: 'home' },
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
      ],
    })
    expect(result).toEqual({ valid: true })
  })

  it('accepts underdog picks at any tier gap', () => {
    const result = validateCupPicks({
      ...base,
      picks: [
        { fixtureId: 'f1', confidenceRank: 1, predictedResult: 'away_win', pickedTeam: 'away' },
        // home +3, picking away → tierDiffFromPicked = -3 → underdog, valid
        { fixtureId: 'f2', confidenceRank: 2, predictedResult: 'home_win', pickedTeam: 'home' },
      ],
    })
    expect(result).toEqual({ valid: true })
  })
})
```

- [ ] **Step 2: Run tests, verify failures**

Run: `pnpm exec vitest run src/lib/picks/validate.test.ts`
Expected: FAIL — `validateCupPicks` not found

- [ ] **Step 3: Add `validateCupPicks` to `src/lib/picks/validate.ts`**

```typescript
export interface CupPickEntry {
  fixtureId: string
  confidenceRank: number
  predictedResult: 'home_win' | 'draw' | 'away_win'
  pickedTeam: 'home' | 'away'
}

export interface CupFixtureInfo {
  fixtureId: string
  tierDifference: number // from home perspective
}

export interface CupPicksValidation {
  playerStatus: 'alive' | 'eliminated' | 'winner'
  roundStatus: 'upcoming' | 'open' | 'active' | 'completed'
  deadline: Date | null
  now: Date
  numberOfPicks: number
  fixtures: CupFixtureInfo[]
  picks: CupPickEntry[]
}

export function validateCupPicks(input: CupPicksValidation): ValidationResult {
  if (input.playerStatus !== 'alive') return { valid: false, reason: 'Player is not alive' }
  if (input.roundStatus !== 'open') return { valid: false, reason: 'Round is not open for picks' }
  if (input.deadline && input.now > input.deadline) return { valid: false, reason: 'Deadline has passed' }
  if (input.picks.length !== input.numberOfPicks)
    return { valid: false, reason: `Expected ${input.numberOfPicks} picks, got ${input.picks.length}` }

  const fixtureSet = new Set(input.picks.map((p) => p.fixtureId))
  if (fixtureSet.size !== input.picks.length) return { valid: false, reason: 'Duplicate fixture in picks' }

  const ranks = input.picks.map((p) => p.confidenceRank).sort((a, b) => a - b)
  const expected = Array.from({ length: input.numberOfPicks }, (_, i) => i + 1)
  if (JSON.stringify(ranks) !== JSON.stringify(expected))
    return { valid: false, reason: 'Confidence ranks must be unique sequential integers from 1' }

  const fixtureMap = new Map(input.fixtures.map((f) => [f.fixtureId, f]))

  for (const pick of input.picks) {
    const fixture = fixtureMap.get(pick.fixtureId)
    if (!fixture) return { valid: false, reason: `Invalid fixture ID: ${pick.fixtureId}` }

    const tierDiffFromPicked =
      pick.pickedTeam === 'home' ? fixture.tierDifference : -fixture.tierDifference
    if (tierDiffFromPicked > 1) {
      return { valid: false, reason: `Cannot pick a team more than 1 tier above their opponent (fixture ${pick.fixtureId})` }
    }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Run all validation tests, verify pass**

Run: `pnpm exec vitest run src/lib/picks/validate.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/picks/validate.ts src/lib/picks/validate.test.ts
git commit -m "fix: add cup pick validation — restrict picking heavy favourites"
```

---

### Task 6: Update process-round.ts for Corrected Interfaces

**Issue:** The round processing orchestrator uses the old cup interface. It also needs updating for classic goals tracking.

**Files:**
- Modify: `src/lib/game/process-round.ts`

- [ ] **Step 1: Update cup processing to use new interface**

The cup section of `processGameRound` needs to:
- Pass `pickedTeam` (home/away) to `evaluateCupPicks` instead of `predictedResult`
- Use the new `CupPickInput` interface
- Store `result` values including `draw_success` and `restricted`
- Update `livesRemaining` correctly

- [ ] **Step 2: Update classic processing to track goals**

The classic section needs to use the updated `ClassicPlayerResult.goalsScored`.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/process-round.ts
git commit -m "fix: update round processing for corrected game logic interfaces"
```

---

### Task 7: Run Full Test Suite and Verify

- [ ] **Step 1: Run all tests**

Run: `pnpm exec vitest run`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `pnpm exec biome check .`
Expected: Clean

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Fix any issues and commit**

---

### Task 8: Independent Review

Dispatch an independent reviewer who:
1. Reads the old app's game logic (stored procedures and UI code)
2. Reads the new app's corrected game logic
3. Verifies every rule matches
4. Reports any remaining discrepancies

This reviewer should NOT have seen this plan — they verify independently.
