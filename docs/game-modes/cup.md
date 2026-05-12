# Cup mode

Tier-handicapped predictions with a lives system. Players rank cup fixtures by confidence; picking underdogs wins lives on a win, picking a >1-tier favourite is forbidden, and lives let you survive an occasional wrong call.

> Read [README.md](./README.md) first for the cross-cutting settlement model.

## Pick mechanics

- **Picks:** up to `modeConfig.numberOfPicks` (default 10–12). Cup allows **partial rankings** — 1..N picks submittable, unlike turbo.
- **Win condition:** survive every round until the last, then ranked by `cupTiebreaker` (streak / lives / goals).
- **Tier handicap:** for `competition.type === 'group_knockout'` (WC), `computeTierDifference` returns `awayPot - homePot` — positive when home is the stronger side (FIFA pots: 1=best, 4=worst). Non-`group_knockout` cup competitions (FA Cup `knockout`) get tier diff 0 — no handicap, no per-pick lives mechanic.

## Tier ↔ outcome table

`tierDiffFromPicked = pickedTeam === 'home' ? tierDifference : -tierDifference`

| `tierDiffFromPicked` | Meaning | Restriction / reward |
| --- | --- | --- |
| `> 1` | Picked >1 tier stronger than opponent | **Restricted** at validation |
| `1` | Picked 1 tier stronger | Allowed; goals not counted on win |
| `0` | Same tier | Allowed; standard win/loss |
| `-1` | 1-tier underdog | On win: +1 life. On draw: success, 0 lives. |
| `-2` | 2-tier underdog | On win: +2 lives. On draw: success + 1 life. |
| `-3` | 3-tier underdog (max WC) | On win: +3 lives. On draw: success + 1 life. |

`evaluateCupPicks` (`src/lib/game-logic/cup.ts`) is the evaluator.

## Settlement (whole-game re-evaluation)

Cup settlement mirrors the predecessor's `process_cup_results(p_game_id)`: when a cup fixture finishes, every game that has a pick on it gets a whole-game re-evaluation in `reevaluateCupGame`:

```mermaid
sequenceDiagram
    participant Trigger as fixture.status → finished
    participant Settle as settleFixture
    participant ReEval as reevaluateCupGame
    participant Complete as checkAndMaybeCompleteOrAdvance

    Trigger->>Settle: fixtureId
    Settle->>ReEval: per cup game touched
    Note over ReEval: For each alive player:<br/>1. Collect their picks for the current round<br/>2. Filter to picks whose fixture has scores<br/>3. Run evaluateCupPicks in rank order<br/>4. Persist per-pick: result, goalsScored,<br/>   life_gained, life_spent<br/>5. Persist gamePlayer.livesRemaining +<br/>   eliminated flag
    Settle->>Complete: per game
    Complete->>Complete: checkCupCompletion
    alt alive=1 / 0 / rounds-exhausted
        Complete->>Complete: applyAutoCompletion
    else round fully settled
        Complete->>Complete: round.status=completed, advance
    end
```

The re-eval is **idempotent**: re-running it with the same fixture states produces the same writes. Picks on fixtures without scores stay `'pending'`. Picks past a projected streak break are persisted as `'loss'` immediately when their fixture finishes.

Persisted bookkeeping (new columns introduced with this design):

- `pick.life_gained: int` — lives awarded to the player for this pick (0 for non-cup or no-bonus cases).
- `pick.life_spent: boolean` — true when this pick was saved by a life.

Both replace the old read-time recompute in `cup-standings-queries.computeLivesGained/Spent`. The helpers now read the persisted columns.

## Lives flow

```mermaid
stateDiagram-v2
    [*] --> StartOfRound
    StartOfRound --> ReadPick: process picks in rank order, finished fixtures only
    state ReadPick {
        [*] --> Win: pickedTeam wins
        [*] --> Drawn: fixture drawn
        [*] --> Lost: pickedTeam lost
        Win --> AddLives: tierDiffFromPicked < 0
        Win --> NoLifeChange: tierDiffFromPicked >= 0
        Drawn --> DrawSuccess: tierDiffFromPicked <= -1
        DrawSuccess --> AddLivesOnDraw: tierDiffFromPicked <= -2
        Drawn --> NeedSave: tierDiffFromPicked >= 0
        Lost --> NeedSave
        NeedSave --> SpendLife: streak not broken AND lives > 0
        NeedSave --> BreakStreak: no lives OR streak already broken
    }
```

Once `streakBroken=true`, every subsequent pick in rank order is a `'loss'` regardless of result. Lives spent earlier remain spent.

## Player state machine

```mermaid
stateDiagram-v2
    [*] --> alive: starts with modeConfig.startingLives lives (default 0)
    alive --> alive: round processed, streak intact
    alive --> eliminated: round processed, streakBroken=true (no lives left)
    alive --> winner: last-alive / rounds-exhausted / mass-extinction tiebreaker
```

Lives are **earned**, not handed out — `startingLives` defaults to 0. The creator can raise it for a more forgiving game.

## Live projection

For in-progress fixtures:

- **Per pick:** `LivePick.projectedOutcome` is `winning` / `drawing` / `losing` based on current score.
- **Per player:** `LivePlayer.projectedStreak` / `projectedLivesRemaining` / `projectedStatus` come from running `evaluateCupPicks` over `(settled picks ∪ in-progress picks with current scores)`. The aggregate updates live as scores change.
- **Cell visuals:** `cup-standings-queries.projectCupCellFromFixture` projects the per-pick cell colour from current scores using the simple win/loss/draw mapping. Cup-specific saved_by_life / draw_success outcomes only appear post-settlement (they need streak/lives context).

## Game-creation guard

Cup mode on `group_knockout` competitions requires every team to carry an `external_ids.fifa_pot`. Game creation refuses if any team is missing — without it `computeTierDifference` silently returns 0, breaking the lives mechanic across the board. See `/api/games/route.ts`.

## Pick validation

`validateCupPicks` (`src/lib/picks/validate.ts:72`):
- Player must be `alive`.
- Round must be the game's current round.
- `now <= deadline`.
- 1 ≤ picks ≤ `numberOfPicks` — **partial rankings allowed**.
- Fixtures unique; ranks 1..picks.length contiguous from 1.
- Per pick: `tierDiffFromPicked` ≤ 1 — `>1` (huge favourite) is rejected.

## Mode config

```ts
{
  numberOfPicks?: number  // max picks per round, partial rankings allowed
  startingLives?: number  // default 0 — lives are earned, not handed out
}
```

## Cancellation

When a cup pick's fixture is cancelled, `pick.result = 'void'`, `life_gained=0`, `life_spent=false`. The whole-game re-eval (`reevaluateCupGame`) iterates rank-ordered and explicitly skips voided picks. Streak/lives state at the next rank picks up from the previous non-voided rank — voided picks contribute nothing positive or negative.

No automatic round-void in cup; admin refunds via the existing endpoint if needed.

See [`docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md`](../superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md).

## Smoke coverage

`scripts/smoke/lifecycle.smoke.test.ts`, `lifecycle: cup-WC`:

- 3-tier underdog wins → +3 lives persisted on the pick, `gamePlayer.livesRemaining` updated.
- Re-eval idempotency: settling the same fixture twice produces the same state.

Not yet covered:
- 1-tier and 2-tier underdog wins.
- Draw success / saved-by-life paths end-to-end.
- Streak-broken state propagating across remaining picks.
- Cup mode on `knockout` competition (FA Cup) — confirms tier-diff=0 path.
- Multi-round cup with advancement.
- Cup pick on a fixture that finishes out of confidence-rank order (re-eval correctness).
