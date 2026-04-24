# Phase 4c3 — Paid Rebuys: Design Specification

**Status:** Approved for planning (2026-04-24)
**Phase:** 4c3 — third sub-phase of 4c (match-day live / admin UX / rebuys / Satori / mobile polish)
**Predecessors:** 4c1 (match-day live UI, merged), 4c2 (admin UX + no-pick engine rules, merged)
**Successors:** 4c4 (Satori share variants), 4c5 (mobile polish + a11y sweep)
**Ships:** dormant to `main` via PR; no prod deploy until Phase 4.5

## Overview

4c3 adds **paid rebuys** to classic-mode games: a player eliminated in round 1 (loss or no-pick) can pay again to re-enter for round 2, if the game was created with rebuys enabled. It is a per-game opt-in toggle — games without rebuys behave exactly as they do today.

4c3 also simplifies the payment state machine across the existing join-flow: the player's "Claim paid" action now sets status directly to `paid`, skipping the `claimed → admin confirm → paid` ceremony. Admin intervention becomes exception-only (dispute / override), not every-claim friction.

Finally, 4c3 fixes a flagged fragility from 4c2: admin payment routes currently key on `(gameId, userId)` without ordering and become ambiguous once a user has multiple payment rows. All admin payment routes are refactored to key on `paymentId`.

## Goals

1. Classic players can rebuy once per game, inside round 2's deadline, after being eliminated in round 1.
2. The per-game `allowRebuys` flag mutually excludes the existing round 1 "starting round" exemption — with rebuys on, round 1 losses/no-picks DO eliminate.
3. Payment state machine is simplified: player claim goes straight to `paid`; admin confirm route retires; admin `reject` inverts to `paid → pending` (dispute).
4. Admin payment routes become `paymentId`-keyed, safe for multiple-row-per-user.
5. All changes are additive and gated — `allowRebuys=false` games keep current behavior verbatim.

## Non-goals

- Rebuys for turbo or cup modes — out of scope. Rule 3 refund-on-elimination from 4c2 stays.
- Rebuys in any round other than round 1 → round 2.
- Multiple rebuys per player per game.
- Dashboard-level rebuy card (the game detail page banner is the only surface in 4c3; dashboard treatment deferred to 4c5 if missed).
- A separate `payment.type` column or `rebuyCount` column on `game_player` — rebuy state is derived from payment row count.
- Removing the `claimed` enum value (dormant for historical rows, not worth a migration).

## Scope of changes

### 1. Game creation

Add an `allowRebuys: boolean` field to `game.mode_config` JSONB.

- Default: `false`.
- Shown on the game creation form only when `gameMode === 'classic'`. Label: "Allow paid rebuys (one per player, round 2 only)". Help text: "If on, round 1 losses/no-picks eliminate the player, and they can pay again to re-enter for round 2."
- Stored in `mode_config` alongside `startingLives` and `numberOfPicks` (no schema migration required — JSONB).

### 2. Classic game-logic changes

#### 2.1 Round 1 starting-round exemption — wire up + gate on allowRebuys

**Current reality:** `classic.ts` supports an `isStartingRound` option that spares losses from elimination, but neither `processGameRound` caller passes it today (`cron/process-rounds/route.ts:41`, `cron/qstash-handler/route.ts:12`). In production, round 1 losses already eliminate — the exemption is dormant. The 2026-04-16 game-logic-corrections plan designed the exemption but the wiring never landed in the round processor path.

**4c3 fix:**
- Derive the flag inside `processGameRound` itself (it already loads `game` and `round`), removing the dependence on callers passing it.
- Derivation: `isStartingRound = round.number === 1 && !game.modeConfig.allowRebuys`.
- `classic.ts` is unchanged.
- Callers (cron routes) also unchanged — they no longer need to supply the flag (and the parameter can be removed from the `options` object since it's derived internally).

Net behavior after 4c3:
- `allowRebuys=false` games: round 1 losses DO NOT eliminate (exemption now live).
- `allowRebuys=true` games: round 1 losses DO eliminate (exemption disabled, rebuys available).
- Anyone relying on the current prod behavior (round 1 eliminates regardless) gets a behavior change. This is a correctness fix and matches the original design intent.

#### 2.2 No-pick handling for classic rounds 1 and 2

`src/lib/game/no-pick-handler.ts` currently only handles classic round 3+ (rule 2 auto-pick). Rounds 1–2 fall through — a current gap.

New branches:
- **Classic round 1 + `allowRebuys=true`**: eliminate with `eliminatedReason: 'no_pick_no_fallback'`. No auto-pick (no history to derive fallback from, and the player is now rebuy-eligible by design).
- **Classic round 2**: eliminate with reason determined by rebuy history:
  - If `payment` row count for (gameId, userId) > 1 → `eliminatedReason: 'missed_rebuy_pick'`.
  - Else → `eliminatedReason: 'no_pick_no_fallback'`.
  - (Applies whether `allowRebuys` is on or off — round 2 no-pick always eliminates once we move past rule 2's round 3+ cutoff. This fixes the existing gap.)
- **Classic round 1 + `allowRebuys=false`**: unchanged — falls through, no elimination (existing behavior).

#### 2.3 Pot calculation audit

`src/lib/game-logic/prizes.ts` and any other `calculatePot` callers: audit that the pot sums actual `payment` rows with `status = 'paid'`, not `entryFee × playerCount`. If 4b did not already make this change, fix as Task 1 of the plan.

### 3. Payment state-machine simplification

These changes apply to the existing join-flow payments, not just rebuys.

- **`POST /api/games/[id]/payments/claim`**: currently sets `pending → claimed`. Change to `pending → paid`, set `paidAt = now()`. `claimedAt` stays nullable (populated only on legacy rows). **Now requires a `paymentId` body parameter** — safe for the post-rebuy case when a user has two pending rows at once in theory (edge case, but forces unambiguous targeting).
- **`POST /api/games/[id]/payments/[userId]/confirm`** (admin): **delete**. Route retired; admin panel no longer renders a "Confirm received" button.
- **`POST /api/games/[id]/payments/[paymentId]/reject`** (admin): new semantics — `paid → pending`, clear `paidAt`. UI label: "Dispute claim (mark unpaid)".
- **`POST /api/games/[id]/payments/[paymentId]/override`** (admin): stays. Drop `'claimed'` from the allowed status list. Allowed: `pending | paid | refunded`.
- **`PATCH /api/games/[id]/admin/payments`**: currently does a blanket `update({gameId, userId})` — **delete**. Replaced by `paymentId`-keyed routes above.

### 4. Admin routes become `paymentId`-keyed

Path shape changes from `/api/games/[id]/payments/[userId]/{confirm|reject|override}` → `/api/games/[id]/payments/[paymentId]/{reject|override}` (confirm deleted per above).

- Admin panel already has the full payment row in hand when rendering actions, so it has `paymentId`.
- The `GET /api/games/[id]/admin/payments` list route (returns all payments for a game) stays unchanged — it already returns rows with `id`.

### 5. Rebuy flow

#### 5.1 Eligibility predicate (pure function, reused in UI + API)

Location: `src/lib/game/rebuy.ts` (new).

```ts
function isRebuyEligible(args: {
  game: Game            // includes modeConfig.allowRebuys
  gamePlayer: GamePlayer
  round1: Round         // round.number === 1 in this game
  round2: Round         // round.number === 2 in this game
  paymentRowCount: number
  now: Date
}): boolean
```

Returns `true` iff all of:
1. `game.gameMode === 'classic'`
2. `game.modeConfig.allowRebuys === true`
3. `gamePlayer.status === 'eliminated'`
4. `gamePlayer.eliminatedRoundId === round1.id`
5. `now < round2.deadline`
6. `paymentRowCount < 2`  *(no rebuy yet — using "< 2" rather than "=== 1" because admin add-player (4c2) can produce a `game_player` with zero payment rows; a rebuy from that state creates the first payment row)*

#### 5.2 Player-initiated rebuy API

`POST /api/games/[id]/payments/rebuy`

- Auth: `requireSession()`. User rebuys for themselves (uses `session.user.id`).
- In a `db.transaction`:
  1. Re-fetch game, game_player, round 1, round 2, payment count.
  2. Re-check `isRebuyEligible` inside the transaction.
  3. Insert new `payment`: `status=pending`, `amount=entryFee`, `method=manual`, `createdAt=now`.
  4. Update `game_player`: `status=alive`, `eliminatedRoundId=null`, `eliminatedReason=null`.
  5. Return `{ paymentId, status: 'pending' }`.
- Client then calls the existing claim route with `paymentId` to flip the new payment to `paid`.

The round 1 `pick` row (if any) is **not deleted**. Rebuy undoes the *elimination consequence* of the round 1 result, not the result itself. The pick stays as history, `pick.result` remains whatever it was (`'loss'`, etc.), and the team the player used in round 1 remains unavailable for round 2 (survivor "used team" rule applies unchanged). Only the `game_player` state transitions.

#### 5.3 Admin-initiated rebuy API

`POST /api/games/[id]/admin/rebuy/[userId]`

- Auth: `requireSession()`, creator-only (`game.createdBy === session.user.id`).
- Same transaction as 5.2 but checks eligibility for the target `userId` instead of the session user. Admin still subject to: round 1 eliminated, not already rebought, within round 2 deadline, game has `allowRebuys=true`. Admin cannot force a rebuy outside the window.
- Creates the rebuy payment in `pending` (not `paid`). Admin can then use the normal override flow to flip it to `paid` if payment was taken off-platform.

#### 5.4 Claim route requires `paymentId`

The player's claim route now requires a `paymentId` body parameter. The UI has the payment row in hand when rendering the claim button, so it can always supply it. Eliminates the `(gameId, userId)` ambiguity if a user ever has two pending rows at once (edge case, but defensive). Returns 400 if missing, 404 if the payment row is not the caller's own.

### 6. UI surface

#### 6.1 Game creation form

Add checkbox + help text for `allowRebuys` (classic only). See §1.

#### 6.2 Game detail page — rebuy banner

When `isRebuyEligible(sessionUser, ...)` returns true:
- Banner above standings, styled consistently with 4c2's `ActingAsBanner` / `AutoPickBanner` family.
- Copy: **"You're out of round 1 — buy back in for £[entryFee] before [round 2 deadline]."**
- Primary button: **"Rebuy (£[entryFee])"** → calls `POST /payments/rebuy` → banner updates.

After rebuy initiated (pending payment exists but not paid):
- Banner copy: **"Rebuy payment pending — mark as paid when you've transferred £[entryFee]."**
- Primary button: **"Claim paid"** → calls `POST /payments/claim` with `paymentId` → success toast → banner disappears.

After claim paid: banner gone; player sees the normal round 2 pick UI.

#### 6.3 Admin payments panel updates

- `GET /admin/payments` already returns all rows for the game. Panel groups by `userId`, shows rows sorted `createdAt asc`, labels **#1 Initial** and **#2 Rebuy** (derived from index within the user's group).
- Action buttons (Dispute / Override) call `paymentId`-keyed routes. No "Confirm received" button (route retired).
- New admin-rebuy button per eligible round-1-eliminated player, calling `POST /admin/rebuy/[userId]`.

### 7. Edge cases and invariants

- **Concurrent rebuys** (shouldn't happen, but): eligibility is re-checked inside `db.transaction`, and the `game_player.id` row is touched — Postgres will serialize. A second transaction sees `status=alive` (or `paymentRowCount=2`) and fails the predicate.
- **Admin disputes a rebuy payment**: reject sets rebuy payment `paid → pending`. Player remains `alive` (no automatic re-elimination from dispute). Player must re-claim or admin must resolve. Rationale: disputes are rare and shouldn't yank someone out of the game mid-round; admin can additionally override the game_player back to `eliminated` if needed.
- **Admin overrides a rebuy payment to `refunded`**: no automatic game_player flip back to eliminated in 4c3. Out of scope — can be added as a later admin tool. Record it as a known follow-up.
- **Player rebuys, then round 2 deadline passes without a pick**: no-pick handler (§2.2) stamps `eliminatedReason = 'missed_rebuy_pick'`. Payment stays `paid` (pot keeps the money, matches original app).
- **Game has `allowRebuys=true` but zero players are eliminated in round 1** (all won): no banner ever shown. No-op.
- **Player eliminated in round 1 but game has `allowRebuys=false`**: can't happen today (round 1 exemption prevents elimination) and can't happen in future (exemption remains when rebuys are off). Defensive: if somehow true (e.g., admin removal), eligibility predicate returns false on the `modeConfig.allowRebuys === true` check — no rebuy CTA shown.
- **`missed_rebuy_pick` label edge case**: detection uses `paymentRowCount > 1` at round 2 no-pick time. For the rare admin-added-free player who later rebuys and then misses the round 2 pick, their `paymentRowCount` is 1 (just the rebuy row) → they get `no_pick_no_fallback` instead of `missed_rebuy_pick`. Outcome (elimination) is identical; only the displayed reason string differs. Accepted over adding a schema column.

### 8. Fold-ins from 4c2 follow-ups

- `paymentId`-keyed admin routes — done by §4 (prerequisite Task 1).
- Wrap rule 1 (admin un-elimination) in `db.transaction` — retrofit as part of this work; natural cluster with rebuy transactional code.
- `unEliminated: true` toast — rebuy success reuses the same toast pattern for the "You're back in" moment.

### 9. Testing strategy

**Unit (Vitest, no DB)**
- `src/lib/game-logic/classic.test.ts`: add tests for `isStartingRound=false` on round 1 (losses eliminate). Existing exemption tests stay.
- `src/lib/game/rebuy.test.ts` (new): exhaustive table for `isRebuyEligible` — all 6 predicate conditions flipped individually, plus happy path.
- `src/lib/game/no-pick-handler.test.ts`: add tests for classic round 1 no-pick with `allowRebuys=true`; classic round 2 no-pick with and without prior rebuy (correct `eliminatedReason`).

**API (Vitest + test DB)**
- `rebuy/route.test.ts`: happy path, each eligibility rejection (not classic, rebuys off, alive, eliminated in round 2, window passed, already rebought), transactional rollback on failure.
- `admin/rebuy/route.test.ts`: happy path for admin, 403 for non-creator, same eligibility checks.
- `payments/claim/route.test.ts`: updated for `pending → paid` jump; with and without `paymentId`.
- `payments/[paymentId]/reject/route.test.ts`: updated for `paid → pending` flip; 404 for wrong paymentId; 403 for non-creator.
- `payments/[paymentId]/override/route.test.ts`: updated allowed-status list (no `claimed`).
- Admin `PATCH /admin/payments` — delete file + test file.
- Admin `POST /payments/[userId]/confirm` — delete file + test file.

**Integration (Vitest + test DB)**
- Full rebuy flow: create classic game with `allowRebuys=true` → seed two players → process round 1 with a losing pick → call player rebuy → call claim → verify game_player `alive` with `eliminatedRoundId=null`, round 1 pick row still present with `result='loss'`, two payment rows (`paid` + `paid`), pot = entryFee × 3 (initial 2 + 1 rebuy).

**Manual smoke (dev)**
- Update seed script to create one classic game with `allowRebuys=true`, one player eliminated in round 1. Verify the rebuy banner appears, flow completes, admin panel reflects two-row payment grouping.

### 10. Migration & rollout

- **Schema changes**: none.
- **Data migrations**: none.
- **Backward compatibility**: every existing game defaults to `allowRebuys=false` (key missing from `mode_config` → falsy). No behavior change for current data.
- **Ships dormant to `main`** via PR. No prod deploy until Phase 4.5.

### 11. Out of scope / deferred

- Dashboard "You're out — buy back in" card → 4c5 polish if missed.
- Multiple rebuys per game → future phase; enum and predicate both single-use.
- `payment.type` column or audit ledger → not needed; row count is sufficient.
- Refunds on admin un-rebuy → edge case, not designed for.
- `FplAdapter.fetchStandings` — Phase 4.5 playbook item, unrelated.
- User-search email enumeration hardening — 4c5 or standalone.
- Add-player modal "IN GAME" tag, modal a11y — 4c5.

## Success criteria

1. Creating a classic game with `Allow paid rebuys` checked produces a game where round 1 losses/no-picks eliminate players.
2. An eliminated round 1 player in such a game sees a rebuy banner on the game detail page during the rebuy window.
3. Clicking rebuy → claim paid flips them back to `alive` (clearing `eliminatedRoundId` and `eliminatedReason`), creates a second `paid` payment row, and leaves their round 1 pick row intact as history. Pot grows.
4. Missing the round 2 pick after a rebuy eliminates with `eliminatedReason = 'missed_rebuy_pick'`.
5. Admin payment actions work correctly when users have multiple payment rows (no ambiguous lookups).
6. Player claim flow is one click: "Claim paid" → `paid`. No admin confirm step.
7. Existing games (with `allowRebuys=false`) have identical behavior to today.
8. Test suite passes. Typecheck clean. Biome clean.
