# Phase 4c4 — Satori Share Variants: Design Specification

**Status:** Approved for planning (2026-04-27)
**Phase:** 4c4 — fourth sub-phase of 4c (match-day live / admin UX / rebuys / Satori / mobile polish)
**Predecessors:** 4c1 (live UI, merged), 4c2 (admin UX, merged), 4c3 (paid rebuys, merged 2026-04-26)
**Successors:** 4c5 (mobile polish + a11y sweep)
**Ships:** dormant to `main` via PR; no prod deploy until Phase 4.5

## Overview

4c4 adds two new shareable Satori-rendered PNG variants — **live match-day** and **winner** — to complement the existing standings image (`/api/share/grid/[gameId]`). It also extends standings to render mode-appropriate layouts for cup and turbo (today's grid renders cleanly only for classic). The new content lands in `ShareDialog` with auto-picked default and a dropdown override.

All three variants are mode-aware: a single route renders the appropriate layout based on `game.gameMode`. Total surface: **3 routes × 3 modes = 9 layouts**, of which one (standings/classic) already exists. The eight new layouts are added in this phase.

## Goals

1. Members of any game (classic, cup, turbo) can share a "current standings" image, a "live match-day" image, and a "winner" image once the game is complete.
2. The active variant is auto-picked based on game state when the share dialog opens, with a dropdown to switch manually.
3. Images are mobile-readable at WhatsApp/iMessage rendering (rendered ~360pt wide on iPhone).
4. 20–30 player games render correctly with overflow tails ("+N more") rather than dense unreadable cells.
5. No schema changes; zero new infrastructure (still `next/og` + Node.js runtime).

## Non-goals

- Viewer-specific personalization (e.g., highlighting "your row" in the image). Game-wide content only.
- Pixel-perfect aspect-ratio constraints (e.g., 1.91:1 OG). Variable height matches the existing `/grid` and is fine for chat shares.
- Animation / GIF / video output. PNG only.
- Public (unauthenticated) sharing. Member-only, same as today.
- Replacing the existing `/api/share/grid/[gameId]` route — it stays as an alias of `/standings` for the deployed dialog and is documented as deprecated.

## Architectural shape

### Three mode-aware routes

- `GET /api/share/standings/[gameId]` — current settled state (between rounds, or game-wide overview).
- `GET /api/share/live/[gameId]` — match-day state while a round is in play.
- `GET /api/share/winner/[gameId]` — final state once the game is complete.

Each route:
1. `requireSession()` and verify `game.isMember` (403 otherwise; 404 if game missing).
2. Inspect `game.gameMode` and dispatch to the appropriate layout function.
3. Hand off to `ImageResponse` with `runtime: 'nodejs'`, `width: 1080`, height computed dynamically.

The existing `GET /api/share/grid/[gameId]` route stays as a thin alias that internally calls the standings handler — no breaking change to the deployed `ShareDialog` until we update it (in this phase). After 4c4 we leave the alias in place for one more phase as belt-and-braces, then remove it in 4c5 polish.

### Layout files

```
src/lib/share/
  data.ts                       — getShareStandingsData / getShareLiveData / getShareWinnerData
  layouts/
    classic-standings.tsx       — existing /grid layout, refactored out of the route file
    classic-live.tsx            — player-ladder
    classic-winner.tsx          — winner-block + eliminated-by-GW table
    cup-standings.tsx           — grid (cup-grid style) without live indicators
    cup-live.tsx                — grid with live state indicators + lives column
    cup-winner.tsx              — winner-block + close-finishes runners-up table
    turbo-standings.tsx         — grid without live indicators, no lives column
    turbo-live.tsx              — grid with live state, no lives column
    turbo-winner.tsx            — winner-block template, no lives column
  shared.tsx                    — common JSX: header, footer, winner-block, overflow-tail row, lives-row, pip-bar, badges
```

Each layout file is a typed function `(data: <Mode><Variant>Data) => JSX.Element` that returns the JSX consumed by `ImageResponse`. Layouts are pure (no DB, no fetches) — all data preparation lives in `data.ts`.

### Data shape

Each share data fetcher returns a discriminated union on `gameMode`:

```ts
// src/lib/share/data.ts
export type StandingsShareData =
  | { mode: 'classic'; /* ...existing /grid fields... */ }
  | { mode: 'cup';     /* ...players, picks, lives, streak, goals, round info, overflow flag... */ }
  | { mode: 'turbo';   /* ...players, picks, streak, goals, round info, overflow flag... */ }

export type LiveShareData =
  | { mode: 'classic'; /* ...alive players with their pick + live score + state... */ }
  | { mode: 'cup';     /* ...players + current round picks coloured by live state, lives... */ }
  | { mode: 'turbo';   /* ...players + current round picks live, streak, goals... */ }

export type WinnerShareData =
  | { mode: 'classic'; winners: WinnerEntry[]; runnersUp: ClassicRunnerUp[]; overflowCount: number }
  | { mode: 'cup';     winners: WinnerEntry[]; runnersUp: CupRunnerUp[]; overflowCount: number }
  | { mode: 'turbo';   winners: WinnerEntry[]; runnersUp: TurboRunnerUp[]; overflowCount: number }
```

`WinnerEntry` carries `{ userId, name, potShare, mode-specific stat block }`. Multiple winners → split-pot scenario; pot share is computed via the existing `calculatePayouts(potTotal, winnerUserIds)` from `src/lib/game-logic/prizes.ts` (it already handles remainder-cent allocation correctly for splits).

## Per-mode layouts

| Variant | Classic | Cup | Turbo |
|---|---|---|---|
| **Standings** | existing `/grid` layout (already shipping) — moved verbatim into `classic-standings.tsx` | new — grid: rank / player / lives / streak / goals + 10 confidence-rank columns with team labels and result colours | new — same grid shape, no lives column |
| **Live** | player-ladder: row per alive player with their pick + live score + winning/drawing/losing badge, sorted winning → drawing → losing → pending KO. Eliminated omitted | grid with current round's 10 picks coloured live state (green winning / red losing / blue pending / amber saved) + lives | same as cup, no lives |
| **Winner** | winner-block (1-N rows for split pot, pot share each, final-round meta) + eliminated-by-GW table; "+N more eliminated earlier" tail | winner-block + "Close finishes" runners-up table (lives / streak / goals); eliminated below at lower opacity | same as cup, no lives column |

### Cell colour vocabulary (consistent across all layouts)

- Green (`#16a34a`) — winning / win
- Red (`#dc2626`) — losing / loss
- Blue (`#2563eb`) — pending kickoff
- Amber (`#f59e0b`) — saved by life (cup only)
- Yellow (`#fef9c3` bg, `#ca8a04` fg) — drawing (classic live only) or no-pick (standings)
- Grey dashed — locked / empty / pre-deadline hidden

### Overflow strategy (20–30 player games)

- **Standings (all modes)**: top 20 alive + top 10 eliminated by recency. Tail row "+N more eliminated earlier" if >30 displayed.
- **Live (classic)**: alive players only (eliminated omitted entirely). With 30 alive at ~44px each: ~1500px tall, scannable.
- **Live (cup/turbo)**: top 16 by current standing + 4 most-recently-eliminated for context. Tail "+N more rows" if needed. "Current standing" tiebreaker: cup → `livesRemaining DESC, streak DESC, goals DESC`; turbo → `streak DESC, goals DESC`.
- **Winner**: all winners (1 to N) + top 8 runners-up by finishing position. Tail "+N more eliminated earlier" if needed.

### Cup/turbo grid cell density

For 20–30 player games each cell becomes ~50–60px wide. To stay legible:
- 3-letter team abbreviation only inside the cell.
- Drop the opponent suffix (`vSER`) from each cell — instead, render an "matchups: BRA v SER, FRA v AUS, ENG v USA…" caption below the grid (a single line).

## Dimensions

- **Width**: 1080px for all variants (matches existing `/grid`; renders cleanly at iPhone-WhatsApp width).
- **Height**: dynamic per layout, cap ~2400px (~3-4 mobile screen heights). Beyond cap → overflow tail.
- **Format**: PNG via `next/og` `ImageResponse`, `runtime: 'nodejs'`.

Approximate heights for 20–30 player games:

| Variant | Approx height |
|---|---|
| Standings (any mode) | ~1500–1800px |
| Live classic | ~1100–1500px |
| Live cup/turbo | ~900–1100px (after capping) |
| Winner (any mode) | ~700–1100px |

## ShareDialog surfacing

`src/components/game/share-dialog.tsx` is updated:

1. Receives a new `defaultVariant: 'standings' | 'live' | 'winner'` prop, derived server-side from game state at the time the dialog opens:
   - `game.status === 'completed'` → `winner`
   - Otherwise, if `game.currentRound.status === 'active'` AND any fixtures with `status='live'` or `status='halftime'` → `live`
   - Otherwise → `standings`
2. A `<Select>` (shadcn) above the image lets users pick a different variant. Items: Standings (always enabled), Live (enabled only when live conditions are met), Winner (enabled only when game is complete). Disabled items are visible but unselectable.
3. The image `src` rebuilds based on the selection: `/api/share/${variant}/${gameId}?t=${cacheBustToken}`.
4. The download button's `href` tracks the active variant; the suggested filename includes the variant name (e.g., `the-lads-lps-winner.png`).
5. Footer placeholder text ("Live match day snapshots…") is removed.
6. WhatsApp invite share at the top stays unchanged.

`defaultVariant` flows through `getGameDetail` (in `src/lib/game/detail-queries.ts`) — extend the returned object with the derived value, no new round-trip.

## Caching strategy

Per-route HTTP cache headers:

- **`/standings`** — `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (5 min). Cache key: `gameId` only.
- **`/live`** — `Cache-Control: no-store`. Each request fresh.
- **`/winner`** — `Cache-Control: public, s-maxage=86400, immutable`. Game state is terminal; image never changes.

`ShareDialog` continues to cache-bust via `?t=${Math.floor(Date.now() / 60000)}` for live and standings (minute granularity). Drop the cache-bust for winner — never needed.

## Edge cases & invariants

- **Game has no round 1 yet**: standings / live / winner are all rendered but with empty state. The standings shows the registered players with no picks yet. Live and winner aren't accessible via the dropdown (their conditions don't fire), but the routes return a 200 with a placeholder image if hit directly.
- **Game has 0 alive players, no winner declared** (rare; e.g., admin-removed everyone): `/winner` returns a placeholder "no winner" image. `defaultVariant` falls back to `standings`.
- **Split-pot scenarios**: winner block lists every player marked as `winner` (status), each with a `potShare`. Existing `payout` table from `prizes.ts` already handles split-pot math; we read from there or compute fresh.
- **Game with 0 payments** (admin-only added players): pot is `£0`. Header still renders `Pot £0` so the layout doesn't blank out.
- **Game with 1 player**: standings/live render the single row; winner shows a 1-row winner block with "no runners-up" placeholder.
- **Cup with 0 lives starting** (degenerate): heart-row shows the empty state; doesn't break the layout.

## Testing

### Unit (Vitest, no DB)

- One snapshot test per layout (9 total): `classic-standings.test.tsx`, `classic-live.test.tsx`, ..., `turbo-winner.test.tsx`. Each takes a canonical fixture and snapshots the JSX tree returned by the layout function.
- Test the overflow-tail logic: layouts with 30+ players, 30+ runners-up, etc.
- Test the data fetchers (`getShareStandingsData`, etc.) on mocked DB: confirm they return the right discriminated-union shape per game mode.

### Integration (Vitest + test DB)

- One happy-path test per route × mode (3 routes × 3 modes = 9): seed a game in the matching state, hit the route, confirm 200, `image/png` content-type, non-zero body, and reasonable dimensions (image header bytes parseable to width=1080).
- One auth test per route: 401 if unauthenticated, 403 if non-member.
- One cache-headers test per route: confirm `Cache-Control` matches the spec.

### Component (Vitest + Testing Library)

- `share-dialog.test.tsx`: confirm the dropdown shows the right enabled/disabled items for game states `setup`, `open`, `active (round in progress)`, `active (between rounds)`, `completed`. Confirm the image `src` updates when the user changes the dropdown.

### Manual smoke

Update `scripts/seed.ts` to seed at least one game in each of: `active (between rounds)`, `active (round in progress with live fixtures)`, `completed (single winner)`, `completed (split pot)`. Verify the dialog auto-picks the right variant and the image looks correct on mobile (DevTools mobile preview at iPhone widths).

## Rollout

- **Schema changes**: none.
- **Data migrations**: none.
- **Backward compatibility**: existing `/api/share/grid/[gameId]` stays as an alias of `/standings`. Deployed dialog continues to work unchanged until `ShareDialog` is updated in this phase.
- **Ships dormant to `main`** via PR. No prod deploy until Phase 4.5.

## Out of scope / deferred

- Viewer-specific accents (highlight my row) — 4c5 polish if missed.
- Removing the `/grid` alias — defer to 4c5 cleanup.
- Pixel-diff visual regression testing — JSX snapshot is good enough.
- Public (unauthenticated) share URLs — separate "social previews" phase, not in 4c4.
- Mode-specific Open Graph metadata for `/game/[id]` page — separate from share images, not in 4c4.

## Success criteria

1. Hitting `/api/share/{standings,live,winner}/[gameId]` for a classic, cup, or turbo game returns a 200 with an `image/png` content-type and the appropriate mode-aware layout.
2. ShareDialog auto-picks the right default variant for the game's current state and the dropdown enables/disables variants correctly.
3. A 30-player game renders without unreadable cells; overflow tails appear where appropriate.
4. Mobile-rendered images (iPhone WhatsApp preview width) are scannable in a single glance for the live and winner cases.
5. Test suite passes. Typecheck clean. Biome clean.
6. The `/api/share/grid/[gameId]` alias still works (deployed dialog unchanged until updated by this phase).
