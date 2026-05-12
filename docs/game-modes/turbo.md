# Turbo mode

Predict N fixtures (default 10) in a single round, ranked by confidence. Highest streak wins. Single-round format — the game auto-completes when the round is fully settled.

> Read [README.md](./README.md) first for the cross-cutting settlement model.

## Pick mechanics

- **Picks:** exactly `modeConfig.numberOfPicks` (default 10) — submitted in one request, no partial rankings.
  - `predictedResult`: `home_win` / `draw` / `away_win`
  - `confidenceRank`: 1..N, no duplicates, no gaps
- **Win condition:** longest streak of correct predictions sorted by rank ascending — first wrong prediction ends the streak; later corrects don't count.
- **Tiebreaker:** longest streak first, then total goals in streak.

## Settlement (per fixture)

Each fixture transition settles its turbo picks immediately:

```mermaid
sequenceDiagram
    participant Trigger as fixture.status → finished
    participant Settle as settleFixture
    participant Settle1 as settleTurboPickRow
    participant Complete as checkAndMaybeCompleteOrAdvance

    Trigger->>Settle: fixtureId
    Settle->>Settle1: per turbo pick on fixture
    Settle1->>Settle1: pick.result = predictedResult === actualOutcome ? 'win' : 'loss'
    Settle1->>Settle1: pick.goalsScored = pickedSide goals if correct (sum on draw)
    Settle->>Complete: per game touched
    Complete->>Complete: all round fixtures finished?
    alt yes
        Complete->>Complete: collectTurboPlayerResults → evaluateTurboPicks per player
        Complete->>Complete: applyAutoCompletion (turboTiebreaker)
        Complete->>Complete: round.status = completed
    else no
        Complete->>Complete: wait for remaining fixtures
    end
```

**Per-fixture settle, round-batched completion.** A turbo pick is settled (`win` or `loss`) the moment its fixture finishes. The round completion + winner determination wait for every fixture in the round to be settled — turbo's streak is rank-ordered across all picks.

## Player state machine

```mermaid
stateDiagram-v2
    [*] --> alive
    alive --> winner: applyAutoCompletion (turbo-single-round; turboTiebreaker selects winners)
    note right of winner
        Turbo never eliminates mid-round.
        Multiple winners possible on perfect tie (split pot).
    end note
```

## Live projection

For an in-progress fixture:

- **Per pick:** `LivePick.projectedOutcome` is `winning` (current actual outcome matches the prediction) or `losing` (doesn't).
- **Per player:** `LivePlayer.projectedStreak` walks the player's picks in rank order, counting in-progress ones that are currently correct. Stops at the first projected incorrect pick. `getTurboStandingsData` also returns `streak` + `goals` that include in-progress projection — open-round views update live.
- **Cell visuals:** turbo ladder cells use the same `'win'` / `'loss'` rendering for projection as for settled. The pulsing `LIVE` / `HT` indicator on the fixture card communicates that the result isn't final.

## Pick validation

`validateTurboPicks` (`src/lib/picks/validate.ts:120`):
- Player must be `alive`.
- Round must be the game's current round.
- `now <= deadline`.
- **Exactly `numberOfPicks` picks** — no partial rankings (unlike cup).
- Fixtures unique; ranks 1..N contiguous, no gaps.

## Mode config

```ts
{
  numberOfPicks?: number // default 10
}
```

## Cancellation

When a turbo pick's fixture is cancelled, `pick.result = 'void'` and the streak evaluator walks past it as if it weren't in the input. A 10-pick turbo with one cancelled fixture effectively becomes a 9-pick game — the streak counts ranks 1..(k-1) plus rank (k+1)..N, skipping the voided rank entirely.

No automatic round-void in turbo; admin refunds via the existing endpoint if the situation calls for it.

See [`docs/superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md`](../superpowers/specs/2026-05-12-fixture-cancellation-handling-design.md).

## Smoke coverage

`scripts/smoke/lifecycle.smoke.test.ts`, `lifecycle: turbo-PL`:

- Per-fixture settle: pick 1 settles after fx1; pick 2 stays pending; game stays active. Then pick 2 settles after fx2 → game auto-completes.

Not yet covered:
- Multi-player turbo with split pot on tied streaks.
- All-correct streak (longest possible).
- Streak-break-at-rank-1 (zero streak).
