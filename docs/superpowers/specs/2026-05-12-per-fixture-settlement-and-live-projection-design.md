# Per-fixture settlement + live projection

**Status:** Draft. Awaiting review.
**Author:** Claude, paired with Sean.
**Date:** 2026-05-12.
**Supersedes:** the closed PR #44 (`fix/lifecycle-reconcile`) which built reconciliation on top of round-batched processing.
**Cross-references:** `docs/superpowers/specs/2026-04-24-phase-4c1-live-match-day-design.md` (Phase 4c1 "as-live" spec — half-built).

---

## tl;dr

Today our app processes picks once, at end-of-round, in `processGameRound`. The predecessor (`premier-league-survivor-picks`) settles picks **as each fixture finishes** via a DB trigger. The divergence is the root cause of the Brighton 3-0-Wolves stuck-state and of every "alive count looks wrong mid-gameweek" symptom.

The Phase 4c1 spec also called for `projectPickOutcome(pick, fixture, mode)` to be wired into the standings UI so players see "as-live" outcomes during a fixture. The pure function exists (`src/lib/live/derive.ts`) and is unit-tested. **No production component consumes it.**

This design fixes both:

1. **Per-fixture settlement** — when a fixture's status flips to `finished`, settle every pick on it in the same transaction, run mode-specific elimination, and check game auto-completion. Match the predecessor.
2. **Live projection** — when a fixture is in-progress, surface `projectPickOutcome` results in `getLivePayload` so standings components can render "winning / drawing / losing" cell indicators and projected aggregates (streak / lives / alive-count).

---

## Audit

### Predecessor (working app) reference

Three SQL functions, two trigger surfaces. From `premier-league-survivor-picks/supabase/migrations/`.

| Function | Trigger | Behaviour |
| --- | --- | --- |
| `process_pick_results_on_fixture_update()` | `AFTER UPDATE ON fixtures` when `finished` flips `false → true` | Iterates every pick on the fixture. Dispatches by `game_mode`: settles `pick.result` + `pick.goals_scored`; for **classic** / **escalating** also eliminates the player if not-a-win (and round > starting gameweek). Finally calls the two finishers below. |
| `check_and_finish_games_after_results(gameweek)` | called from the trigger above | For each active classic/escalating game: counts non-eliminated players in this gameweek. 1 → declare winner. 0 → tiebreaker on total winning goals. |
| `check_and_finish_turbo_games(gameweek)` | called from the trigger above | For each active turbo game: checks **all** fixtures in the gameweek are finished, only then computes per-player streak from settled picks (in `preference_order`) and declares winner / splits pot on tie. |
| `process_cup_results(game_id)` | Manual RPC (admin uploads scores) | Whole-game re-evaluation. Iterates each player's picks in `preference_order`, only over fixtures with both scores. Accumulates streak / lives. Re-runnable; idempotent. Updates `pick.result`, `pick.life_gained`, `pick.life_spent`, `game_players.lives`. |

**Key takeaway:** the predecessor is not uniformly "per-fixture for everything". The dispatch is:

| Mode | Settle picks | Eliminate player | Game completion |
| --- | --- | --- | --- |
| Classic | per-fixture | per-fixture (if non-win after starting gw) | per-fixture (count alive) |
| Escalating | per-fixture | per-fixture (if non-win after starting gw) | per-fixture (count alive) |
| Turbo | per-fixture | n/a (no per-pick elim) | round-batched (need all 10 picks resolved for streak) |
| Cup | whole-game re-eval | n/a (uses streak break + lives) | manual / not auto |

The predecessor has **no realtime subscriptions and no projection of "if scores stay"**. The UX feel is "results show up as soon as fixture is marked finished" via the DB trigger. Our Phase 4c1 ambition (live ticker, projection, per-row LIVE highlight) goes further than what the predecessor does.

### Our app today

Round-batched processing only.

- `processGameRound(gameId, roundId)` (`src/lib/game/process-round.ts:79`) requires every fixture in the round to be finished, then evaluates all picks at once via per-mode evaluators (`processClassicRound`, `evaluateTurboPicks`, `evaluateCupPicks`).
- Reached via exactly one path in production: `poll-scores` route observes a non-finished → finished transition and `enqueueProcessRound` if all fixtures in the round have flipped finished.
- `syncCompetition` (daily-sync cron + bootstrap) silently overwrites `fixture.status='finished'` without enqueuing — bypasses the only trigger. **This is the stuck-Brighton root cause.**
- `/api/cron/process-rounds` exists as an unscheduled manual safety-net.

Consequences:
- Saturday picks stay `'pending'` until Monday's last fixture finishes.
- Eliminations stay invisible until end-of-round.
- A game can't auto-complete mid-gameweek even when alive count is provably 1.

### Phase 4c1 as-live spec — what's wired vs stubbed

| Spec element (4c1 design doc lines) | Status | Evidence |
| --- | --- | --- |
| `deriveMatchState` (line 45) | ✅ wired | `live-fixture-card.tsx:42` consumes it for `LIVE` / `HT` pill |
| `detectGoalDeltas` (line 43) | ✅ wired | Drives goal celebration animation; tested |
| `detectPickSettlements` (line 44) | ⚠️ wired but inert | Listens for `pick.result` transitions. **Only fires after end-of-round** because that's when the server writes it. With per-fixture settlement it'll start firing in real time. |
| Per-row LIVE highlight (line 150-153) | ✅ wired | `turbo-standings.tsx:231` (`viewerRowIsLive`) and similar in `cup-grid.tsx` / `progress-grid.tsx` |
| Goal celebration (line 139-147) | ✅ wired | `goal-celebration.tsx` |
| Elimination fade + `OUT R{n}` badge (line 156-160) | ⚠️ depends on settlement timing | Fires off `detectPickSettlements`; only useful once settlement is per-fixture |
| Score-bump badge on pick cells (line 154) | ⚠️ unclear | Need to check; secondary |
| **`projectPickOutcome` consumption (line 46)** | ❌ **not wired** | Pure function `src/lib/live/derive.ts:32` exists and is unit-tested; no production component imports it |
| Projected viewer-row aggregates (streak / lives / alive) | ❌ not wired | Standings query computes from settled `pick.result` only |

The half-built spec is the gap that left the user thinking "as-live" worked when it doesn't beyond live scores.

---

## Goals

1. **Match the predecessor's per-fixture settlement semantics** for classic. As fixtures finish, picks settle; players are eliminated where appropriate; the game can auto-complete mid-gameweek.
2. **Turbo: per-fixture pick settlement, round-batched completion.** Persist each pick's result as its fixture finishes (so the in-progress UI can derive a current streak); only declare a winner once every fixture in the gameweek is settled.
3. **Cup: whole-game re-evaluation on each cup-fixture-finished event.** Cheap (~12 picks), idempotent. Settles all settle-able picks in `preference_order`; persists `life_gained` / `life_spent` per pick and updates `lives_remaining` on each player. Game completion checked after each re-eval.
4. **Wire `projectPickOutcome`** through `getLivePayload` → standings components. Surface per-cell projection (`winning` / `drawing` / `losing`) and per-row projected aggregates (`projectedStreak`, `projectedLives`, `projectedAlive`).
5. **Keep `reconcileGameState` as a sweep helper** for genuinely-stuck games (page SSR + `/live` + daily-sync). With per-fixture settlement, it should almost never have anything to do — but it remains as the safety net.
6. **Smoke harness that asserts the right behaviour**: per-fixture state transitions, mid-gameweek completion, live projection.

## Non-goals

- Realtime / WebSocket / SSE. The existing 30s poll on `/live` is sufficient; we're not adding a new transport layer.
- DB triggers in our schema. We use Drizzle migrations + postgres.js; the predecessor's trigger approach doesn't translate cleanly. App-level settlement called from every write site is the right shape for us.
- Reworking the predecessor's `escalating` mode (we don't have one).

---

## Proposed architecture

### Settlement is app-level, not DB-level

We don't have Supabase. Drizzle migrations + postgres.js don't make schema-level triggers idiomatic, and we'd lose the ability to test settlement logic in vitest (it'd require a real DB and SQL fixtures). Settlement lives in TypeScript, called from every place a fixture row gets written.

There are two write sites for `fixture.status = 'finished'`:

- `src/app/api/cron/poll-scores/route.ts` — live-poll observes the transition.
- `src/lib/game/bootstrap-competitions.ts:371-396` — `syncCompetition` mirrors the adapter's finished state.

Both will call `settleFixture(fixtureId)` immediately after the update. Single helper, single source of truth.

### One settlement helper

```ts
// src/lib/game/settle.ts
export async function settleFixture(fixtureId: string): Promise<SettleResult>
```

Behaviour:

1. Load the fixture + all picks referencing it (across all games).
2. For each pick, look up its game's `gameMode`.
3. Dispatch:
   - **Classic** → settle this pick (set `pick.result` + `pick.goalsScored`); if not-a-win and not starting-round-exempt, eliminate the player; check game completion.
   - **Turbo** → settle this pick (`pick.result` based on `predictedResult` vs actual outcome); check whether all turbo round fixtures are now finished — if yes, declare winner via `evaluateTurboPicks` + tiebreaker.
   - **Cup** → call `reevaluateCupGame(gameId)` (the whole-game re-eval, the equivalent of `process_cup_results`); then check game completion.
4. Return a summary of changes (for daily-sync response logging + tests).

The helper is **idempotent**: re-running it after a pick is already settled is a no-op (guard on `pick.result !== 'pending'` for classic/turbo; cup's re-eval naturally produces the same result given the same inputs).

### Round completion is now emergent

`round.status = 'completed'` flips when every fixture in the round is finished AND every pick on those fixtures has been settled. We can either:

- (a) Set it from inside `settleFixture` after the last fixture in the round is settled.
- (b) Compute it on read (derive from fixture statuses).

**Recommendation: (a).** UI gating, planner availability, and the auto-submit lifecycle already read `round.status`. Keep the persisted value, set it inside `settleFixture` after a final-pick check.

### `processGameRound` becomes a "sweep" function

It's still useful — for migrating in-flight games that have picks stuck `'pending'` despite fixtures being `'finished'`, and for any future bulk reprocess. We'll keep it but rewrite it to just call `settleFixture(f.id)` for every finished-but-unsettled fixture in the round. No new logic — it becomes a thin wrapper.

Same for `reconcileGameState`: instead of "call processGameRound if all fixtures finished", it becomes "call settleFixture for any finished fixture with pending picks on this game". Safety net only.

### Live projection: server adds projected fields to `/live` payload

`getLivePayload` already returns fixtures + picks + players. We extend it to add:

```ts
{
  fixtures: [...],
  picks: [...], // unchanged; pick.result is the settled state
  players: [
    {
      id, userId, status, livesRemaining, // already there
      projectedStreak,    // NEW: streak including in-progress fixtures (turbo / cup)
      projectedLives,     // NEW: lives if current scores stayed (cup)
      projectedStatus,    // NEW: 'alive' | 'eliminated' if current scores stayed
    }
  ],
  projectedPickOutcomes: {  // NEW: per-pick projection for in-progress fixtures
    [pickId]: 'winning' | 'drawing' | 'losing' | 'settled-win' | 'settled-loss' | 'saved-by-life' | 'pending'
  }
}
```

Computed purely server-side from the existing `projectPickOutcome` + the mode-specific evaluators (run against in-progress + finished fixtures). No DB writes.

### Standings components consume the projection

- **Classic progress grid (`cup-grid.tsx`, `progress-grid.tsx`):** if the cell's pick has a `projectedPickOutcome` entry, render it with a "as-live" visual state (e.g. soft green for `winning`, soft red for `losing`, neutral for `drawing`). Replace the current blank-on-pending behaviour.
- **Turbo ladder:** show `projectedStreak` alongside `streak` (e.g. `Streak 6 (→ 7 live)`); fixture cells show `winning`/`losing` for in-progress fixtures.
- **Cup ladder / grid:** show `projectedLives` alongside `livesRemaining` (e.g. `Lives 0 (→ 3 live)`); cell-level "winning underdog" badge; `projectedStatus` reflected in row dim/glow.

Exact visuals to be aligned with the 4c1 mockups before implementation.

---

## Per-mode specification

### Classic

| Trigger | Action |
| --- | --- |
| `fixture.status` → `finished` (with scores) | Settle every pick on this fixture. For each: `pick.result = win/loss/draw` via `determinePickResult`; `pick.goalsScored = pickedTeamGoals if win else 0`. |
| Per pick, after settlement | If `result !== 'win'` AND not in starting round (`number !== 1 OR allowRebuys`) → `gamePlayer.status = 'eliminated'`, `eliminatedRoundId = currentRoundId`. WC competition: also run `computeWcClassicAutoElims` to catch players who can't pick anything in remaining rounds. |
| Per game, after eliminations | `checkClassicCompletion`: 1 alive → winner; 0 alive → mass-extinction tiebreaker on the cohort just eliminated. Same logic as today, but invoked per-fixture instead of per-round. |
| After last fixture in round settles | `round.status = 'completed'`; `advanceGameToNextRound`. Same as today's end-of-round handler. |

Notes:
- A player can be eliminated by the first finished fixture of a round (mid-gameweek). The progress grid stops showing their later rounds as pickable.
- "Mass extinction" cohort scoping stays "all eliminated in this round" so the result is stable regardless of which fixture finishes last.

### Turbo

| Trigger | Action |
| --- | --- |
| `fixture.status` → `finished` | Settle every turbo pick on this fixture. `pick.result = win/loss` via `predictedResult === actualOutcome`. `pick.goalsScored` per current rules. |
| All round fixtures finished | Call `evaluateTurboPicks` for each player against their settled picks; persist via `applyAutoCompletion` (no change here vs today). |
| In-progress UI | `projectedStreak` computed from settled picks (in rank order) + the in-progress fixtures' projected outcomes — stop counting at the first projected loss. |

No mid-round elimination — turbo doesn't have one.

### Cup

| Trigger | Action |
| --- | --- |
| `fixture.status` → `finished` for a fixture with cup picks on it | `reevaluateCupGame(gameId)` for every game whose round contains this fixture. |
| `reevaluateCupGame(gameId)` | Mirror `process_cup_results`: for each alive player, iterate picks in `confidenceRank` order, only those whose fixture is finished. Apply `evaluateCupPicks` per-pick (win → lives gained for underdogs; draw → conditional; loss → spend life if available, else streak break). Persist `pick.result`, `pick.life_gained` (NEW column or `goalsScored`-equivalent? — see open question), `gamePlayer.livesRemaining`. Picks on unfinished fixtures stay `'pending'`. |
| After re-eval | `checkCupCompletion` (last-alive / rounds-exhausted / mass-extinction) — invoked per-fixture-finished. |
| In-progress UI | `projectedLives` / `projectedStreak` computed by running `evaluateCupPicks` over **settled + projected** picks (where projected picks use current in-progress scores). |

Open question: do we persist `life_gained` / `life_spent` per pick, or recompute from `pick.result` + tier? Predecessor persists them; our `cup-standings-queries.computeLivesGained` recomputes. Persistence is simpler and matches what the predecessor does. Recommendation: persist, drop the recompute helper.

---

## Edge cases

1. **Fixture rescheduled after settlement.** Adapter reports a `finished` fixture as `live` again, or moves it to a different matchday. Settlement is idempotent on `pick.result`, but a "un-finish" might require reverting elimination + reopening a closed round. **Decision:** treat this as a serious event — surface a warning, don't silently un-settle. This is rare enough to be a manual ops action.
2. **Pick on a fixture that gets cancelled/postponed.** Today `processGameRound` would block forever (fixture never `finished`). With per-fixture settlement, the pick stays `'pending'` indefinitely. Need a path to settle cancelled picks (treat as `'loss'`? Re-prompt the player?). **Out of scope for this design — flag as separate concern.**
3. **Settlement during sync overwrite.** `syncCompetition` already overwrites `fixture.status`. If it transitions a finished fixture back to live (rare; data correction), the elimination already happened. **Decision:** match #1 — manual ops only.
4. **Race between live-poll and sync.** Both can call `settleFixture` concurrently. Idempotent by design (`if pick.result !== 'pending' return`). Cup re-eval is naturally idempotent (recomputes same value). Player elimination guard: `if status === 'alive' set status = 'eliminated'` — second call no-ops.
5. **Cup pick on a fixture finishing OUT of confidence-rank order.** Friday fixture is pick #5; Saturday is pick #1. Saturday finishes first. Re-eval iterates rank-ordered, only finished fixtures. Pick #1 settles (Saturday). Pick #5 stays pending (Friday hasn't finished yet — wait, that's reversed; let me redo). Actually: if Saturday (rank 1) finishes first, we settle rank 1. Rank 5 (Friday) hasn't finished, stays pending. Player's lives state after the settled picks is set. When Friday's fixture finishes, re-eval again — now ranks 1 + 5 both settle; rank 5's outcome may or may not affect streak break depending on rank 2-4 (which may still be pending). This works correctly because re-eval is whole-game and only operates on finished fixtures.
6. **Mass extinction with mid-gameweek timing.** Three alive players. Fixture A finishes — two players' picks lose → eliminated. One alive. Auto-complete fires, declares the one-alive winner. Fixture B finishes — that player's pick is now irrelevant because the game is already completed. Settlement for game.status='completed' games becomes a no-op. **Decision:** guard `settleFixture`'s game-completion-side-effects on `game.status === 'active'`; pick.result + goals still persist for archival purposes.

---

## Migration plan

Existing games on prod have rounds where some fixtures are `finished` but no pick on the round has `pick.result` set (the Brighton stuck-state). One-off:

1. Deploy the new `settleFixture` code.
2. Run a sweep: for every active game, find finished fixtures with pending picks, call `settleFixture(fixtureId)` for each. This is what `processGameRound`-as-sweep-wrapper does — so this is literally:
   ```ts
   const stuck = await db.query.fixture.findMany({
     where: and(
       eq(fixture.status, 'finished'),
       // and exists pick on this fixture with result='pending'
     )
   })
   for (const f of stuck) await settleFixture(f.id)
   ```
3. Verify each game ended up in the right end-state.

`reconcileGameState` (called from page SSR / `/live` / daily-sync) becomes the long-tail sweep — picks up anything missed.

Existing games with already-settled rounds: untouched. The new settlement guards on `pick.result === 'pending'`, so re-running on settled picks is a no-op.

---

## Smoke test plan

The harness from PR #44 had the right shape but tested the wrong thing. Reworked to validate per-fixture behaviour:

**`scripts/smoke/per-fixture-settlement.smoke.test.ts`** — every (mode × competition) combo gets at least:

1. **Single-fixture-of-many finishes** — assert that pick settles immediately, other picks in same round stay `'pending'`, round.status stays `'open'`.
2. **Player eliminated mid-gameweek** (classic only) — round 2, 3 fixtures, one player's pick loses on first finished fixture. Assert their `gamePlayer.status = 'eliminated'` BEFORE other fixtures finish.
3. **Game auto-completes mid-gameweek** — 2 players, one eliminated by first fixture. Alive count = 1. Assert `game.status = 'completed'`, `gamePlayer.status = 'winner'` set on remaining player, **without** the other fixtures having finished.
4. **Cup whole-game re-eval is idempotent** — settle one cup fixture twice; assert player lives + pick.results are stable.
5. **Cup rank-order with out-of-order fixture finishes** — pick #1 on Friday, pick #2 on Saturday. Saturday finishes first; assert pick #2 settles, pick #1 stays pending, lives state matches "treat pick #2 as the only settled pick".
6. **Last fixture in round triggers round complete + advance** — multi-round game. Final fixture finishes. Assert `round.status = 'completed'` and `game.currentRoundId` advances.
7. **Live projection** — fixture in `'live'` state with scores. Assert `getLivePayload` returns the projected pick outcomes and `projectedAlive/projectedLives/projectedStreak` for each player.

CI runs them after the unit suite; local: `just smoke`.

---

## Plan of work

PR sequencing — each independent and reviewable:

1. **PR A: `settleFixture` core** — pure helper + tests + classic dispatch + classic eliminations + classic completion check. Wire into `live-poll` + `syncCompetition`. New smoke scenarios 1-3 + 6. Replace `processGameRound`'s classic branch with a `settleFixture` loop. Stuck-Brighton migration script (one-off).
2. **PR B: turbo dispatch** — turbo branch of `settleFixture`; per-fixture pick settle; round-batched completion preserved. Smoke scenario 1 for turbo.
3. **PR C: cup dispatch** — `reevaluateCupGame`; persistent `life_gained`/`life_spent` columns (or reuse `goals_scored`?); cup completion check. Smoke scenarios 4-5.
4. **PR D: live projection** — extend `getLivePayload`; wire `projectPickOutcome` and per-player projected aggregates. Update standings components. Smoke scenario 7.
5. **PR E: state-machine docs refresh** — rewrite `docs/game-modes/{classic,turbo,cup}.md` to describe per-fixture behaviour. Re-add the "Adding a new competition" checklist (it was in the closed PR #44).

Estimated scope: PR A and D are the heaviest; B and C are mechanical extensions; E is doc-only.

---

## Open questions

1. **Cup pick-detail columns.** Do we add `life_gained: int` + `life_spent: bool` to the `pick` schema (matches predecessor), or keep computing on read? Persistence is cleaner; needs a migration.
2. **Projected aggregates on `gamePlayer`?** Do we persist `projectedX` fields or compute purely from the live payload? Recommend live-only — no DB writes, easier to reason about.
3. **What does "winning" look like on the classic progress grid?** A solid green-tinted cell? A small `→ WIN` chip? Need design tokens / mockup alignment.
4. **Cancelled / postponed fixtures.** Out of scope of this design but a real gap. Flag and tackle separately.
5. **`reconcileGameState` retention.** Once per-fixture settlement covers the happy path, do we keep reconcile? Recommend yes — page SSR call costs ~50ms and self-heals anything that slipped past settlement (network failure on settle, future bugs). The four-trigger pattern from PR #44 is still right; only the helper's *body* changes (call settle instead of processGameRound).

---

## What was scrapped

PR #44 (`fix/lifecycle-reconcile`, closed 2026-05-12) introduced `reconcileGameState` as the primary recovery mechanism for round-batched processing. The mechanism is fine; the architecture is wrong. Closing the PR before merge avoids locking the divergence in with passing tests. Salvageable pieces — to be reintroduced cleanly under this design:

- `reconcileGameState` skeleton (now calls `settleFixture` instead of `processGameRound`)
- Idempotency guard pattern in `processGameRound` (now applied per-pick in `settleFixture`)
- Smoke harness infrastructure (`scripts/smoke/helpers.ts`, `vitest.smoke.config.ts`, `justfile` recipe, CI step)
- State-machine docs (rewritten)
- AGENTS.md playbook (kept as-is)
