# Phase 4 Design Specification

## Overview

Phase 4 is the pre-release completion phase. It delivers the data pipeline that makes the app live, the remaining game-mode UI, the match-day experience, admin tools, paid rebuys, and payment tracking. By the end of Phase 4 the app is ready for real users to run real games across the 2025/26 Premier League season and the 2026 World Cup.

Phase 4 is split into three sub-plans that can be implemented in order: **4a** (data pipeline + WC competition), **4b** (cup mode UI + pick planner + payment flow), **4c** (match day live + admin UX + rebuys + share templates + mobile polish).

---

## Critical constraint: Vercel cron limits

The free Vercel plan runs cron jobs **at most once per day**. Live score polling during a match window needs much finer granularity. The data pipeline uses a layered approach:

| Mechanism | Use |
|-----------|-----|
| **Vercel daily cron** | FPL team/fixture/deadline sync, form guide refresh, competition state housekeeping. Once a day is plenty. |
| **GitHub Actions scheduled workflow** | Free, 5-minute minimum interval. Calls a protected endpoint on Vercel with a shared secret. The endpoint short-circuits outside match-day windows so it's cheap. Used for live score polling. |
| **Upstash QStash** | Managed delayed-message queue for event-driven scheduling: deadline reminders, post-deadline round processing, "your pick just won" notifications. Free tier is 500 messages/day which easily covers our scale. |
| **Client-side polling** | When a user is viewing the match-day "as it stands" panel, the browser polls a lightweight read endpoint every 30 s. The endpoint returns the current DB state and may opportunistically trigger a sync if data is older than 2 minutes and a fixture is live. Gives active viewers a fresh experience without hammering any single mechanism. |

No paid Vercel upgrade required. No self-hosted worker.

---

## Sub-plan 4a: Data pipeline + World Cup competition

### Goals
- Replace seeded data with real competition data for PL 25/26 and WC 26.
- Get live scores flowing into the DB within 5 minutes during match windows.
- Make match-day views fresh for active viewers via client-side polling.
- Support the World Cup in the data model, including pot-seeding data for the cup mode tier mechanic.
- Add the WC-specific classic-mode auto-elimination when a player runs out of available teams.

### Components

#### External schedulers

**Vercel daily cron** — configured in `vercel.ts`. Hits `/api/cron/daily-sync` once a day. The route:
- Calls the FPL adapter to refresh teams, fixtures, deadlines.
- Calls the football-data.org adapter to refresh form data for each active competition.
- Idempotent; safe to re-run.

**GitHub Actions workflow** — `.github/workflows/live-scores.yml`. Triggers every 5 minutes. Calls `POST /api/cron/poll-scores` with a `CRON_SECRET` header.
- The endpoint checks whether any active game has a fixture currently in its live window (from 10 minutes before kickoff until 2.5 hours after). If not, returns 200 early without polling. Cheap no-op most of the time.
- When a match is live, calls the football-data.org adapter for live scores and upserts fixture state.
- On transitions (`live` → `finished`), enqueues a QStash message to process round results 2 minutes later (small buffer so all fixtures in a kickoff slot have time to settle).

**QStash scheduled messages** — used for:
- Deadline reminders: on round status `open`, schedule messages at deadline minus 24h and minus 2h.
- Post-deadline round processing: after a deadline passes, process the round if all fixtures are finished.
- Round completion: when the last live fixture finishes, schedule a `/api/cron/process-rounds` hit 2 minutes later.

Message envelope includes the target endpoint path + payload. A single `/api/cron/qstash-handler` route dispatches based on the job type.

#### Client-side live polling

New endpoint `GET /api/games/[id]/live`:
- Returns the current grid/ladder/timeline data straight from DB (no external calls).
- Optionally, if the caller passes `?refresh=auto` AND the last live-score poll is older than 2 minutes AND there is a fixture currently live for this game, runs an opportunistic single-match poll before responding.
- Very lightweight otherwise — no auth overhead beyond session check, DB read only.

The match-day view client component polls this endpoint every 30 s via a `useEffect` + `setInterval`. On visibility change (tab hidden) polling pauses.

#### World Cup competition

A new `competition` record:
- `name: "FIFA World Cup 2026"`
- `type: 'group_knockout'`
- `dataSource: 'football_data'`
- `externalId: 'WC'` (football-data.org competition code)
- `season: '2026'`

Rounds seeded:
- Group Stage Matchday 1 (16 fixtures)
- Group Stage Matchday 2 (16 fixtures)
- Group Stage Matchday 3 (16 fixtures)
- Round of 32 (16 fixtures)
- Round of 16 (8 fixtures)
- Quarter-finals (4 fixtures)
- Semi-finals (2 fixtures)
- Third place play-off (1 fixture)
- Final (1 fixture)

Group stage fixtures are known at the draw. Knockout fixtures are populated progressively by the daily sync as groups resolve.

Each team has a `pot: 1 | 2 | 3 | 4` attribute stored in the `externalIds` JSON: `{ fifa_pot: number }`. Pot data for all 48 teams is hand-seeded once (trivial: public FIFA draw data).

**tier_difference** for WC cup-mode fixtures: computed at query time as `homeTeamPot - awayTeamPot` (positive = home is better-seeded), passed to the existing cup mode logic. Pot 4 beating Pot 1 = tier difference of 3 = 3 lives on an underdog win.

#### Classic WC team-availability rule

New rule added to classic-mode validation and round processing:

- **Pick validation:** in `validateClassicPick`, add a check that the picked team has not been eliminated from the tournament. Eliminated = team has lost a knockout-stage fixture in the competition's rounds.
- **Auto-elimination:** at the start of each round for a classic WC game, check every alive player. If the set of (non-used, non-tournament-eliminated) teams across the remaining rounds' fixtures is empty, mark the player eliminated with reason "ran out of teams".
- Implemented as a pure function in `src/lib/game-logic/wc-classic.ts` with unit tests covering all edge cases (team lost group stage, team not yet played knockout fixture, team used in previous round).

This rule only fires for WC competitions (or any `group_knockout` competition type) — regular league games don't have tournament elimination.

#### Environment variables

Added via Doppler:
- `FOOTBALL_DATA_API_KEY` — API key for football-data.org (free tier).
- `CRON_SECRET` — shared secret for GitHub Actions → Vercel auth.
- `QSTASH_TOKEN` — Upstash QStash API token.
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — for verifying webhook signatures.

GitHub Actions secrets:
- `VERCEL_URL` — deployment URL.
- `CRON_SECRET` — same shared secret.

#### Initial data bootstrap

A one-off script or CLI command to seed real competitions (run once per environment):
- `just bootstrap-competitions` — seeds PL 25/26 from FPL and WC 2026 from football-data.org. Idempotent; safe on re-run.
- Replaces the dev-only `seed.ts` script for real data. Dev seed still used for local testing.

### Success criteria
- Live scores update in DB within 5 minutes of a goal.
- Match-day view refreshes within 30 seconds for active viewers.
- Round processing runs automatically within ~5 minutes of all fixtures completing.
- Deadline reminders fire at 24h and 2h before deadline.
- WC competition is queryable with all 48 teams, groups, pot assignments.
- Classic WC games correctly auto-eliminate players with no valid remaining teams.

---

## Sub-plan 4b: Cup mode UI + classic pick planner + payment flow

### Cup mode UI (generalised for WC + domestic cups)

Builds on the existing cup game engine (already correct per the previous logic audit).

**Pick interface** — extends the existing turbo pick two-zone layout with cup additions:

- **Tier indicator on every fixture:** a pip bar (3 pips for WC since pot differences max out at 3; 5 pips for domestic cup which can span more league tiers) plus numeric label (`+3` = underdog gets 3 lives on correct pick). Heart icon on fixtures where the tier difference is 2+ (life-earning potential).
- **Pick restriction:** a side cannot be picked if it is more than 1 tier higher than its opponent (e.g. Pot 1 vs Pot 3 — the Pot 1 side is greyed and not tappable). Tooltip: "Cannot pick — opponent is more than 1 tier lower". The weaker side remains selectable as an underdog pick.
- **Lives display:** persistent hearts at the top showing current lives. Projection text underneath: "1 life · If all correct: +2 → 3 lives" that updates as the user reorders their predictions.
- **Ranked list extension:** each ranked-prediction row shows the tier pip + heart alongside the existing rank number.

**Cup standings** — a new view that mirrors the turbo ladder structure but includes:
- Lives column in the leaderboard alongside streak and goals.
- Life-gained / life-spent indicators on each played fixture row.
- Separate streak-continued vs saved-by-life cell treatment in the grid view.

**Share template** for cup standings — Satori variant showing pot + leaderboard + lives per player.

### Classic pick planner

Below the current-round fixtures on the classic pick page, a collapsible planner section:
- Shows the next N confirmed future rounds (usually 3).
- Each future round has its own fixture list in the same style as the current round, but without the sticky confirm bar.
- Tapping a team in a future round assigns a tentative plan (purple dashed highlight). Tap again to remove.
- Tentative picks are personal scratchpad — not submitted, not visible to others.
- "Remaining teams" counter at the top updates live as teams are used (current pick + tentative plans + previous rounds).
- **Cascading used state:** planning Chelsea for GW26 greys Chelsea out in GW27+.
- **Auto-submit toggle** per planned round — when on, that pick locks in at the round's deadline via a QStash scheduled job. Visual: dashed border becomes solid purple when auto-submit is on.
- Rounds without confirmed fixtures show "Fixtures TBC" and are non-interactive.

Data model addition: `planned_pick` table already exists in the schema. This feature populates it via a new API route `POST /api/games/[id]/planned-picks` and reads via `GET`.

### Player payment claim + admin confirmation flow

**Schema migration** — extend the `payment` table:
- Add `claimedAt: timestamp | null`
- Extend the `payment_status` enum to include `'claimed'`

Status flow: `pending` → `claimed` (player says they've paid) → `paid` (admin confirms) or back to `pending` (admin rejects).

**Player UI (on game detail header or payment card):**
- If `pending` and I'm the payer: "Mark as paid" button. On click → status `claimed`, `claimedAt = now()`.
- If `claimed` and I'm the payer: "⏱ Awaiting confirmation" chip. Shown to everyone in the game so they can see your claim.
- If `paid`: "✓ Paid" green chip.

**Admin UI (on game detail, visible only to creator):**
- A "Payments" panel showing a table of all players with status.
- Claimed payments highlighted at the top with a "Confirm received" button that moves them to `paid`.
- Admin can also force any status directly (including back to `pending` to reject a claim).
- "Send reminder" button per unpaid player — opens WhatsApp click-to-share.

**Pot calculation fix** — `calculatePot` changes from `entryFee × playerCount` to sum of actual payment records (paid + claimed). This matters for rebuys and partial-paid states. Existing tests get updated.

### Success criteria
- Cup pick page matches the agreed mockups and reflects tier mechanics correctly.
- Classic pick planner behaves exactly like the brainstorm mockups (cascading used state, auto-submit).
- Payment flow: a player can self-claim, admin can confirm, pot tracks actual received amount.
- All new logic has unit tests where appropriate.

---

## Sub-plan 4c: Match day live + admin UX + rebuys + share variants + mobile polish

### Match day "as it stands" view

A new view mode on the game detail page, available when the current round is `active` (matches kicking off). Shown automatically on game load during match day; accessible via a "Live" tab at other times.

**For classic:** each row = one player, showing:
- Player name + status
- Team badge + name of their pick
- Live score of the fixture their pick is in
- State: `safe` (team winning, green), `sweating` (drawing, amber), `losing` (red), `safe` (won, solid green)
- Overall state summary at the top: "9 alive · 2 sweating · 1 out"

**For turbo/cup:** each row = one player, showing:
- Current running streak + goals
- How many picks have resolved so far
- Next pick (if current streak alive) — the fixture still playing that could break or extend the streak
- State shows whether their top-N are still alive for the streak

Polls the `/api/games/[id]/live` endpoint every 30 s. Pauses when tab hidden.

Live match-day shareable image — Satori template variant for each mode, generated on demand.

### Admin UX (contextual, visible only to creator)

Builds on the existing admin-bar design from Plan 3 mockups:

- **Add player:** dialog that takes an email. Validates the user exists in the system. Inserts game_player + payment records. Shown in the admin controls when the game is in `setup`, `open`, or `active` state.
- **Make pick for player:** admin selects a player, the standard pick interface opens with admin context. Submitting writes a pick with the admin flag. Works when the deadline hasn't passed or when the admin explicitly allows late entry.
- **Split pot:** dialog showing the remaining alive players and the proposed split (equal by default, editable per-player). Confirm → updates payouts, ends the game.
- **Payments panel:** the one from sub-plan 4b.

All admin controls contextual to the game detail page — no separate admin route.

### Paid rebuys (classic only)

Game creation adds an `allowRebuys: boolean` toggle (default false). Stored in `mode_config`.

Flow:
- Player eliminated in GW1. When `allowRebuys` is true, the existing GW1 starting-round exemption is disabled for that game — the exemption and the rebuy mechanism are mutually exclusive.
- Dashboard shows "You're out — buy back in for £10" card for that game during GW1's rebuy window (closes at GW2 deadline).
- Clicking it creates a new `payment` record (pending → claimed → paid flow), resets the player's status to `alive`, wipes their GW1 pick so GW2 is a fresh start.
- Pot grows with the new payment.
- A player can only rebuy once per game (tracked via a `rebuyCount` column on `game_player` or a metadata field).

### Share template variants

New Satori routes under `/api/share/`:
- `/api/share/turbo-standings/[gameId]` — ladder-style image with podium + fixture breakdown.
- `/api/share/cup-standings/[gameId]` — ladder with lives indicators.
- `/api/share/live/[gameId]` — match-day "as it stands" snapshot with live scores.
- `/api/share/winner/[gameId]` — end-of-game celebration with winner name, pot, game name.

Each includes a mode-appropriate layout using the Kit Room palette.

### Mobile polish

Targeted breakpoint fixes, not a redesign:
- Game detail: confirm tab-based navigation works cleanly under 768 px.
- Turbo ladder: fixtures stack vertically on narrow screens, predictions breakdown becomes full-width rows.
- Turbo timeline: horizontal scroll with sticky player-name column.
- Progress grid: already horizontally scrollable, verify sticky column behavior.
- Pick confirm bar: ensure sticky at viewport bottom on mobile Safari.

---

## Cross-cutting: Notification architecture (bedded in, deferred expansion)

Phase 4 establishes the event-storage foundation but delivers only the manual WhatsApp share pattern. Phase 5 will add automated channels.

**Event table** — new `event` table storing:
- `gameId`, `type` (`round_opened | deadline_approaching | deadline_passed | results_confirmed | game_finished | payment_reminder`)
- `payload: jsonb`
- `createdAt`, `sharedAt: timestamp | null`

Events are written by the cron/QStash handlers and the round-processing logic. The game detail page shows a feed of recent events with a "Share to WhatsApp" button per event that opens `wa.me` with pre-composed text referencing the event.

Phase 5 adds: WhatsApp Business API (Meta Cloud API) for auto-sending, email via a transactional provider, push via web-push PWA, per-user delivery preferences.

---

## Schema changes summary (single migration)

One migration in Phase 4a (ideally) covering:
- Add `pot` concept via `externalIds.fifa_pot` in `team` — no migration needed, jsonb.
- Add `'claimed'` to `payment_status` enum and `claimedAt` column to `payment` (4b).
- Add `allowRebuys` to `mode_config` JSONB (no migration, jsonb).
- Add `rebuyCount` integer column to `game_player` with default 0 (4c).
- Add `event` table (cross-cutting).

All changes are additive. No destructive migrations.

---

## Timing and sequencing

| Sub-plan | Dependencies | Blocking | Target readiness |
|----------|-------------|----------|------------------|
| 4a | None | 4c (needs live data) | Before June 11, 2026 (WC kickoff) |
| 4b | None | — | Parallel with 4a |
| 4c | 4a | — | Anytime after 4a lands |

Release candidate readiness requires all three to merge to main with end-to-end verification against real FPL and football-data.org data.

---

## Out of scope for Phase 4 (Phase 5+ candidates)

- **Mangopay integration** — in-app payment processing with escrow.
- **WhatsApp Business API** — automated message delivery to configured groups.
- **Push notifications (PWA)** — mobile alerts.
- **Email notifications** — deadline reminders, results, payouts.
- **Sentry integration** — error/performance observability.
- **Advanced match-day features** — commentary feed, statistical insights.
- **Timeline view per-pick "paths to success" full simulation** — currently heuristic; a real combinatorial engine is Phase 5.
- **Sign-up with social providers** — Better Auth supports them; not in Phase 4.
- **Multi-tenancy / white-label** — single-tenant app.
