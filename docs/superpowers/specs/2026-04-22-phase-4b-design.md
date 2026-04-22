# Phase 4b Design Specification

## Overview

Phase 4b delivers the remaining pick-and-standings surfaces needed for playable classic and cup modes, plus the payment tracking flow that turns "my friend says they paid" into auditable state. By the end of Phase 4b, the app is feature-complete for everyday use — what's left in Phase 4c is match-day live UI, admin tooling, rebuys, and mobile polish. Prod deploy is Phase 4.5, at the end.

Phase 4b is one coherent feature branch. Internally it runs in three strict sub-phases:

1. **4b1 — Cup mode UI:** pick interface + ladder + grid + timeline. Cup mode has no player-facing UI yet (the game engine exists from Phase 2); 4b1 builds every surface a player or spectator needs to play it.
2. **4b2 — Classic pick planner:** chain ribbon + collapsible future-round planner + per-side cascading used-state + auto-submit. The `planned_pick` table exists from Phase 1; 4b2 makes it useful.
3. **4b3 — Payment claim flow:** schema migration (add `'claimed'` status + `claimedAt`), player self-claim + admin confirm/reject/override, pot calculation fix. Applies to every game mode.

No sub-phase is released independently — the branch merges once, stays dormant on `main`, and comes alive at Phase 4.5.

---

## Sub-phase 4b1: Cup mode UI

### Cup pick interface

Extends the existing turbo two-zone layout with cup-specific mechanics. The left zone is the fixture list; the right zone is the ranked picks. Mobile stacks vertically with turbo's up/down arrow reorder pattern.

**Tier pips (fixed-size inline-block circles):**
- 3 pips per fixture for WC (max tier difference = 3: Pot 1 ↔ Pot 4).
- Filled pip for each step of tier difference in the underdog's favour. A Pot 1 vs Pot 4 fixture reads `●●●`; Pot 2 vs Pot 3 reads `●○○`.
- Rendered as 8×8 px circles with consistent sizing regardless of filled/empty state.

**Heart icon (red, #dc2626):**
- Displayed only on fixtures where tier difference ≥ 2 — i.e. where backing the underdog earns a life.
- Placed left of the tier pips on the fixture card; appears inline in the ranked-list meta row for picks on life-earning fixtures.

**+N badge:**
- Amber-tinted (`bg:#fef3c7 fg:#92400e`) for ≥ +2 (life-earners).
- Neutral-grey (`bg:#f3f4f6 fg:#374151`) for +1 (no life earned on correct pick but still a valid upset pick).

**Pick restriction:**
- A side cannot be picked if it is more than 1 tier higher than its opponent (e.g. Pot 1 side in a Pot 1 v Pot 3 fixture is greyed and non-interactive). The weaker side remains pickable as an underdog.
- Visual: opacity 0.4, cursor:not-allowed, "Restricted — 3 tiers higher" label under the team name, grey border-stripe instead of team-colour stripe.
- Server-side: `validateCupPick` enforces the same rule and returns a typed error. Phase 2's cup game engine already computes `tier_diff_from_picked` and marks `restricted`; 4b1 exposes that at the pick-submission API layer.

**Lives display + projection:**
- Persistent strip at the top of the pick page, always visible.
- Hearts: filled red dot per remaining life, hollow outlined dot for max-lives headroom (e.g. 2/3 = ●●○).
- Projection text on the right: "If all correct: +N → M lives" where N is the sum of life-gains available from the current ranked picks and M is the resulting total. Updates live as picks are added, removed, or reordered.

**Ranked list:**
- Reuses the turbo ranked-item component verbatim: large serif rank numeral on the left, team-and-prediction description in the middle, drag grip (desktop) / up-down arrows (mobile) on the right.
- Cup adds a meta row under the description: heart (if applicable) + tier pips + +N + life-outcome hint ("life-earner" / "safe" / "upset").

**Team presentation:**
- Circular badge on every team: 26 px diameter desktop, 22 px mobile. Background = team primary colour; 3-letter code in white.
- Full team name rendered next to the code on the fixture buttons (space-permitting), always present on the ranked list.
- Actual crests from football-data.org's `crest` field replace the colour+code fallback when available. No custom asset work — whatever the adapter populates on `team.badge_url` is what's rendered. Coloured circle is the fallback when `badge_url` is null.

**Already-picked fixtures** remain visible in the fixture list but ghosted (opacity 0.7, background `#fafaf9`) with a green "✓ RANKED #N" tag in the top-right of the card. Prevents the list shrinking as you fill ranks, so the overall allocation is always visible.

### Cup standings — three views

Parallel to turbo standings, same three-tab structure: **Ladder / Grid / Timeline**. Tab switcher reuses the existing `TurboStandings` component's chrome.

#### Ladder (fixture-centric)

Built on the same shape as `turbo-ladder.tsx`. Additions:

- **Podium** at the top adds a lives row: three dots (filled/empty for remaining) next to the streak + goals line.
- **Tier strip** on every fixture card: heart (if applicable) + pips + +N badge + prose ("Pot 1 v Pot 4 — huge life-earner on a MAR pick").
- **Backers grouped by side** (existing pattern) with per-player result badges tailored for cup:
  - `+N lives` (green) on upset wins where lives were earned
  - `correct` (green) on safe wins with no life change
  - `saved -1 life` (amber) on saved-by-life
  - `upset` (purple) on still-to-play underdog picks
  - `last life` (red) where a player has 0 lives left and this pick decides them
- **Crucial-fixture banner** extends turbo's definition: a fixture is "key" if (a) it splits predictions across at least two outcomes with 2+ players on each, OR (b) a 0-lives-left player has their pick on it, OR (c) the swing between "all back favourite" and "upset" changes the leader.

#### Grid (leaderboard)

Player × rank matrix. Columns: `#`, `Player`, `Lives`, `🔥 Streak`, `⚽ Goals`, then one column per rank (max 10 for WC, fewer for domestic cup).

- **Lives column:** three fixed-size hearts (filled red = remaining, hollow grey = spent) plus `N/M` counter. Red `0/3 ⚠` treatment for no-lives-left players.
- **Cell colour:** green (correct), amber (saved-by-life), red (wrong + no life to spend = eliminates), grey (pending), dashed-grey (no pick).
- **Life bubbles on cells:** small green pill top-right for life-gain (`+2`), amber pill for life-spend (`-1`). Doesn't interfere with team name + +N in the cell body.
- **Eliminated players** separated below a dashed divider, dimmed to 0.5 opacity, ordered by elimination round. Final streak + goals preserved for the record.
- **Hasn't-picked state:** yellow "NO PICKS" badge on name, cells all dashed-grey empty, streak/goals em-dashed.

#### Timeline

Mirrors turbo-timeline kickoff-slot × player layout with lives annotations. Each cell gains a thin coloured vertical bar on its right edge: green = life gained here, amber = life spent here. Players with 0 lives get a red dot next to their name as a ticker of vulnerability.

### Data queries

New in `src/lib/game/detail-queries.ts`:

- `getCupStandingsData(gameId, viewerUserId)` — players with current `livesRemaining`, `streak`, `goalsInStreak`, + per-pick outcomes including `livesGained`, `livesSpent`, and the derived `result` enum (`win | saved_by_life | loss | pending | hidden`).
- `getCupLadderData(gameId, viewerUserId)` — same payload as turbo ladder, plus per-fixture tier difference and per-prediction life-outcome annotations.

Both respect the existing `hideAllCurrentPicks` option for open rounds where picks are hidden from other players until deadline passes.

### Server-side validation

`src/app/api/picks/[gameId]/[roundId]/route.ts` — cup branch calls `validateCupPick` (already exists in Phase 2 game logic) to reject restricted picks. The API returns `{ error: 'restricted', side: 'home'|'away' }` when a client tries to submit a disallowed side.

### Sharing (deferred)

Phase 4 design spec called for a Satori cup-standings share template in 4b. Moved to 4c so the share-template expansion happens as one consolidated piece. 4b1 leaves `onShare` as a noop on the cup standings panel; 4c wires it up alongside the turbo/live/winner variants.

---

## Sub-phase 4b2: Classic pick planner

### Chain ribbon

Horizontal strip at the top of the classic pick page, above the current-round card. Scrollable on narrow screens. Shows every gameweek of the competition as a slot:

| State | Visual |
|---|---|
| Past win | Green bg, green border, team badge + `✓` |
| Past loss | Red bg, red border, team badge + `✗` |
| Past draw | Amber bg, amber border, team badge + `=` |
| Current round | Bold green outline (2 px), team badge, "NOW" label |
| Planned + auto-submit | Solid purple border, purple-tinted bg, team badge, "AUTO" label with lock icon |
| Planned (tentative) | Dashed purple border, pale purple bg, team badge, no label |
| Empty (future, no plan) | Grey dashed border, `?` glyph |
| Fixtures TBC | Dashed grey, 0.5 opacity, no interaction |

Summary strip above the ribbon: `N played · M planned · X of 20 teams available`. Legend runs along the right edge.

### Fixture rows (both sides pickable)

Each fixture in the current round AND in every future round shows home + v + away. Both sides are independently selectable. Current pick (or planned pick) highlights one side only; the other side stays pickable as an alternative.

Per-side state:

| State | Visual |
|---|---|
| Current pick (this round) | Green bg + green border + "CURRENT" chip |
| Planned + auto-submit (future) | Solid purple border + purple-tinted bg + lock chip |
| Planned tentative (future) | Dashed purple border + pale purple bg + "TENTATIVE" chip |
| Used in past round | Opacity 0.4, strikethrough, red "USED GW3" tag |
| Planned ahead in another future round | Opacity 0.4, strikethrough, purple "PLANNED GW27" tag |
| Available | Normal styling, team-colour border stripe |

Per-side used-state is the key visual departure from the current `classic-pick.tsx`. A single fixture can have one side blocked (e.g. "PLANNED GW27") while the other is free. Prevents the "this fixture looks half-unavailable — why?" moment.

### Planner section

Lives below the current-round card, separated by a dashed horizontal rule and a "Plan ahead" section heading. Collapsible with a `Collapse ▲ / Expand ▼` button — remembered per user via localStorage so the default visual is stable across page loads.

- Shows the next 3 future rounds by default. More rounds can be revealed via a "Show more" button, capped at 6.
- Per-round card header: gameweek label + date + per-round auto-submit toggle.
- Rounds whose fixtures aren't yet published (source adapter's `event.deadline_time` exists but fixtures aren't populated) render as "Fixtures TBC" cards, greyed to 0.55 opacity, non-interactive.

### Data model

`planned_pick` table already exists (Phase 1 schema). Phase 4b2 populates it and reads it:

- `gamePlayerId` — FK to game_player
- `roundId` — FK to round
- `teamId` — FK to team
- `autoSubmit: boolean` — per-round toggle
- `createdAt` — timestamp

Unique index on `(gamePlayerId, roundId)` means a player has at most one plan per round; upsert replaces.

### API routes (new)

- `POST /api/games/[id]/planned-picks` — body `{ roundId, teamId, autoSubmit }`. Upserts a plan. Validates that teamId isn't already used in a completed round or planned in another future round.
- `DELETE /api/games/[id]/planned-picks/[roundId]` — removes a plan.
- `GET /api/games/[id]/planned-picks` — returns the viewer's plans for this game.

Server-side validation enforces the cascade: attempting to plan Chelsea for GW28 when Chelsea is planned for GW27 returns `{ error: 'team-already-planned', roundId: <gw27-id> }`.

### Auto-submit execution

When a round's deadline approaches, any `planned_pick` with `autoSubmit = true` should be submitted as a real pick. Two parts:

1. **Scheduling** — when a round transitions from `upcoming` to `open` (detected in daily-sync), scan `planned_pick` for matching rows and enqueue a QStash `auto_submit` message for `deadline_time - 60s`. Message body: `{ type: 'auto_submit', gamePlayerId, roundId, teamId }`.
2. **Handler** — `qstash-handler/route.ts` gains a new `auto_submit` case. Writes a real pick (goes through the normal classic pick validation to reject invalid state, e.g. team-already-used by a pick that beat this one to the punch) and removes the `planned_pick` row on success.

This depends on QStash being live — which it isn't until Phase 4.5. For Phase 4b2, the scheduling + handler code lands dormant. Auto-submit will actually fire the first time after 4.5 lands and the first round transitions to `open` with QStash listening. Between 4b2 merge and 4.5 deploy, `autoSubmit=true` is visually honoured in the UI but won't automatically submit — which is fine because there's no production environment where rounds are transitioning during that window.

### Components

- `src/components/picks/chain-ribbon.tsx` — scrollable ribbon
- `src/components/picks/planner-round.tsx` — single future-round card with both-sides fixtures
- `src/components/picks/fixture-row.tsx` — extend the existing component to support per-side state chips (`USED GW3`, `PLANNED GW27`, `CURRENT`, `TENTATIVE`, lock icon)
- `src/components/picks/classic-pick.tsx` — integrate `chain-ribbon` above and `planner-round` cards below the current-round fixtures

---

## Sub-phase 4b3: Payment claim + admin confirm

### Schema migration

Single migration (additive, non-destructive):

```sql
ALTER TYPE payment_status ADD VALUE 'claimed' BEFORE 'paid';
ALTER TABLE payment ADD COLUMN claimed_at timestamp;
```

Drizzle schema update in `src/lib/schema/payment.ts` extends the enum and adds the column. `paymentStatusEnum` becomes `['pending', 'claimed', 'paid', 'refunded']`.

State transitions:

| From | Action | To |
|---|---|---|
| pending | player clicks "Mark as paid" | claimed |
| claimed | admin confirms | paid |
| claimed | admin rejects | pending |
| paid | admin reverts | pending |
| any | admin override | any (including back to pending) |

### API routes (new)

- `POST /api/games/[id]/payments/claim` — player self-claim for their own entry-fee payment. Only allowed when current status is `pending`. Sets `status = 'claimed'`, `claimedAt = now()`.
- `POST /api/games/[id]/payments/[userId]/confirm` — admin action. Only allowed from `claimed`. Sets `status = 'paid'`, `paidAt = now()`.
- `POST /api/games/[id]/payments/[userId]/reject` — admin action. Only allowed from `claimed`. Sets `status = 'pending'`, clears `claimedAt`.
- `POST /api/games/[id]/payments/[userId]/override` — admin-only escape hatch. Body `{ status: 'pending' | 'claimed' | 'paid' }`. Sets status directly.

Authorization:
- The `claim` route checks `game_player.userId = session.user.id` — you can only claim your own payment.
- The `confirm`, `reject`, `override` routes check `game.createdBy = session.user.id` — admin actions are creator-only.
- A user who is both creator and player can self-confirm (shown in the mockup as Dave's "Self-confirmed" row).

### Pot calculation fix

`calculatePot` in `src/lib/game-logic/prizes.ts`:

```typescript
// Before (Phase 1)
export function calculatePot(entryFee: string | null, playerCount: number): string {
  if (!entryFee) return '0'
  return (parseFloat(entryFee) * playerCount).toFixed(2)
}

// After (Phase 4b3)
export function calculatePot(payments: Array<{ amount: string; status: string }>): {
  confirmed: string       // sum where status = 'paid'
  pending: string         // sum where status = 'claimed'
  total: string          // confirmed + pending
} {
  const paid = payments.filter(p => p.status === 'paid')
                       .reduce((s, p) => s + parseFloat(p.amount), 0)
  const claimed = payments.filter(p => p.status === 'claimed')
                          .reduce((s, p) => s + parseFloat(p.amount), 0)
  return {
    confirmed: paid.toFixed(2),
    pending: claimed.toFixed(2),
    total: (paid + claimed).toFixed(2),
  }
}
```

Every caller of `calculatePot` updates to load the game's payment rows and pass them in. Test suite adds cases for mixed states and multiple payment rows per player (rebuy pre-wiring). `'refunded'` payments are ignored by this calculation; refund handling is out of scope for 4b3 and can be added if/when Phase 5 needs it.

### UI components

**Player-facing (everyone sees):**

- `src/components/game/my-payment-strip.tsx` — placed inside the game header card, above the tabs. Three states:
  - `pending`: grey "UNPAID" chip + `£X owed to <creator>` + "Mark as paid" button
  - `claimed`: amber "⏱ AWAITING CONFIRMATION" chip, no actions
  - `paid`: green "✓ PAID" chip, no actions
- `src/components/game/other-players-payments.tsx` — below the pot display, a compact list of every player's chip (no actions). Visible to everyone so the group has collective accountability.
- Pot header in `src/components/game/game-header.tsx` — split display: confirmed total (primary, big number) + annotation "£20 awaiting confirmation · £10 unpaid · £100 target".

**Admin-only (creator sees):**

- `src/components/game/payments-panel.tsx` — dedicated section on the game detail page. Two blocks:
  - **Needs your attention** — pending-claims first, amber-highlighted, with Confirm + Reject buttons per row.
  - **All payments** — every player's status, with Revert on paid rows, WhatsApp-reminder on pending rows.
- `src/components/game/payment-reminder.tsx` — WhatsApp share-link builder. Takes `{ gameName, amount, creatorName, inviteCode }`, produces `wa.me/?text=<encoded>` URL. Default template:
  > Hi! Reminder: you owe £{amount} for {gameName}. When you've paid, hit "Mark as paid" in the app: {inviteUrl}.

### Rebuy preparation

Phase 4c adds paid rebuys (classic only). 4b3 doesn't implement rebuys, but the payment panel's UI includes a "REBUY" chip-slot next to the status chip for forward compatibility. Schema-wise, rebuys are just another payment row scoped to the same `game_player`, and `calculatePot` sums them all.

---

## Dependencies between sub-phases

- 4b1 is independent. Can ship alone.
- 4b2 is independent. Can ship alone.
- 4b3 is independent from 4b1 and 4b2 but touches the game header card that 4b1's cup pick interface and 4b2's classic planner also touch — coordinate the header edits to avoid merge conflicts within the phase branch.

Within the single Phase 4b branch, execute 4b1 → 4b2 → 4b3.

## Out of scope (Phase 4c or later)

- **Satori share templates** for cup standings and other variants — 4c.
- **Match-day live UI** consuming `/api/games/[id]/live` — 4c.
- **Paid rebuys** (classic only) — 4c.
- **Admin: add player / make pick for player / split pot** — 4c.
- **Mobile breakpoint polish** — 4c surfaces pass through a dedicated polish task.
- **Mangopay / automated payment processing** — Phase 5.
- **Automated payment-reminder delivery** (WhatsApp Business API, email) — Phase 5. 4b3 delivers manual WhatsApp-share only.
- **Event table + notification feed** — 4c.

## Risks

- **Cup mode has never been played end-to-end in this project.** Phase 2's game engine is unit-tested but 4b1 is the first time a human will actually submit cup picks and see results flow through the UI. Expect integration bugs in the edge cases (e.g. ties resolved by penalty shootouts — Phase 4a decision was to treat draws as not-eliminated; verify this doesn't look broken in the UI when it happens).
- **Classic planner auto-submit is QStash-dependent.** If Phase 4.5 slips, planner auto-submit doesn't fire in prod. Mitigation: the UI still shows plans; users can manually submit. Phase 4.5 must land before the PL run-in or friend-group users will start expecting auto-submit.
- **Planned_pick cascade can deadlock if users plan all remaining teams then lose one in the current round.** e.g. plan Chelsea for GW27, then pick Chelsea as current GW26 and it loses — GW27 plan is now invalid. Cascade validation on pick submission flags this; UI should surface a "your plan for GW27 is no longer valid" toast.
- **Pot calc change is a breaking API change.** Every existing consumer of `calculatePot` gets a new signature. Grep for callers during 4b3 and update them all — most are in detail queries and game cards.

## Timing

Single merged branch before Phase 4.5. Expected order of implementation: 4b1 (~2 weeks of effort, biggest chunk), 4b2 (~1 week), 4b3 (~1 week including migration + tests). No prod deploy until 4.5. WC target means Phase 4b + 4c + 4.5 all need to land before 11 June 2026 — about 7 weeks of runway from today.
