# Phase 4c2 Design Specification — Admin UX

## Overview

Phase 4c2 adds the admin-side surfaces that make the app usable in practice: letting a game creator add a late-joining player, make a pick on behalf of a player who missed the deadline, and split the pot across surviving players to end a game. It also plugs two long-standing gaps in the no-pick handling engine — a classic-mode auto-assign rule (lowest-ranked unused team) and a turbo/cup refund-and-eliminate rule.

4c2 is the second of five sub-phases in Phase 4c (match-day live, admin UX, paid rebuys, Satori share variants, mobile polish). It's independent of 4c1 and merges dormant onto `main` ahead of the Phase 4.5 launch.

---

## Scope

**In scope:**
- **Add-player admin action.** Modal opened from a dedicated admin panel on game detail; searches existing users by name/email; adds by `userId`. No new-account creation — admin must ask new users to sign up first.
- **Pick-for-player admin action.** URL-param-driven "acting as" mode on the existing pick page. Reuses `ClassicPick` / `TurboPick` / `CupPick` interfaces with a banner and "Submit as X" button. Validation runs against the target player's history, not the admin's.
- **Split-pot UI.** Confirmation modal wrapping the existing `POST /api/games/[id]/admin/split-pot` route (from Phase 2). Shows per-winner payout, alive-player list, irreversibility warning.
- **Engine rule 1 — admin un-elimination.** When an admin submits a pick for a player whose `eliminatedReason === 'missed_rebuy_pick'`, the server flips them back to `alive` in the same transaction as the pick write.
- **Engine rule 2 — classic auto-pick on deadline-lock.** When a classic round transitions to `live`, any active player without a pick gets auto-assigned the lowest-ranked team (by current league position) they haven't used yet. Pick is stamped `isAuto: true`.
- **Engine rule 3 — turbo/cup refund-and-eliminate on deadline-lock.** Same trigger, different outcome: no pick → player eliminated with `eliminatedReason: 'no_pick_no_fallback'`, their `paid`/`claimed` payment marked `refunded`.
- **Auto-pick visual marker.** Amber dashed treatment on pending cell + persistent "AUTO" ribbon post-settlement on all standings grids (cup-grid, turbo-standings, progress-grid).
- **Auto-pick one-time player notification.** Dismissible banner on game detail when the viewer's current-round pick is auto-assigned and they haven't dismissed it.

**Out of scope:**
- Paid rebuys (4c3).
- Admin remove-player with history cleanup — `admin_removed` enum value reserved but no UI path.
- Admin ownership transfer.
- New-account-by-email invite flow.
- Email / push notifications on auto-pick.
- Caching layer for league standings beyond the `team.league_position` column update.

---

## Architecture

Single feature branch (`feature/phase-4c2-admin-ux`), merging dormant onto `main` before Phase 4.5. No new framework primitives — just modals, URL-param mode-switching, one new admin-only panel component, and two deadline-hook additions to the existing daily-sync cron (Phase 4a). Database migration adds one flag column (`pick.is_auto`), one enum-shaped text column (`game_player.eliminated_reason`), one integer column (`team.league_position`), and one timestamp column (`payment.refunded_at`).

---

## Components

### New

| Path | Responsibility |
|---|---|
| `src/components/game/admin-panel.tsx` | Always-visible-to-admin card below standings. Houses game-wide action buttons (+ Add player, Split pot). Sits next to the 4b payments-panel. |
| `src/components/game/add-player-modal.tsx` | Modal opened from the admin panel. Search by name/email → live-filtered results (max 10) → select → submit. Post-submit success state offers "Pick for X now" chain into the pick page. |
| `src/components/game/split-pot-modal.tsx` | Confirmation modal. Shows pot.total, per-winner amount, list of alive players who'll be marked winners, irreversibility warning. Green "Split £X across N winners" confirm. |
| `src/components/game/acting-as-banner.tsx` | Contained card banner rendered on the pick page when `?actingAs=...` URL param is present and the viewer is the game admin. "Admin mode · Picking for X" + "Exit admin mode" CTA. |
| `src/components/game/auto-pick-banner.tsx` | One-time dismissible banner shown on game detail when the viewer's own current-round pick has `isAuto=true` and its id is not in `localStorage.dismissedAutoPicks`. |
| `src/lib/game/auto-pick.ts` | Pure function: `pickLowestRankedUnusedTeam({ fixtures, usedTeamIds, teamPositions }) → teamId \| null`. Fully unit-tested. |
| `src/lib/game/no-pick-handler.ts` | Orchestrator invoked from the daily-sync deadline-lock path. Loads no-pick players per newly-live round; delegates to engine rules 2 (classic) or 3 (turbo/cup). |
| `src/app/api/games/[id]/admin/add-player/route.ts` | POST. Admin-gated via `game.createdBy === session.user.id`. Body: `{ userId: string }`. Inserts `gamePlayer`. 409 if duplicate, 404 if user not found, 403 if not admin. |
| `src/app/api/users/search/route.ts` | GET `?q=<query>`. Auth-gated (any session). Returns up to 10 users matching name or email (case-insensitive prefix match). Response shape: `{ id, name, email }[]`. |

### Modified

| Path | Change |
|---|---|
| `src/components/game/game-detail-view.tsx` | Admin-only: render `<AdminPanel />` below standings. Render `<AutoPickBanner />` at top of body when viewer's pick qualifies. |
| `src/components/standings/progress-grid.tsx` | Add contextual `✎` icon button on rows where player hasn't picked in the current open round (admin-only). Add auto-pick amber-dashed treatment + "AUTO" ribbon on pick cells with `isAuto=true`. |
| `src/components/standings/cup-grid.tsx` | Same contextual `✎` pattern + `AUTO` ribbon (ribbon unlikely to fire for cup since rule 2 is classic-only, but the prop is threaded through for future parity). |
| `src/components/standings/cup-ladder.tsx` | Contextual `✎` icon on backer chips where player hasn't picked. |
| `src/components/standings/turbo-standings.tsx` | Contextual `✎` pattern. |
| `src/app/api/picks/[gameId]/[roundId]/route.ts` | Accept `actingAs?: string` (gamePlayerId) in the request body. When present, require `session.user.id === game.createdBy` AND that `actingAs` corresponds to an active `gamePlayer` in this game. On successful submit, if target's `eliminatedReason === 'missed_rebuy_pick'`, flip `status` back to `alive` in the same transaction. Response includes `{ unEliminated: boolean }` flag for the UI. |
| `src/app/(app)/game/[id]/pick/page.tsx` (and any pick sub-routes) | Read `?actingAs` URL param. If present and admin, load the target player's pick history and used-teams — not the admin's. Render `<ActingAsBanner />` at page top. |
| `src/app/api/cron/daily-sync/route.ts` | After the existing competition sync completes, invoke `processDeadlineLock()` from `src/lib/game/no-pick-handler.ts`. |
| `src/lib/game/bootstrap-competitions.ts` | When syncing standings, persist each team's latest `league_position`. |
| `src/lib/schema/game.ts` | Add `pick.isAuto: boolean` (default `false`). Add `gamePlayer.eliminatedReason: text` with documented valid values (`'loss'`, `'missed_rebuy_pick'`, `'no_pick_no_fallback'`, `'admin_removed'`). |
| `src/lib/schema/competition.ts` | Add `team.leaguePosition: integer` (nullable; 1-20 for PL). |
| `src/lib/schema/payment.ts` | Add `payment.refundedAt: timestamp` (nullable). `refunded` status already exists in enum from Phase 2. |

---

## Data flow

### Add player
1. Admin clicks "+ Add player" in the admin panel → modal opens, search input autofocuses.
2. Admin types → client debounces 200ms → `GET /api/users/search?q=...` → renders up to 10 results.
3. Users already in this game appear with an "IN GAME" tag and are unselectable.
4. Admin selects a result and clicks "Add X" → `POST /api/games/[id]/admin/add-player` with `{ userId }`.
5. Server validates: session user is game admin; target user exists; not already in game. Creates `gamePlayer` with `status: 'alive'`, `livesRemaining: mode.startingLives`, `joinedAt: now()`.
6. Modal transitions to a success state with two buttons: "Pick for X now" (primary) and "Back to game" (ghost).
7. "Pick for X now" navigates to `/game/[id]/pick?actingAs=<newGamePlayerId>`. "Back to game" closes the modal and refreshes game detail.

### Pick for player
1. Admin clicks `✎` on a player row (contextual, only visible on admin view for players who haven't picked) OR arrives via the add-player success chain.
2. URL: `/game/[id]/pick?actingAs=<gamePlayerId>`.
3. Pick page reads the param; server-side validates admin + that `actingAs` is an active player in this game; loads the target player's picks/used-teams instead of the admin's.
4. `<ActingAsBanner>` renders at the top with Exit CTA → `/game/[id]`.
5. Pick UI renders as normal (classic/turbo/cup) — same validation, same restrictions, just based on the target player's state.
6. Submit button labelled "Submit as X" → `POST /api/picks/[gameId]/[roundId]` with body `{ ..., actingAs: <gamePlayerId> }`.
7. Server writes pick with `isAuto: false` on behalf of the target. Returns `{ pick, unEliminated: boolean }`.
8. If `unEliminated === true`, UI surfaces a toast "X is back in the game".

### Split pot
1. Admin clicks "Split pot" → modal opens.
2. Modal computes pot from game detail data (already loaded); shows total, per-winner amount, list of alive players.
3. Admin confirms → `POST /api/games/[id]/admin/split-pot` (existing Phase 2 route).
4. Game marked `completed`; `payout` rows inserted; alive players flipped to `winner`.
5. Modal closes; `router.refresh()` reloads the game detail view.

### Auto-pick notification (player-side)
1. On game detail mount, client checks `gameData.myPick.isAuto === true` for the current open/live round.
2. Reads `localStorage.dismissedAutoPicks` (JSON array of pick ids). If the pick's id isn't in the array, render `<AutoPickBanner>` at top.
3. User dismisses via `✕` → push pick id to localStorage, hide banner. Never shown again for that pick.

---

## Engine rules

### Rule 1 — Admin un-elimination (classic rounds 1-2 no-pick)
Lives in the pick route on the server. Covers both round 1 (never engaged) and round 2 (declined rebuy) since both land as `eliminatedReason: 'missed_rebuy_pick'`. On successful admin submit for a target player:

```ts
if (target.eliminatedReason === 'missed_rebuy_pick') {
  await tx.update(gamePlayer)
    .set({ status: 'alive', eliminatedReason: null, eliminatedRoundNumber: null })
    .where(eq(gamePlayer.id, target.id))
  return { pick, unEliminated: true }
}
```

No user-facing decision needed; automatic.

### Rule 2 — Classic auto-pick on deadline-lock
Triggered in `processDeadlineLock()` called from daily-sync. **Only fires for classic rounds where `round.number >= 3`.** Rounds 1 and 2 retain the existing "no pick = eliminated" behaviour — round 2 is the rebuy window where not picking is an implicit "I'm not rebuying" signal, and round 1 means you never engaged with the game at all. Both are handled by rule 1 admin un-elimination via pick-for-player.

When a classic round with `number >= 3` transitions to `status: 'live'` (deadline locked):

1. For each active `gamePlayer` on a game using this round who has no pick:
2. Load the player's used-team set (all teams from their prior picks in this game).
3. Load the round's fixtures with team metadata.
4. Call `pickLowestRankedUnusedTeam({ fixtures, usedTeamIds, teamPositions })`:
   - Enumerate all teams appearing in this round's fixtures.
   - Exclude teams in `usedTeamIds`.
   - Return the team with the highest `league_position` value (20 = bottom of PL = lowest rank). Ties broken by team id.
   - Return `null` if no unused team available (shouldn't happen in PL classic but defensively).
5. Insert a `pick` row with `isAuto: true`, fixture derived from which fixture the assigned team appears in, `predictedResult: 'home_win' | 'away_win'` based on which side.
6. If `null` was returned: mark player `eliminated` with `eliminatedReason: 'no_pick_no_fallback'`.

Standings data sourced from `team.league_position` (column added by this phase's migration), updated daily by `bootstrap-competitions.ts` during the existing sync loop.

### Rule 3 — Turbo/cup refund-and-eliminate on deadline-lock
Same trigger, different outcome. For turbo/cup games on the newly-live round with a no-pick active player:

1. Mark player `status: 'eliminated'`, `eliminatedReason: 'no_pick_no_fallback'`, `eliminatedRoundNumber: round.number`.
2. Locate the `payment` row for this entry (most recent row for `gameId + userId` where `status in ('paid', 'claimed')`).
3. If found: update to `status: 'refunded'`, stamp `refundedAt: now()`. If not found: no-op (player never paid).
4. No pick row is written.

---

## Visual design

**Admin panel** — card below standings, admin-only, "Admin · Game actions" header with the chip shown in the 4b payments panel. Two buttons in 4c2: "+ Add player" (primary blue), "Split pot (N alive)" (neutral). Additional admin actions (close game early, kick player) are future-phase scope.

**Contextual row icons** — single `✎` pencil button at the end of a standings row when the player hasn't picked in the current open round. Hover state reveals "Pick for X" tooltip. Only visible to admin. Appears on cup-grid, cup-ladder (backer chips), turbo-standings, and progress-grid.

**Add-player modal** — focused dialogue with backdrop, 340px wide. Autofocused search input, live-filtered results with avatar/name/email, "IN GAME" tag for duplicates, primary "Add X" button reflects selection. Help note explains "Can't find someone? Ask them to sign up first."

**Split-pot modal** — backdrop dialogue. Large green per-winner amount (e.g. "£24.00 each"), split summary ("£120 split 5 ways"), list of alive players with their individual payouts, amber warning that the action is irreversible, green confirm button labelled "Split £X across N winners".

**Acting-as banner** — contained card inside the pick page's normal margins, blue (`#3b82f6`) background, "ADMIN MODE" kicker, avatar + "You're picking for Sam Pepper", "Exit admin mode" CTA on the right. Sits between the page header and the fixture list. Submit button in the pick UI changes text to "Submit as Sam".

**Auto-pick ribbon** — amber dashed border + amber text on pending state; tiny "AUTO" chip (amber bg, white text) top-right of the cell. After settlement the cell flips to its usual win/loss colour, but the "AUTO" chip persists so the provenance is always visible in history.

**Auto-pick banner (player-side)** — one-time dismissible card on the affected player's next visit to game detail. Amber left-border, warning icon, text: "You missed GW12's deadline — we auto-picked West Brom for you. Kickoff is Saturday 15:00. Message the admin if you want to swap."

---

## Schema changes

Single migration:

```sql
ALTER TABLE pick ADD COLUMN is_auto boolean NOT NULL DEFAULT false;
ALTER TABLE game_player ADD COLUMN eliminated_reason text;
ALTER TABLE team ADD COLUMN league_position integer;
ALTER TABLE payment ADD COLUMN refunded_at timestamp;
```

`eliminated_reason` is nullable text (enforced valid values: `'loss'`, `'missed_rebuy_pick'`, `'no_pick_no_fallback'`, `'admin_removed'`) — not a Postgres enum because enum value additions require an `ALTER TYPE` statement-breakpoint and we want to remain flexible. TypeScript types enforce the union.

`team.league_position` is nullable; 1-20 for PL, null for cup competitions (pots, not positions).

`payment.refunded_at` is nullable; stamped alongside a `status: 'refunded'` transition.

---

## Error handling

| Condition | Behaviour |
|---|---|
| Add-player: target already in game | 409 with `{ error: 'already-in-game' }`. Modal shows inline error; user remains selectable to try another. |
| Add-player: target user doesn't exist | 404 (shouldn't happen via search flow; defensive). Modal shows "User not found — refresh and retry." |
| Add-player: non-admin attempts | 403 with `{ error: 'forbidden' }`. Client redirects to game detail. |
| Pick-for-player: `actingAs` references player not in this game | 404 on server. Pick page redirects back to game detail with a "player not found in this game" toast. |
| Pick-for-player: non-admin attempts | 403. Redirect to game detail. |
| Split-pot: game already completed | 400. Modal shows "Game is already completed — nothing to split." |
| Split-pot: fewer than 2 alive players | 400 (existing Phase 2 behaviour). Button disabled in UI when count < 2. |
| Auto-pick: no unused team available | Log a warning; eliminate with `eliminatedReason: 'no_pick_no_fallback'`; continue daily-sync run. |
| Refund: no qualifying payment row | No-op; daily-sync continues. |
| User-search: empty query | Returns `[]` without hitting the DB. |
| User-search: unauthenticated | 401. Client redirects to `/login`. |

---

## Testing

**Pure functions (Vitest):**
- `pickLowestRankedUnusedTeam`: happy path (bottom team returned), all teams used (null), single unused team, position-tie broken by team id, null-position team skipped.
- Rule 1 applicability: returns `true` only for `eliminatedReason === 'missed_rebuy_pick'`.

**API routes (Vitest + route tests, same pattern as Phase 4b):**
- `add-player`: 403 non-admin, 409 duplicate, 404 unknown user, 200 happy path inserts row with correct `livesRemaining` default.
- `users/search`: empty query returns `[]`; long queries cap at 10 results; 401 unauthenticated.
- `picks/[gameId]/[roundId]` with `actingAs`: 403 non-admin, 404 bad player, 200 happy path writes pick and un-eliminates where applicable.

**Engine tests (Vitest, test DB):**
- `processDeadlineLock` classic: no-pick player gets auto-assigned, pick row has `isAuto: true`, `league_position` read from teams correctly.
- `processDeadlineLock` turbo: no-pick player eliminated with correct reason, payment row updated to `refunded`.
- `processDeadlineLock` cup: same as turbo.
- `processDeadlineLock` classic with no unused team: player eliminated with `no_pick_no_fallback`.

**UI (optional; deferred to launch-time smoke):**
- Add-player modal opens, searches, submits, chains to pick page with correct `actingAs` URL param.
- Acting-as banner visible on pick page; Exit CTA returns to game detail.
- Split-pot modal confirms and reloads game as completed.

**Baseline tests before 4c2:** ~226 (post-4c1). **Target after:** ~245.

---

## Risk mitigation

- **`team.league_position` freshness.** If daily-sync fails on the day a deadline falls, we could auto-pick against a stale table. Mitigation: `pickLowestRankedUnusedTeam` treats null `league_position` as "worst" so teams with unknown standings rank highest for auto-assignment; this is wrong-but-safe (a top team might get assigned to a no-picker the first time a deadline hits before sync completes). Flag in 4.5 playbook: verify standings are fresh before the first competitive weekend.
- **Schema changes are additive-only.** No enum extensions, no NOT NULL constraints on existing rows; migration is safe on any Postgres ≥ 12.
- **Admin un-elimination edge.** An admin un-eliminating a player via a rebuy-week pick must fire in the same transaction as the pick write to avoid a partial state where the pick landed but the status flip didn't. Implementation uses a single `db.transaction`.
- **Concurrent no-pick-handler runs.** Daily-sync is invoked by a cron; in principle two near-simultaneous runs could both attempt rule 2 for the same player. Mitigation: the pick insert is gated on a uniqueness constraint (`game_player_id + round_id`); the losing insert fails gracefully and is ignored.
- **Refund on payments with rebuys.** A player might have multiple payment rows (original + rebuy). Rule 3 refunds the latest `paid`/`claimed` row, which is the correct one for the current elimination. Documented as "most recent row wins" semantics.
- **URL-param admin mode discoverable to non-admins.** A non-admin hitting `/game/[id]/pick?actingAs=<otherId>` triggers a 403 server-side; no privilege escalation risk.

---

## Rollout

4c2 merges dormant onto `main` alongside 4a / 4b / 4c1. No production activity until Phase 4.5. Dev verification is full-fidelity — the seed game can be used to exercise all three modals and the ✎ row actions; the deadline-lock engine rules need simulated time jumps via DB mutation (same pattern as 4b's auto-submit verification).

---

## Dependencies on other sub-phases

- **4c2 depends on 4c1:** `useLiveGame` is not a hard dependency, but `game-detail-view.tsx` edits will need to merge around 4c1's `<LiveProvider>` wrapper. Trivial conflict.
- **4c3 (paid rebuys) depends on 4c2:** `paymentId`-keyed admin actions (flagged as a 4b follow-up) should land before rebuys; 4c2 doesn't have to fix that but 4c3 must. 4c2's refund flow is the starting point for 4c3's rebuy flow.
- **4c5 (mobile polish) picks up this work:** admin panel, modals, and the `✎` icon all need narrow-viewport treatment.

---

## Acceptance criteria

A Phase 4c2 PR is ready to merge when:

- [ ] Admin panel renders only for `session.user.id === game.createdBy`; shows three buttons (+ Add player, Split pot, Close game early).
- [ ] Add-player modal searches users, blocks duplicates, adds selected user with correct default state, and offers the "Pick for X now" chain.
- [ ] Pick-for-player URL mode renders the acting-as banner, loads the target player's history, and successfully submits a pick on their behalf.
- [ ] Admin un-elimination (rule 1) fires when the target was eliminated for a missed rebuy pick; confirmed via a DB-state test.
- [ ] Split-pot modal shows correct pot + per-winner figures and successfully marks the game completed.
- [ ] Classic auto-pick (rule 2) assigns the lowest-ranked unused team to a no-pick player; pick row has `isAuto: true`.
- [ ] Turbo/cup refund-eliminate (rule 3) marks player eliminated and stamps the payment `refunded`.
- [ ] Auto-pick pending cell uses amber dashed treatment and shows "AUTO" ribbon; ribbon persists post-settlement.
- [ ] Auto-pick player-side banner appears on first visit after auto-assignment and dismisses to localStorage.
- [ ] `pnpm exec tsc --noEmit`, `pnpm exec biome check`, `pnpm exec vitest run` all clean.
- [ ] `pnpm exec next build` compile + TS phases pass.
- [ ] Migration file (`drizzle/NNNN_*.sql`) generated and committed; applies cleanly on local dev DB via `just db-migrate`.
