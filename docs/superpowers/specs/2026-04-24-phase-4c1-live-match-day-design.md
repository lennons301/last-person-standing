# Phase 4c1 Design Specification — Match-Day Live UI

## Overview

Phase 4c1 turns the app from "static between match windows" into a live experience during kickoff. Scores update in place, goals celebrate visibly on the ticker card, the viewer's own row highlights while their pick is in play, and players who just went out fade with a clear "OUT" badge. All without WebSockets, a new data provider, or a server-side events table.

4c1 is the first of five sub-phases in Phase 4c (match-day live, admin UX, paid rebuys, Satori share variants, mobile polish). Each 4c sub-phase ships on its own branch — 4b's monolithic pattern trades cleanly for smaller reviewable PRs now that the architecture is settled. 4c1 is independent and can merge dormant onto `main` before the remaining sub-phases start.

Target completion ahead of Phase 4.5 launch preparation; WC 2026-06-11 is the hard deadline for everything in Phase 4c.

---

## Scope

**In scope:**
- Client-side polling layer with adaptive cadence (30s during match windows, 5min otherwise).
- `<LiveScoreTicker>` pinned at the top of the game detail page. Horizontal strip of fixture cards; only visible when at least one fixture is in its live window.
- Goal-delta detection via client-side payload diffing (no server-side event store).
- On-card goal celebration: scale pulse + score digit bump + floating "GOAL 34'" chip.
- Pick-row enrichment on standings components: blue left-border + pulsing "LIVE" tag on the viewer's row when their pick's fixture is live, score-bump badges on pick cells when underlying score changes.
- Elimination fade + "OUT R{n}" badge when a pick transitions `live` → `settled-loss` within the current render window.
- GitHub Actions `live-scores.yml` cron cadence bump from every 5 minutes to every 1 minute.

**Out of scope** (deferred to later phases or explicitly dropped):
- Scorer names, minute-level event breakdowns, goal timeline history — all require paid football-data.org tier.
- Server-side `fixture_event` table — not needed for in-session animation.
- Retroactive animations for goals scored before the page loaded — users who land mid-match see current scores, no replay of missed events.
- WebSocket / SSE / push — polling is sufficient for a friend-group app with ≤10 concurrent viewers per game.
- Vercel Cron upgrade or QStash self-scheduling chain — considered and rejected as over-engineered for a public repo with free GH Actions minutes.
- Match-day UI for admin-side pick-correction, split-pot, or add-player actions — deferred to 4c2.

---

## Architecture

A single new primitive: a client-side polling layer composed of one React context provider, one hook, and a handful of pure derivation functions. No new API routes, no schema changes, no new data-provider integration.

**`<LiveProvider>`** — React context provider that wraps the `GameDetailView`. Owns the polled payload, the adaptive timer, the network-error state, and the diff-derived event stream. Unmount or game-id change resets state.

**`useLiveGame()`** — hook consumed by every component that wants live data. Returns `{ payload, events, isStale, reconnecting }`. Event stream is per-render — consumers must be stable in what they animate per event id (no replaying the same goal twice).

**Pure derivation functions** (all module-level, fully unit-tested):
- `detectGoalDeltas(prev, next): GoalEvent[]` — diffs consecutive payloads; returns one event per score increment (never a decrement).
- `detectPickSettlements(prev, next): PickSettlementEvent[]` — picks transitioning `live`/`pending` → `settled-loss` or `settled-win`.
- `deriveMatchState(fixture, now): 'pre' | 'live' | 'ht' | 'ft'` — maps stored status + kickoff delta to a UI state.
- `projectPickOutcome(pick, fixture, mode): 'winning' | 'drawing' | 'losing' | 'saved-by-life' | 'settled-win' | 'settled-loss'` — what does this pick currently look like from the viewer's perspective, given the live score?

**Existing server endpoint (unchanged):** `GET /api/games/[id]/live` from Phase 4a. Returns `{ fixtures, picks, players, viewerUserId, updatedAt }`. The payload shape is already sufficient for diffing; no migration needed.

---

## Server freshness

The polling cadence on the client cannot make scores fresher than the server's copy. The `poll-scores` cron (Phase 4a) is what actually pulls scores from football-data.org into our DB. At its current 5-minute cadence, client polls can be up to 5 minutes stale during matches regardless of how often the client polls.

**Change:** `.github/workflows/live-scores.yml` — `cron: '*/5 * * * *'` → `cron: '* * * * *'`. One line.

**Why it's free:**
- Repository is public. GitHub Actions minutes on public repos are unlimited, so 1440 invocations/day has zero cost.
- The `poll-scores` handler (Phase 4a) already short-circuits on `hasActiveFixture(fixturesInRounds)` — runs without live fixtures return `{ updated: 0, reason: 'no-active-fixtures' }` in ~100ms without calling football-data.org.

**API budget check:**
- Football-data.org free tier: 10 requests/minute.
- Typical concurrent-live-match count during WC group stage: 1-3.
- Budget consumed: 1-3 req/min from this workflow, well under the 10 req/min ceiling.
- `daily-sync` runs once daily on Vercel cron — separate budget envelope, unaffected.

**Explicitly rejected alternatives:**
- **Vercel Cron on Pro plan ($20/mo)** — unnecessary recurring cost for a friend-group app.
- **QStash self-scheduling chain** — adds paid-tier Upstash ($10/mo during WC) plus complexity. Option if second-level precision ever matters; not needed here.

**Verification step in implementation plan:** after merging the cadence change, watch `gh run list --workflow=live-scores.yml --limit 10` to confirm the new 1-minute cadence is firing cleanly. (Note that runs will still fail with empty-secrets errors until Phase 4.5 sets `CRON_SECRET` and `VERCEL_PROD_URL` — that's tracked separately in `project_phase_4_5_must_haves.md`.)

---

## Components

### New

| Path | Responsibility |
|---|---|
| `src/components/live/live-provider.tsx` | React context provider; owns poll timer, cache, diff event stream, visibility/focus listeners, error state. |
| `src/components/live/use-live-game.ts` | Hook consuming the context. Public API for all other components. |
| `src/components/live/live-score-ticker.tsx` | Top-of-page horizontal strip. Renders `<LiveFixtureCard>` per active fixture. Hides itself when no fixture is in `LIVE_WINDOW_BEFORE_MS` window. |
| `src/components/live/live-fixture-card.tsx` | Per-fixture card: team badges, scores, status, "My pick" tag. Subscribes to goal events for celebration animation. |
| `src/components/live/goal-celebration.tsx` | Decorator component applied to `<LiveFixtureCard>`. Manages the `celebrating` CSS class + `GOAL 34'` floating chip via `setTimeout` cleanup. |
| `src/lib/live/derive.ts` | Pure functions: `deriveMatchState`, `projectPickOutcome`. |
| `src/lib/live/detect.ts` | Pure functions: `detectGoalDeltas`, `detectPickSettlements`. |
| `src/lib/live/types.ts` | Shared types: `GoalEvent`, `PickSettlementEvent`, `LivePayload` (re-export of `/live` response). |

### Modified

- `src/components/game/game-detail-view.tsx` — wraps children in `<LiveProvider>`, renders `<LiveScoreTicker>` above the existing content.
- `src/components/standings/cup-grid.tsx` — accepts optional `live?: LivePayload` prop. Threads `viewerLivePick` state into the viewer's row styling and per-cell score-bump badges.
- `src/components/standings/cup-ladder.tsx` — same pattern: `live?: LivePayload` prop, optional live enrichment on fixture cards.
- `src/components/standings/cup-timeline.tsx` — same pattern.
- `src/components/standings/cup-standings.tsx` — tab wrapper passes `live` down to the active tab's component.
- `src/components/game/turbo-standings.tsx` — same `live?: LivePayload` pattern.
- `src/components/standings/progress-grid.tsx` — classic-mode standings view. Same pattern.
- `.github/workflows/live-scores.yml` — cron schedule cadence change (one line).

---

## Data flow

1. `GameDetailView` renders; wraps children in `<LiveProvider value={{ gameId: game.id }}>`.
2. `LiveProvider`'s `useEffect` mounts a poll timer immediately. First fetch runs on mount.
3. On each response, `LiveProvider`:
   - Stores the payload as `current`.
   - Runs `detectGoalDeltas(previous, current)` and `detectPickSettlements(previous, current)`.
   - Appends events to an in-memory ring buffer (last 20 events only, cleared on game-id change).
   - Updates the timer's interval based on `hasActiveFixture(current.fixtures)` — 30s if any fixture in live window, 5min otherwise.
4. `useLiveGame()` subscribers re-render. Each component reads:
   - `payload` — current live state.
   - `events` — ring buffer of recent events for animation triggering.
   - `isStale` — true if last fetch failed; used for "reconnecting…" chip.
5. Components register one-shot CSS-class animations against event ids. Each animation class is removed after ~600-2000ms (depends on animation) via `setTimeout`. Event ids are deterministic derivations of the payload state so the same goal never replays:
   - `GoalEvent.id`: `${fixtureId}:${side}:${newScore}` where `side` is `home` or `away`. A score of 2-0 that became 3-0 emits id `fx_123:home:3`.
   - `PickSettlementEvent.id`: `${gamePlayerId}:${roundId}:${result}` where `result` is the terminal state (`settled-loss` / `settled-win` / `saved-by-life`).
   - Consumers maintain a `Set<string>` of already-animated ids; repeat appearances are ignored.
6. `visibilitychange` listener pauses the timer; `focus` triggers an immediate refetch.
7. On network error: set `isStale: true`, start exponential back-off (30s → 60s → 120s, cap 120s), continue rendering last good payload.
8. On 401/403: clear payload, render sign-in prompt. On 404: clear payload, render empty state.

---

## Visual design

The mockups explored during brainstorming are the source of truth for look and feel. Summarised here:

**Ticker (`<LiveScoreTicker>`):**
- Horizontal strip immediately below the game header. Fixed height ~80px.
- Only renders if `hasActiveFixture`.
- Each fixture card: 170px wide, scrollable horizontally on overflow.
- Card border colour encodes status: red for live, amber for half-time, default for pre-match. Live cards also have an inset 1px border highlight.
- Status pill at bottom-left of each card: `LIVE 34'` (with pulsing red dot), `HALF TIME`, `KICKS OFF IN 12m`, `FULL TIME`.
- "My pick" tag (3b2f86 bg, white text) sits top-right when the viewer's pick references the fixture.

**Goal celebration (`<GoalCelebration>`):**
- Triggered by each `GoalEvent` whose fixtureId matches the card.
- Animation (~2s total):
  1. Card scales 1 → 1.05 → 1 over 600ms with a green glow (`box-shadow: 0 0 0 2px #22c55e, 0 0 20px rgba(34,197,94,0.4)`).
  2. Background gradient transitions to green-tinted for 2s then fades back.
  3. Score digit bumps in (translateY 8px → 0, opacity 0 → 1) over 500ms.
  4. "GOAL 34'" chip floats in above the card (translateY 8px → 0 over 300ms) and remains visible for 1.5s before fading.
- Colour cue: green for my-pick, red for opponent-pick. Same animation timing.
- No audio (accessibility, plus users may be watching the game elsewhere).

**Pick-row enrichment (standings components):**
- When the viewer's pick's fixture is `live`, the viewer's row in the standings gets:
  - `border-left: 3px solid #3b82f6`
  - subtle blue-tinted gradient background on the left ~60%
  - pulsing "LIVE" tag inline with the player name (animates 1.4s ease-in-out)
- When a pick cell's underlying score changes, a score-bump badge appears on the cell for 800ms: green `+1` for my-team-scored, red `-1` for opposition-scored.

**Elimination fade (3b):**
- Triggered by each `PickSettlementEvent` with `result: 'settled-loss'` when the player's livesRemaining reaches 0.
- Row opacity animates from 1 → 0.45 over 400ms.
- `OUT R{n}` badge appears inline with player name: red border (`#ef4444`), transparent bg, red text.
- No subsequent animation loop; row stays at 45% opacity until next render with fresh data.

---

## Error handling

| Condition | Behaviour |
|---|---|
| Network failure (fetch throws / non-2xx) | Keep last payload; set `isStale: true`; show "reconnecting…" chip in ticker; exponential back-off (30s → 60s → 120s, cap 120s). |
| 401 / 403 | Clear payload; render `<SignInAgain />` inline in ticker slot; stop polling. |
| 404 | Clear payload; render "Game not found" empty state; stop polling. |
| Tab hidden | Pause timer; no fetch fires while hidden. |
| Tab focus | Immediate refetch; resume normal cadence. |
| Game-id change mid-session | Unmount/remount `LiveProvider`; discard all state; fresh first fetch. |
| `hasActiveFixture(current) === false` | Cadence drops to 5min. Ticker unmounts if no fixture in `LIVE_WINDOW_BEFORE_MS` window. |
| Response arrives after game moved past current round | Provider discards payload if `payload.roundId !== gameData.currentRoundId`; UI stays stable. |

---

## Testing

**Unit (Vitest, pure):**
- `detectGoalDeltas`: single goal, multiple goals in one response, no deltas, score-decrement guarded (never emits), null-score → non-null (emits), non-null → null (ignored), fixture removed between polls (ignored).
- `detectPickSettlements`: pick transitions to `settled-loss`, to `settled-win`, to `saved-by-life`, still-pending (no event), fixture removed (no event).
- `deriveMatchState`: kickoff exactly at `now`, kickoff 9min ago (pre), kickoff 11min ago (live), kickoff 2h15m ago (live), kickoff 3h ago (ft-fallback if status missing), explicit `'live'`/`'finished'`/`'halftime'` status overrides.
- `projectPickOutcome`: all six results × home/away/draw pick sides × cup/classic/turbo modes. Full truth table covered.

**Hook (Vitest + `vi.useFakeTimers`):**
- `useLiveGame` cadence: 30s poll during live window, 5min otherwise, immediate refetch on focus, paused on hidden.
- Error recovery: 500 response → exponential back-off → recovery on next success.
- 401 / 404 handling: no retry.
- Game-id change: state reset; new game's first fetch triggers.

**Integration (Playwright):**
- Extend `scripts/seed.ts` with a "mid-match" cup game: `currentRound.fixtures` with `kickoff = now - 15min` + `status = 'live'` + `homeScore: 1, awayScore: 0`.
- Assert ticker renders with the live card and correct status pill.
- Mutate DB (`update fixture set home_score = 2 where id = ...`), wait for next poll tick, assert the digit animation fires and the new score renders.
- Assert elimination fade renders when a loss-result pick is seeded into a player's row.

**Workflow verification:**
- After the cadence change lands on main, `gh run list --workflow=live-scores.yml --limit 10` should show 1-minute gaps between runs. Runs will still fail until Phase 4.5 adds the secrets, but the cadence shift itself is independently verifiable.

**Post-launch (Phase 4.5 playbook):**
- During a real WC fixture, open a seeded game detail page and verify scores update within ~60s of goal reports, goal celebrations fire, pick-row enrichment activates. This is the only full end-to-end verification possible; dev seed uses PL data which may or may not be in an active window.

**Baseline tests before 4c1:** 196. Target after: ~215-220 (12-18 new unit + hook cases).

---

## Risk mitigation

- **Polling correctness depends on payload identity.** If `getLivePayload` ever changes the structure of `fixtures[]` or `picks[]`, the diff functions could emit false events. Mitigation: make the payload shape explicit as a frozen TypeScript type shared between server and client (`src/lib/live/types.ts`). Any change to `/live` forces a corresponding type update and a compile error at the consumer.
- **Goals before page-load are invisible.** Expected trade-off, but worth calling out in release notes so players don't assume the feature is broken when they open mid-match to see `ENG 2-0` without a celebration. Consider a "you missed 2 goals" chip in a future phase.
- **Cadence bump increases GH Actions log noise.** 1440 workflow runs/day on the main page of the Actions tab. Mitigation: pre-release, set the default filter to "failing" in the repo README.
- **Adaptive cadence might misfire on timezone edge.** `isFixtureInLiveWindow` is timezone-naive (UTC everywhere). Double-checked during 4a; 4c1 doesn't change it.
- **Animation triggering on stale events after tab refocus.** If a user comes back after 20min away, the refetch may emit many goal events at once. Mitigation: cap the event ring buffer at 20, skip animation for events whose timestamp is >60s old (animate only "current" goals), still bump the scores.

---

## Rollout

Phase 4c1 merges dormant onto `main` alongside 4a and 4b. No production activity until Phase 4.5. Dev verification is limited by the PL-only seed data: we can exercise the ticker layout and the static live states, but the cadence change and real football-data.org behaviour both only matter once prod is reachable and a real fixture window is active.

Implementation plan (to be written next, via `superpowers:writing-plans`) should:
- Land all pure-logic functions first (TDD-friendly).
- Wire `LiveProvider` into `GameDetailView` before any component edits, so everything else can assume the hook works.
- Gate the cron cadence change behind a separate commit so it's easy to revert if it causes unforeseen noise.
- End with a verification pass modelled on Phase 4b's Task 37: full typecheck, full test suite, lint, `next build`, plus the `gh run list` cadence sanity-check.

---

## Dependencies on other sub-phases

- 4c1 does not depend on 4c2-4c5. Ships independently.
- 4c4 (Satori share variants) will consume the live payload to build a "live share" card image. Its design should reuse `LivePayload` from `src/lib/live/types.ts` — 4c1 pre-shapes this cleanly.
- 4c5 (mobile polish) will include the ticker card's horizontal scroll behaviour and the pick-row enrichment spacing on narrow viewports.

---

## Acceptance criteria

A Phase 4c1 PR is ready to merge when:

- [ ] `<LiveScoreTicker>` renders at the top of the game detail page only when `hasActiveFixture` is true.
- [ ] Each live fixture card shows team badges, current scores, correct status pill, and the "My pick" tag where applicable.
- [ ] A manual DB score mutation on a live seed fixture triggers the on-card goal celebration (scale pulse, digit bump, floating chip) on the next poll tick.
- [ ] The viewer's row in cup/classic/turbo standings gets blue left-border + "LIVE" pulse when their pick's fixture is in its live window.
- [ ] A manual DB mutation transitioning a player's current pick to `settled-loss` (and `livesRemaining: 0`) renders the elimination fade + "OUT R{n}" badge on the correct row on the next poll tick.
- [ ] Adaptive cadence verified in Chrome devtools: 30s between fetches when mid-match dev seed is loaded, 5min otherwise.
- [ ] Cron change landed; `gh run list --workflow=live-scores.yml --limit 10` shows 1-minute gaps.
- [ ] `pnpm exec tsc --noEmit` clean.
- [ ] `pnpm exec biome check` clean.
- [ ] `pnpm exec vitest run` all pass; test count increased by ~12-18.
- [ ] `pnpm exec next build` compile + typecheck phases pass.
