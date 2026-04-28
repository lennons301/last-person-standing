# Phase 4c5 — Mobile Polish + A11y Sweep: Design Specification

**Status:** Approved for planning (2026-04-27)
**Phase:** 4c5 — fifth and final sub-phase of 4c (match-day live / admin UX / rebuys / Satori / mobile polish)
**Predecessors:** 4c1, 4c2, 4c3, 4c4 — all merged
**Successors:** 4.5 (production launch foundation) — terminal phase
**Ships:** dormant to `main` via PR; no prod deploy (no Vercel project provisioned yet — 4.5's job)

## Overview

A polish-and-cleanup sweep across the existing 4a/4b/4c surfaces. Not a feature phase. Two custom-rolled modals get migrated to shadcn `Dialog` for free a11y wins; mobile width breakages get audited and fixed at iPhone 390px; carry-over deferrals from 4c2/4c3/4c4 get cleared. Eight workstreams, all small enough to land in one branch + PR.

## Goals

1. Modals (`add-player-modal`, `split-pot-modal`) get focus trap + Escape-to-close + `aria-labelledby` via shadcn `Dialog` migration. Biome a11y suppressions go away.
2. Main flows render cleanly on iPhone Safari at 393px without horizontal scroll or unreachable controls.
3. All interactive elements are keyboard-reachable; modals trap focus; visible focus rings on every interactive.
4. ~8 Biome warnings cleared.
5. Carry-over deferrals from 4c2/4c3/4c4 cleared (concrete list in §"Workstreams").

## Non-goals (explicit)

- Formal WCAG 2.1 AA conformance audit. Deferred post-launch.
- Screen-reader testing (NVDA/JAWS/VoiceOver). Deferred.
- Mobile-first re-thinks (bottom navigation, swipe gestures, mobile-only pick UIs). Deferred.
- Color contrast formal audit. Deferred.
- New features. Anything that's "improve the design of X" rather than "fix the broken-on-mobile-or-keyboard X" is out.
- Performance optimization, bundle size, image optimization.
- Visual regression testing infrastructure (4.5+ concern).

## Mobile target

- **Primary:** iPhone Safari at 393px logical width.
- **Secondary:** Chrome Android at 360px.
- Verification: manual smoke in browser DevTools mobile preview. No automated screenshot/visual-regression infrastructure.

## A11y bar

- Keyboard navigation works on all interactive elements (Tab to reach, Enter/Space to activate).
- Modals trap focus (free with shadcn `Dialog`).
- Escape closes modals (free with shadcn `Dialog`).
- Visible focus rings on every interactive (Tailwind `focus-visible:` utilities).
- No formal WCAG conformance claim. No screen-reader testing.

## Workstreams

### W1: Modal a11y migration (highest signal)

`src/components/game/add-player-modal.tsx` and `src/components/game/split-pot-modal.tsx` currently roll their own `<div role="dialog">` with `biome-ignore lint/a11y/*` lines. Migrate both to shadcn `Dialog` from `@/components/ui/dialog` (already used cleanly in `share-dialog.tsx`).

Wins:
- Focus trap, Escape-to-close, `aria-labelledby` come for free.
- All four `biome-ignore lint/a11y/*` suppressions removed.
- Keyboard navigation works automatically.

Tests: existing component tests stay. Add an integration smoke that asserts Escape closes the modal.

### W2: Mobile width pass

Audit + adjust at iPhone 390px (logical 393px). Pages in scope:

- `/` (dashboard)
- `/game/[id]` (per mode: classic, cup, turbo)
- `/game/create` (game creation form)
- `/join/[code]` (join page)

**Audit method:** During implementation, open each page in dev with `just db-reset` data, view at 393px in DevTools mobile preview, catalogue fixes per page in commit messages.

**Likely fixes:**
- Collapse multi-column grids to single column at narrow widths (`grid-cols-2 md:grid-cols-3` patterns).
- Verify horizontal-scroll containers (cup/turbo pick grids in particular) — they should `overflow-x-auto` with sticky player columns.
- Verify ShareDialog at narrow widths (image renders, dropdown reachable, download button reachable).
- Verify rebuy banner stacks correctly (call-to-action button below text on narrow widths).
- Verify game header doesn't truncate game name unreadably.

**Out of scope:** structural rewrites. Fixes are Tailwind utility additions only.

### W3: Keyboard navigation pass

Walk Tab through each main flow. For each interactive element, verify:
- Reachable via Tab in logical order.
- Activates with Enter/Space (buttons) or Enter (links).
- Has a visible focus ring.

**Document any gaps found.** Fix gaps that are simple (`tabIndex`, `<button>` substitution for `<div onClick>`, missing `focus-visible:ring-*`); flag complex ones for follow-up.

**Out of scope:** screen-reader navigation, ARIA landmarks audit.

### W4: Biome warnings cleanup

Current state: ~8 warnings. Mix of:
- `lint/style/noNonNullAssertion` (in `scripts/seed.ts`, `src/app/api/picks/[gameId]/[roundId]/route.ts`)
- `lint/complexity/useOptionalChain` (in `src/lib/game/detail-queries.ts`)
- `lint/suppressions/unused` × 2 (in `add-player-modal`, `split-pot-modal` — go away with W1)

Resolve each. Final state: `pnpm exec biome check .` reports 0 warnings.

### W5: "IN GAME" tag on add-player autocomplete

When admin searches for a user to add via the migrated `add-player-modal`, surface an "(in game)" badge on result rows where the user is already a `game_player` for the current game. Prevents duplicate-add attempts (currently the API returns 409 `already-in-game`, but the UI doesn't anticipate it).

Implementation: `src/app/api/users/search/route.ts` accepts an optional `?gameId=` query param; when present, the response includes `isInGame: boolean` per result. UI renders the badge based on the flag.

### W6: Seed live/winner/split-pot games

Three new seeded games in `scripts/seed.ts` so `just db-reset` puts each share variant in a smoke-testable state:

1. **Live snapshot** — classic game with `currentRound.status='active'` and at least one fixture `status='live'` with non-null `homeScore`/`awayScore`. Triggers `defaultShareVariant='live'`.
2. **Solo winner** — classic game with `status='completed'` and one player with `status='winner'`. Triggers `defaultShareVariant='winner'` with single-winner block.
3. **Split-pot winner** — classic or cup game with `status='completed'` and 2-3 players with `status='winner'`. Triggers `defaultShareVariant='winner'` with split-pot block.

### W7: Remove `/api/share/grid/[gameId]` alias

The legacy route was kept one phase as belt-and-braces. ShareDialog points at `/api/share/standings/[gameId]` directly now. Delete `src/app/api/share/grid/[gameId]/route.tsx`.

### W8: Free-player rebuy in payments panel

Admin-added players with `paymentRowCount=0` are rebuy-eligible per the `isRebuyEligible` predicate but don't appear as a row in the payments panel (which iterates payment rows). Surface them as a "no payment yet" row so the admin Rebuy button is reachable.

Implementation:
- `getGameDetail` in `src/lib/game/detail-queries.ts`: extend the admin payments list builder to also iterate `gamePlayer` rows with no associated payment, emitting a synthetic row with `id: null`, `status: 'unpaid'`, `amount: game.entryFee ?? '0.00'`.
- `payments-panel.tsx`: render the synthetic row; only the "Rebuy player" button shows (no Dispute/Override actions, since there's no payment to act on).
- Type widening: `AdminPayment.id` becomes `string | null`; `status` adds `'unpaid'` literal.

### W9 (conditional): User-search email enumeration hardening

Verify `src/app/api/users/search/route.ts` doesn't differentiate response shape between "email matches a user" and "email doesn't match a user". Specifically:
- HTTP status code identical.
- Response body structure identical (e.g., `{users: []}` vs `{users: [{...}]}` is fine; `{found: false}` vs `{user: {...}}` is a leak).
- Response timing roughly equivalent (don't worry about precise constant-time; a non-issue for this app's threat model).

If the endpoint already responds uniformly, drop W9 from the plan. If it leaks, normalize to a uniform `{users: User[]}` shape.

## Edge cases & invariants

- **Modal migration breaking existing tests**: shadcn `Dialog` may use Radix primitives that interact differently with `userEvent`/`fireEvent`. If existing tests break post-migration, update them to assert on shadcn-rendered structure rather than the old custom `<div>`.
- **Mobile audit reveals deeper issues**: if a page genuinely doesn't work on mobile and would need a structural rewrite, flag it and defer to a future phase. Don't pad 4c5.
- **Free-player synthetic row + isRebuyEligible**: predicate already returns `true` for `paymentRowCount=0` — synthetic row works.
- **Removing `/grid` alias breaks deployed clients**: irrelevant — no Vercel project means no deployed clients yet. The deployed dialog code is the in-repo `share-dialog.tsx` which already uses `/standings`.

## Testing

### Per-workstream

- **W1 (modal a11y)**: existing `add-player-modal` and `split-pot-modal` component tests updated for shadcn `Dialog` rendering. Add Escape-closes test to each.
- **W2 (mobile)**: manual smoke at 393px in DevTools. Per-page commit messages document fixes. No automated visual regression.
- **W3 (keyboard nav)**: manual smoke. Per-issue commit messages.
- **W4 (Biome)**: `pnpm exec biome check .` reports 0 warnings.
- **W5 ("IN GAME" tag)**: extend `users/search/route.test.ts` to test the `?gameId=` branch returns `isInGame: true` for existing players. Add a component test for the autocomplete badge rendering.
- **W6 (seed)**: `just db-reset` runs without error; manual smoke confirms each seeded game opens its expected default share variant in the dialog.
- **W7 (`/grid` removal)**: route file deleted; full suite stays green.
- **W8 (free-player rebuy)**: extend `detail-queries` test to assert a synthetic row is emitted for an admin-added player with no payment. Extend `payments-panel.test.tsx` to assert the row renders with only a Rebuy button.
- **W9 (email enumeration)**: if the leak exists, add a test asserting both "found" and "not-found" responses are byte-identical.

### Full-suite

`pnpm test && pnpm tsc --noEmit && pnpm exec biome check .` must all pass with 0 errors and 0 warnings.

## Rollout

- **Schema changes:** none.
- **Data migrations:** none.
- **Branch:** `feature/phase-4c5-mobile-and-a11y` in `.worktrees/phase-4c5/`.
- **Single PR (#7).** Ships dormant to `main`. No prod deploy until Phase 4.5.
- **Test count target:** 319 (current) → ~325 after new tests for W1, W5, W8 (+W9 if applicable).

## Success criteria

1. `pnpm exec biome check .` reports 0 warnings.
2. Both custom modals migrated to shadcn `Dialog`; no `biome-ignore lint/a11y/*` lines remain in the codebase.
3. Manual mobile smoke at 393px on the 5 pages in scope shows no horizontal scroll, unreachable controls, or unreadable text.
4. Tab navigation traverses all interactive elements on the main flows in logical order; modals trap focus; visible focus rings throughout.
5. `just db-reset` produces seed data exercising all three share variants (standings/live/winner).
6. Admin-added players with `paymentRowCount=0` are visible in the payments panel with a working Rebuy button.
7. `/api/share/grid/[gameId]` returns 404 (file deleted).
8. Test suite passes; typecheck clean.
