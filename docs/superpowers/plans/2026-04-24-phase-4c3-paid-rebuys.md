# Phase 4c3 — Paid Rebuys: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classic-mode paid rebuys, with an `allowRebuys` per-game toggle. Simplifies the payment state machine (player claim → paid; no admin confirm) and migrates admin payment routes to `paymentId`-keyed paths so they're safe for users with multiple payment rows.

**Architecture:** Additive — no schema migrations. `mode_config.allowRebuys` boolean gates new behavior per game. Rebuy = second `payment` row for same `(gameId, userId)` plus a `game_player` status flip back to `alive`. Round 1 pick row is preserved as history. Rebuy window: round 1 finalised → round 2 deadline. New `/payments/rebuy` (player) and `/admin/rebuy/[userId]` (admin) routes; existing admin routes migrate from `[userId]` to `[paymentId]` path params.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + postgres.js, Better Auth, Vitest. All existing project conventions (pnpm, Biome, justfile commands).

---

## Working context

- Branch: `feature/phase-4c3-paid-rebuys`
- Worktree: `.worktrees/phase-4c3/`
- Spec: `docs/superpowers/specs/2026-04-24-phase-4c3-paid-rebuys-design.md`

**Commands** (all run from the worktree root):
- `pnpm test` — full Vitest suite
- `pnpm vitest run <path>` — single-file run
- `pnpm tsc --noEmit` — typecheck
- `pnpm exec biome check --write .` — lint + format
- `just db-reset` — rebuild local DB from migrations + seed (for manual smoke)
- `just dev` — dev server for manual UI verification

**Post-task convention:** after finishing each task's checkboxes, run:
```
pnpm test && pnpm tsc --noEmit && pnpm exec biome check --write .
```
If anything fails, stop and fix before continuing to the next task.

---

## Task 1: Wire up round-1 starting-round exemption with `allowRebuys` gate

**Context:** `classic.ts` accepts an `isStartingRound` option that spares round 1 losses from elimination, but neither `processGameRound` caller passes it in production today (confirmed: `cron/process-rounds/route.ts:41`, `cron/qstash-handler/route.ts:12`). So round 1 currently eliminates losers regardless. 4c3 wires the exemption inside `processGameRound` and gates it on `allowRebuys=false`.

**Files:**
- Modify: `src/lib/game/process-round.ts` (derive `isStartingRound` internally)
- Test: `src/lib/game/process-round.test.ts` (create if not present)

- [ ] **Step 1: Inspect whether `process-round.test.ts` exists**

Run:
```
ls src/lib/game/process-round.test.ts 2>/dev/null || echo "needs-creation"
```

If the file doesn't exist, create it in Step 2 below. If it does exist, add the new tests to it at the bottom of the existing describe block.

- [ ] **Step 2: Write failing tests for the derivation**

Create (or append to) `src/lib/game/process-round.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { processClassicRoundMock } = vi.hoisted(() => ({
  processClassicRoundMock: vi.fn(),
}))
vi.mock('@/lib/game-logic/classic', () => ({
  processClassicRound: processClassicRoundMock,
}))

// Minimal Drizzle mock — mirrors structure used in the real callers.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      game: { findFirst: vi.fn() },
      round: { findFirst: vi.fn() },
      pick: { findMany: vi.fn() },
      gamePlayer: { findMany: vi.fn() },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { processGameRound } from './process-round'

function makeClassicGameAndRound(opts: {
  roundNumber: number
  allowRebuys?: boolean
}) {
  dbMock.query.game.findFirst.mockResolvedValue({
    id: 'g1',
    gameMode: 'classic',
    modeConfig: opts.allowRebuys ? { allowRebuys: true } : {},
    players: [],
    competition: { type: 'standard' },
    competitionId: 'c1',
  } as never)
  dbMock.query.round.findFirst.mockResolvedValue({
    id: 'r1',
    number: opts.roundNumber,
    fixtures: [{ status: 'finished', homeScore: 0, awayScore: 0 }],
  } as never)
  dbMock.query.pick.findMany.mockResolvedValue([])
  processClassicRoundMock.mockReturnValue({ results: [] })
}

describe('processGameRound: isStartingRound derivation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes isStartingRound=true when round 1 and allowRebuys is not set', async () => {
    makeClassicGameAndRound({ roundNumber: 1 })
    await processGameRound('g1', 'r1')
    expect(processClassicRoundMock).toHaveBeenCalledWith(
      expect.objectContaining({ isStartingRound: true }),
    )
  })

  it('passes isStartingRound=false when round 1 but allowRebuys=true', async () => {
    makeClassicGameAndRound({ roundNumber: 1, allowRebuys: true })
    await processGameRound('g1', 'r1')
    expect(processClassicRoundMock).toHaveBeenCalledWith(
      expect.objectContaining({ isStartingRound: false }),
    )
  })

  it('passes isStartingRound=false for round 2 regardless of allowRebuys', async () => {
    makeClassicGameAndRound({ roundNumber: 2, allowRebuys: true })
    await processGameRound('g1', 'r1')
    expect(processClassicRoundMock).toHaveBeenCalledWith(
      expect.objectContaining({ isStartingRound: false }),
    )
  })
})
```

- [ ] **Step 3: Run tests — expect them to fail**

Run: `pnpm vitest run src/lib/game/process-round.test.ts`
Expected: 3 new tests fail because `processGameRound` doesn't currently compute `isStartingRound` (it reads the unused `options?.isStartingRound`).

- [ ] **Step 4: Modify `processGameRound` to derive `isStartingRound` internally**

In `src/lib/game/process-round.ts`:
- Remove the `options?: { isStartingRound?: boolean }` parameter.
- Inside the classic branch (before the `processClassicRound` call), compute:
  ```ts
  const allowRebuys =
    (gameData.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
  const isStartingRound = roundData.number === 1 && !allowRebuys
  ```
- Pass `isStartingRound` to `processClassicRound` instead of `options?.isStartingRound`.

Full signature becomes:
```ts
export async function processGameRound(gameId: string, roundId: string) {
```

- [ ] **Step 5: Run the new tests — expect pass**

Run: `pnpm vitest run src/lib/game/process-round.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all tests pass. The existing callers (`cron/process-rounds/route.ts:41`, `cron/qstash-handler/route.ts:12`) didn't pass the option anyway, so nothing breaks.

- [ ] **Step 7: Commit**

```
git add src/lib/game/process-round.ts src/lib/game/process-round.test.ts
git commit -m "feat(4c3): wire up round-1 starting-round exemption, gate on allowRebuys"
```

---

## Task 2: Add `allowRebuys` to the game creation form + API

**Context:** Per spec §1, `allowRebuys` is a classic-mode-only checkbox stored in `mode_config` JSONB. No schema migration required.

**Files:**
- Modify: `src/components/game/create-game-form.tsx` (add checkbox + state)
- Modify: `src/app/api/games/route.ts` (verify `modeConfig` passthrough)

- [ ] **Step 1: Inspect `src/app/api/games/route.ts` to confirm `modeConfig` is already accepted verbatim**

Read the POST handler. If it's `modeConfig: body.modeConfig` (or spreads), no change is needed server-side — it already accepts arbitrary keys. If the server filters to known keys, add `allowRebuys` to the allowed set.

- [ ] **Step 2: Add `allowRebuys` state + UI to `create-game-form.tsx`**

In `src/components/game/create-game-form.tsx`:

Add state near the other mode-config state (around line 39-40):
```ts
const [allowRebuys, setAllowRebuys] = useState(false)
```

In the `modeConfig` assembly (around line 55-57), add:
```ts
if (mode === 'classic') modeConfig.allowRebuys = allowRebuys
```

Extend the typed `modeConfig` object:
```ts
const modeConfig: {
  numberOfPicks?: number
  startingLives?: number
  allowRebuys?: boolean
} = {}
```

Render the checkbox inside the `step3Done &&` block, between the entry-fee section and the mode-specific inputs (so it only appears for classic mode):

```tsx
{mode === 'classic' && (
  <div className="flex items-start justify-between gap-3">
    <div>
      <Label htmlFor="allow-rebuys-toggle">Allow paid rebuys</Label>
      <p className="text-xs text-muted-foreground mt-0.5">
        If on, round 1 losses eliminate players — and they can pay again to re-enter for round 2.
      </p>
    </div>
    <Switch
      id="allow-rebuys-toggle"
      checked={allowRebuys}
      onCheckedChange={setAllowRebuys}
    />
  </div>
)}
```

- [ ] **Step 3: Manual smoke — verify checkbox renders and flows through**

Run: `just db-reset && just dev`

Open http://localhost:3000/game/create. Check:
- The "Allow paid rebuys" switch appears only for classic mode.
- Creating a classic game with the switch on produces a game whose `mode_config` includes `"allowRebuys": true` in the DB (verify via a quick `psql` query or by reading back the game via API).

- [ ] **Step 4: Commit**

```
git add src/components/game/create-game-form.tsx
git commit -m "feat(4c3): add allowRebuys toggle to classic game creation form"
```

---

## Task 3: Pure `isRebuyEligible` predicate + tests

**Context:** Per spec §5.1. Pure function, no DB. Used by both UI (to decide whether to show the banner) and API (to gate the rebuy endpoint inside a transaction).

**Files:**
- Create: `src/lib/game/rebuy.ts`
- Create: `src/lib/game/rebuy.test.ts`

- [ ] **Step 1: Write `rebuy.test.ts` with the predicate's expected behavior**

```ts
import { describe, expect, it } from 'vitest'
import { isRebuyEligible, type IsRebuyEligibleArgs } from './rebuy'

function base(overrides: Partial<IsRebuyEligibleArgs> = {}): IsRebuyEligibleArgs {
  return {
    game: {
      gameMode: 'classic',
      modeConfig: { allowRebuys: true },
    },
    gamePlayer: {
      status: 'eliminated',
      eliminatedRoundId: 'r1',
    },
    round1: { id: 'r1' },
    round2: { id: 'r2', deadline: new Date('2026-05-10T12:00:00Z') },
    paymentRowCount: 1,
    now: new Date('2026-05-08T12:00:00Z'),
    ...overrides,
  }
}

describe('isRebuyEligible', () => {
  it('returns true on the happy path', () => {
    expect(isRebuyEligible(base())).toBe(true)
  })

  it('false when gameMode !== classic', () => {
    expect(isRebuyEligible(base({ game: { gameMode: 'turbo', modeConfig: { allowRebuys: true } } }))).toBe(false)
  })

  it('false when allowRebuys is not true', () => {
    expect(isRebuyEligible(base({ game: { gameMode: 'classic', modeConfig: {} } }))).toBe(false)
    expect(isRebuyEligible(base({ game: { gameMode: 'classic', modeConfig: { allowRebuys: false } } }))).toBe(false)
  })

  it('false when player is still alive', () => {
    expect(isRebuyEligible(base({ gamePlayer: { status: 'alive', eliminatedRoundId: null } }))).toBe(false)
  })

  it('false when eliminated in a round other than round 1', () => {
    expect(isRebuyEligible(base({ gamePlayer: { status: 'eliminated', eliminatedRoundId: 'r2' } }))).toBe(false)
  })

  it('false when now >= round 2 deadline', () => {
    expect(isRebuyEligible(base({ now: new Date('2026-05-10T12:00:00Z') }))).toBe(false)
    expect(isRebuyEligible(base({ now: new Date('2026-05-10T12:00:01Z') }))).toBe(false)
  })

  it('false when paymentRowCount >= 2 (already rebought)', () => {
    expect(isRebuyEligible(base({ paymentRowCount: 2 }))).toBe(false)
    expect(isRebuyEligible(base({ paymentRowCount: 3 }))).toBe(false)
  })

  it('true when paymentRowCount is 0 (admin-added player, no initial payment)', () => {
    expect(isRebuyEligible(base({ paymentRowCount: 0 }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test — expect fails (file doesn't exist)**

Run: `pnpm vitest run src/lib/game/rebuy.test.ts`
Expected: FAIL — "Cannot find module './rebuy'".

- [ ] **Step 3: Create `src/lib/game/rebuy.ts`**

```ts
export interface IsRebuyEligibleArgs {
  game: {
    gameMode: 'classic' | 'turbo' | 'cup'
    modeConfig: { allowRebuys?: boolean } | null | undefined
  }
  gamePlayer: {
    status: 'alive' | 'eliminated' | 'winner'
    eliminatedRoundId: string | null
  }
  round1: { id: string }
  round2: { deadline: Date | null }
  paymentRowCount: number
  now: Date
}

export function isRebuyEligible(args: IsRebuyEligibleArgs): boolean {
  if (args.game.gameMode !== 'classic') return false
  if (args.game.modeConfig?.allowRebuys !== true) return false
  if (args.gamePlayer.status !== 'eliminated') return false
  if (args.gamePlayer.eliminatedRoundId !== args.round1.id) return false
  if (!args.round2.deadline) return false
  if (args.now.getTime() >= args.round2.deadline.getTime()) return false
  if (args.paymentRowCount >= 2) return false
  return true
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm vitest run src/lib/game/rebuy.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```
git add src/lib/game/rebuy.ts src/lib/game/rebuy.test.ts
git commit -m "feat(4c3): add isRebuyEligible predicate"
```

---

## Task 4: Simplify payment claim flow — `pending → paid`, require `paymentId`

**Context:** Per spec §3 and §5.4. Player clicks "Claim paid" → payment jumps straight to `paid`. Admin confirmation is no longer part of the happy path. Claim route now requires a `paymentId` body parameter.

**Files:**
- Modify: `src/app/api/games/[id]/payments/claim/route.ts`
- Modify: `src/app/api/games/[id]/payments/claim/route.test.ts`
- Modify: `src/components/game/payments-panel.tsx` (drop the "confirm" action; already has "revert")
- Modify: `src/components/game/other-players-payments.tsx` (if it triggers claim — usually doesn't, but check)

- [ ] **Step 1: Update the claim route test to new expectations**

Replace the contents of `src/app/api/games/[id]/payments/claim/route.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))
vi.mock('@/lib/db', () => ({
  db: {
    query: { payment: { findFirst: vi.fn() } },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1' }) }

function req(body: unknown): Request {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('claim payment route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400s if paymentId is missing', async () => {
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(400)
  })

  it('404s if payment row does not exist', async () => {
    vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
    const res = await POST(req({ paymentId: 'p1' }), ctx)
    expect(res.status).toBe(404)
  })

  it('404s if payment belongs to a different user', async () => {
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({
      id: 'p1',
      userId: 'someone-else',
      gameId: 'g1',
      status: 'pending',
    } as never)
    const res = await POST(req({ paymentId: 'p1' }), ctx)
    expect(res.status).toBe(404)
  })

  it('400s if payment is not pending', async () => {
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      gameId: 'g1',
      status: 'paid',
    } as never)
    const res = await POST(req({ paymentId: 'p1' }), ctx)
    expect(res.status).toBe(400)
  })

  it('200s for a pending payment — sets paid directly (no intermediate claimed)', async () => {
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      gameId: 'g1',
      status: 'pending',
    } as never)
    const res = await POST(req({ paymentId: 'p1' }), ctx)
    expect(res.status).toBe(200)

    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ status: 'paid' })
    expect(setCall?.paidAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run the test — expect failures**

Run: `pnpm vitest run src/app/api/games/[id]/payments/claim/route.test.ts`
Expected: 5 tests, most fail because route currently sets `claimed` not `paid` and doesn't accept `paymentId`.

- [ ] **Step 3: Rewrite the claim route**

Replace `src/app/api/games/[id]/payments/claim/route.ts` with:

```ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession()
  const { id: gameId } = await ctx.params

  const body = (await request.json().catch(() => null)) as { paymentId?: string } | null
  if (!body?.paymentId) {
    return NextResponse.json({ error: 'missing-paymentId' }, { status: 400 })
  }

  const existing = await db.query.payment.findFirst({
    where: and(
      eq(payment.id, body.paymentId),
      eq(payment.gameId, gameId),
      eq(payment.userId, session.user.id),
    ),
  })
  if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'not-pending' }, { status: 400 })
  }
  await db
    .update(payment)
    .set({ status: 'paid', paidAt: new Date() })
    .where(eq(payment.id, existing.id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm vitest run src/app/api/games/[id]/payments/claim/route.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Update UI callsites to supply `paymentId` and drop the confirm action from the panel**

In `src/components/game/payments-panel.tsx`:
- Remove the `'confirm'` case from `callAction`'s endpoint-resolution.
- Remove the entire `claimed` "Needs your attention" section (lines ~28, 74-105) — no new rows will be `claimed` post-4c3.
- Remove the "Reject" button in the claimed section (moves to paymentId-keyed in Task 5).

Temporarily simplify the panel to show only the "All payments" list + the existing "Revert" button (which will be refactored to paymentId in Task 5). Diff sketch:

```tsx
// Replace top-of-function computation
const all = props.payments
const unpaidCount = all.filter((p) => p.status === 'pending').length

async function callAction(
  userId: string, // temporarily keep; changes in Task 5
  action: 'revert',
) {
  // TEMP: still routes through /[userId]/override until Task 5
  const res = await fetch(`/api/games/${props.gameId}/payments/${userId}/override`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  })
  if (res.ok) { toast.success('Payment reverted'); props.onChange?.() }
  else toast.error('Failed to revert')
}
```

And in the JSX, delete the `{claimed.length > 0 && ...}` block. Keep the "All payments" section.

**Update the subtitle** (line 60):
```tsx
<div className="text-[11px] text-muted-foreground">
  {unpaidCount} unpaid
</div>
```

**Update `src/components/game/my-payment-strip.tsx`** (the player-side "Claim paid" button — verified caller at line 27). Change the `fetch` call to include the `paymentId` in the body:

```tsx
const res = await fetch(`/api/games/${gameId}/payments/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ paymentId }),
})
```

The component needs to accept a `paymentId` prop. Check how it's currently called from its parent (likely `game-detail-view.tsx` or `page.tsx`) and thread the ID through — the parent already has access to the payment row in the detail-query response.

- [ ] **Step 6: Run typecheck + full suite**

```
pnpm tsc --noEmit
pnpm test
```

Expected: both pass. The `confirm` route test is still passing because we haven't deleted it yet (that's Task 5).

- [ ] **Step 7: Commit**

```
git add src/app/api/games/[id]/payments/claim src/components/game
git commit -m "feat(4c3): player claim sets payment to paid directly (requires paymentId)"
```

---

## Task 5: Migrate admin payment routes to `paymentId`-keyed paths; retire `confirm`

**Context:** Per spec §4. Moves admin `reject` and `override` from `/[userId]/*` to `/[paymentId]/*`. Inverts `reject` semantics: `paid → pending` (dispute a claim). Deletes the `confirm` route (now obsolete). Also deletes the `PATCH /admin/payments` method (keep only `GET`).

**Files:**
- Create: `src/app/api/games/[id]/payments/[paymentId]/reject/route.ts`
- Create: `src/app/api/games/[id]/payments/[paymentId]/reject/route.test.ts`
- Create: `src/app/api/games/[id]/payments/[paymentId]/override/route.ts`
- Create: `src/app/api/games/[id]/payments/[paymentId]/override/route.test.ts`
- Delete: `src/app/api/games/[id]/payments/[userId]/confirm/` (whole folder)
- Delete: `src/app/api/games/[id]/payments/[userId]/reject/` (whole folder)
- Delete: `src/app/api/games/[id]/payments/[userId]/override/` (whole folder)
- Modify: `src/app/api/games/[id]/admin/payments/route.ts` (remove PATCH method; keep GET)
- Modify: `src/components/game/payments-panel.tsx` (switch to paymentId paths, add Dispute action)

- [ ] **Step 1: Write failing tests for the new `reject` route**

Create `src/app/api/games/[id]/payments/[paymentId]/reject/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      game: { findFirst: vi.fn() },
      payment: { findFirst: vi.fn() },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1', paymentId: 'p1' }) }

describe('admin payment reject route (paymentId-keyed)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('404s if game not found', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(404)
  })

  it('403s if caller is not the creator', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone' } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('404s if payment row does not exist', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(404)
  })

  it('400s if payment is not currently paid', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({
      id: 'p1',
      gameId: 'g1',
      status: 'pending',
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(400)
  })

  it('200s and flips paid → pending, clearing paidAt', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({
      id: 'p1',
      gameId: 'g1',
      status: 'paid',
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(200)
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ status: 'pending', paidAt: null })
  })
})
```

- [ ] **Step 2: Run the test — expect fails (no file yet)**

Run: `pnpm vitest run src/app/api/games/[id]/payments/[paymentId]/reject/route.test.ts`
Expected: FAIL — "Cannot find module './route'".

- [ ] **Step 3: Implement the new `reject` route**

Create `src/app/api/games/[id]/payments/[paymentId]/reject/route.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; paymentId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession()
  const { id: gameId, paymentId } = await ctx.params

  const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
  if (!g) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (g.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const existing = await db.query.payment.findFirst({
    where: and(eq(payment.id, paymentId), eq(payment.gameId, gameId)),
  })
  if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (existing.status !== 'paid') {
    return NextResponse.json({ error: 'not-paid' }, { status: 400 })
  }

  await db
    .update(payment)
    .set({ status: 'pending', paidAt: null })
    .where(eq(payment.id, existing.id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the new reject tests — expect pass**

Run: `pnpm vitest run src/app/api/games/[id]/payments/[paymentId]/reject/route.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Write failing tests for the new `override` route**

Create `src/app/api/games/[id]/payments/[paymentId]/override/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      game: { findFirst: vi.fn() },
      payment: { findFirst: vi.fn() },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1', paymentId: 'p1' }) }

function req(body: unknown): Request {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('admin payment override route (paymentId-keyed)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('403s if caller is not the creator', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone' } as never)
    const res = await POST(req({ status: 'paid' }), ctx)
    expect(res.status).toBe(403)
  })

  it('400s on invalid status', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    const res = await POST(req({ status: 'claimed' }), ctx) // claimed no longer allowed
    expect(res.status).toBe(400)
  })

  it('404s if payment does not exist', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
    const res = await POST(req({ status: 'paid' }), ctx)
    expect(res.status).toBe(404)
  })

  it('sets status=paid with paidAt', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
    const res = await POST(req({ status: 'paid' }), ctx)
    expect(res.status).toBe(200)
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall?.status).toBe('paid')
    expect(setCall?.paidAt).toBeInstanceOf(Date)
  })

  it('sets status=pending with paidAt=null', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
    const res = await POST(req({ status: 'pending' }), ctx)
    expect(res.status).toBe(200)
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ status: 'pending', paidAt: null })
  })

  it('sets status=refunded with refundedAt', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'admin' } as never)
    vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', gameId: 'g1' } as never)
    const res = await POST(req({ status: 'refunded' }), ctx)
    expect(res.status).toBe(200)
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall?.status).toBe('refunded')
    expect(setCall?.refundedAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 6: Implement the new `override` route**

Create `src/app/api/games/[id]/payments/[paymentId]/override/route.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; paymentId: string }> }

type OverrideStatus = 'pending' | 'paid' | 'refunded'
const ALLOWED: OverrideStatus[] = ['pending', 'paid', 'refunded']

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession()
  const { id: gameId, paymentId } = await ctx.params

  const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
  if (!g) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (g.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { status?: OverrideStatus } | null
  const status = body?.status
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'invalid-status' }, { status: 400 })
  }

  const existing = await db.query.payment.findFirst({
    where: and(eq(payment.id, paymentId), eq(payment.gameId, gameId)),
  })
  if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  const update: {
    status: OverrideStatus
    claimedAt?: Date | null
    paidAt?: Date | null
    refundedAt?: Date | null
  } = { status }
  if (status === 'pending') {
    update.claimedAt = null
    update.paidAt = null
  } else if (status === 'paid') {
    update.paidAt = new Date()
  } else if (status === 'refunded') {
    update.refundedAt = new Date()
  }

  await db.update(payment).set(update).where(eq(payment.id, existing.id))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Run the new override tests — expect pass**

Run: `pnpm vitest run src/app/api/games/[id]/payments/[paymentId]/override/route.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 8: Remove the PATCH handler from `src/app/api/games/[id]/admin/payments/route.ts` (keep GET)**

Open the file, delete the `export async function PATCH` block and its imports that aren't needed by `GET`. Verify `GET` still returns the full list as before.

- [ ] **Step 9: Delete the old `[userId]`-keyed routes**

```
rm -rf src/app/api/games/\[id\]/payments/\[userId\]
```

This removes `confirm/`, `reject/`, and `override/` under the `[userId]` folder along with their test files.

- [ ] **Step 10: Update `payments-panel.tsx` to use paymentId-keyed paths**

In `src/components/game/payments-panel.tsx`:
- Extend `AdminPayment` with `id: string` (the paymentId).
- Rewrite `callAction` to use `paymentId` and support `'dispute' | 'override-pending' | 'override-refunded'`:

```ts
export interface AdminPayment {
  id: string
  userId: string
  userName: string
  amount: string
  status: PaymentStatus
  isRebuy: boolean
  claimedAt: Date | null
  paidAt: Date | null
}

async function callAction(
  paymentId: string,
  action: 'dispute' | 'revert-to-pending' | 'mark-paid' | 'refund',
) {
  const endpoint =
    action === 'dispute'
      ? `reject`
      : `override`
  const body =
    action === 'revert-to-pending'
      ? JSON.stringify({ status: 'pending' })
      : action === 'mark-paid'
      ? JSON.stringify({ status: 'paid' })
      : action === 'refund'
      ? JSON.stringify({ status: 'refunded' })
      : undefined
  const res = await fetch(`/api/games/${props.gameId}/payments/${paymentId}/${endpoint}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body,
  })
  if (res.ok) {
    toast.success(
      action === 'dispute'
        ? 'Payment disputed'
        : action === 'refund'
        ? 'Payment refunded'
        : 'Payment updated',
    )
    props.onChange?.()
  } else {
    toast.error('Action failed')
  }
}
```

In the row rendering, replace the old "Revert" button and add a "Dispute" button for `status === 'paid'`:

```tsx
actions={
  p.status === 'paid' ? (
    <>
      <button
        type="button"
        onClick={() => callAction(p.id, 'dispute')}
        className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700"
      >
        Dispute
      </button>
    </>
  ) : p.status === 'pending' ? (
    <PaymentReminderButton
      gameName={props.gameName}
      amount={p.amount}
      creatorName="you"
      inviteCode={props.inviteCode}
    />
  ) : null
}
```

Also: update the upstream query in `src/lib/game/detail-queries.ts` (the section that builds the `AdminPayment[]` for the panel — search for the existing `isRebuy: idx > 0` spot around line 111) to include `id: p.id` for each payment.

- [ ] **Step 11: Run the full test suite**

```
pnpm test
pnpm tsc --noEmit
```

Expected: all tests pass. The old `[userId]`-route tests are gone with the folders.

- [ ] **Step 12: Commit**

```
git add -A
git commit -m "refactor(4c3): migrate admin payment routes to paymentId-keyed paths"
```

---

## Task 6: Player-initiated rebuy API route

**Context:** Per spec §5.2. Creates a new pending payment + flips `game_player.status=alive`, inside a transaction. Preserves the round 1 pick row (per spec update — rebuy undoes consequence, not history).

**Files:**
- Create: `src/app/api/games/[id]/payments/rebuy/route.ts`
- Create: `src/app/api/games/[id]/payments/rebuy/route.test.ts`

- [ ] **Step 1: Write failing tests for the rebuy route**

Create `src/app/api/games/[id]/payments/rebuy/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      game: { findFirst: vi.fn() },
      gamePlayer: { findFirst: vi.fn() },
      round: { findMany: vi.fn() },
      payment: { findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'pnew', status: 'pending' }]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    transaction: vi.fn(async (cb) => cb(dbMock)),
  },
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1' }) }

function happyPathMocks() {
  vi.mocked(db.query.game.findFirst).mockResolvedValue({
    id: 'g1',
    gameMode: 'classic',
    modeConfig: { allowRebuys: true },
    entryFee: '10.00',
  } as never)
  vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
    id: 'gp1',
    userId: 'u1',
    status: 'eliminated',
    eliminatedRoundId: 'r1',
  } as never)
  vi.mocked(db.query.round.findMany).mockResolvedValue([
    { id: 'r1', number: 1, deadline: new Date('2026-05-01') },
    { id: 'r2', number: 2, deadline: new Date('2026-05-10T12:00:00Z') },
  ] as never)
  vi.mocked(db.query.payment.findMany).mockResolvedValue([
    { id: 'p1', userId: 'u1', gameId: 'g1' },
  ] as never)
}

describe('player rebuy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))
  })

  it('404s if game does not exist', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(404)
  })

  it('403s if game does not have allowRebuys=true', async () => {
    happyPathMocks()
    vi.mocked(db.query.game.findFirst).mockResolvedValue({
      id: 'g1',
      gameMode: 'classic',
      modeConfig: { allowRebuys: false },
      entryFee: '10.00',
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('403s if player is still alive', async () => {
    happyPathMocks()
    vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
      id: 'gp1',
      userId: 'u1',
      status: 'alive',
      eliminatedRoundId: null,
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('403s if player is eliminated in a round other than round 1', async () => {
    happyPathMocks()
    vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
      id: 'gp1',
      userId: 'u1',
      status: 'eliminated',
      eliminatedRoundId: 'r2',
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('403s if now >= round 2 deadline', async () => {
    happyPathMocks()
    vi.setSystemTime(new Date('2026-05-10T12:00:01Z'))
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('403s if already rebought (paymentRowCount >= 2)', async () => {
    happyPathMocks()
    vi.mocked(db.query.payment.findMany).mockResolvedValue([
      { id: 'p1', userId: 'u1', gameId: 'g1' },
      { id: 'p2', userId: 'u1', gameId: 'g1' },
    ] as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('200s on happy path and runs inside a transaction', async () => {
    happyPathMocks()
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(200)
    expect(db.transaction).toHaveBeenCalledTimes(1)

    // New payment row inserted
    expect(db.insert).toHaveBeenCalled()
    // Game player flipped to alive
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })

    // Response includes paymentId
    const json = await res.json()
    expect(json).toMatchObject({ paymentId: 'pnew', status: 'pending' })
  })
})
```

- [ ] **Step 2: Run the tests — expect fails (no file yet)**

Run: `pnpm vitest run src/app/api/games/[id]/payments/rebuy/route.test.ts`
Expected: FAIL — "Cannot find module './route'".

- [ ] **Step 3: Implement the rebuy route**

Create `src/app/api/games/[id]/payments/rebuy/route.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession()
  const { id: gameId } = await ctx.params
  const userId = session.user.id

  const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
  if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  const playerRow = await db.query.gamePlayer.findFirst({
    where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, userId)),
  })
  if (!playerRow) return NextResponse.json({ error: 'not-in-game' }, { status: 404 })

  const rounds = await db.query.round.findMany({
    where: eq(round.competitionId, gameRow.competitionId),
  })
  const round1 = rounds.find((r) => r.number === 1)
  const round2 = rounds.find((r) => r.number === 2)
  if (!round1 || !round2) {
    return NextResponse.json({ error: 'rounds-not-set-up' }, { status: 400 })
  }

  const payments = await db.query.payment.findMany({
    where: and(eq(payment.gameId, gameId), eq(payment.userId, userId)),
  })

  const eligible = isRebuyEligible({
    game: {
      gameMode: gameRow.gameMode,
      modeConfig: gameRow.modeConfig as { allowRebuys?: boolean } | null,
    },
    gamePlayer: {
      status: playerRow.status,
      eliminatedRoundId: playerRow.eliminatedRoundId,
    },
    round1: { id: round1.id },
    round2: { deadline: round2.deadline },
    paymentRowCount: payments.length,
    now: new Date(),
  })
  if (!eligible) return NextResponse.json({ error: 'not-eligible' }, { status: 403 })

  let insertedPaymentId = ''
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(payment)
      .values({
        gameId,
        userId,
        amount: gameRow.entryFee ?? '0.00',
        status: 'pending',
        method: 'manual',
      })
      .returning()
    insertedPaymentId = inserted.id

    await tx
      .update(gamePlayer)
      .set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
      .where(eq(gamePlayer.id, playerRow.id))
  })

  return NextResponse.json({ paymentId: insertedPaymentId, status: 'pending' })
}
```

- [ ] **Step 4: Run the rebuy tests — expect pass**

Run: `pnpm vitest run src/app/api/games/[id]/payments/rebuy/route.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/api/games/[id]/payments/rebuy
git commit -m "feat(4c3): add player-initiated rebuy API route"
```

---

## Task 7: Admin-initiated rebuy API route

**Context:** Per spec §5.3. Same transaction shape as Task 6 but targets any user (admin acts on their behalf). Admin is still bound by window + eligibility — they can't force a rebuy outside the round 2 deadline or for someone who's already rebought.

**Files:**
- Create: `src/app/api/games/[id]/admin/rebuy/[userId]/route.ts`
- Create: `src/app/api/games/[id]/admin/rebuy/[userId]/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/games/[id]/admin/rebuy/[userId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'admin' } }),
}))

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      game: { findFirst: vi.fn() },
      gamePlayer: { findFirst: vi.fn() },
      round: { findMany: vi.fn() },
      payment: { findMany: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'pnew', status: 'pending' }]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    transaction: vi.fn(async (cb) => cb(dbMock)),
  },
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

import { db } from '@/lib/db'
import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'g1', userId: 'target' }) }

function happyPathMocks() {
  vi.mocked(db.query.game.findFirst).mockResolvedValue({
    id: 'g1',
    createdBy: 'admin',
    gameMode: 'classic',
    modeConfig: { allowRebuys: true },
    entryFee: '10.00',
    competitionId: 'c1',
  } as never)
  vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
    id: 'gp-target',
    userId: 'target',
    status: 'eliminated',
    eliminatedRoundId: 'r1',
  } as never)
  vi.mocked(db.query.round.findMany).mockResolvedValue([
    { id: 'r1', number: 1, deadline: new Date('2026-05-01') },
    { id: 'r2', number: 2, deadline: new Date('2026-05-10T12:00:00Z') },
  ] as never)
  vi.mocked(db.query.payment.findMany).mockResolvedValue([
    { id: 'p1', userId: 'target', gameId: 'g1' },
  ] as never)
}

describe('admin rebuy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))
  })

  it('403s if caller is not the creator', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue({ createdBy: 'someone-else' } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('403s if target is not eligible', async () => {
    happyPathMocks()
    vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({
      id: 'gp-target',
      userId: 'target',
      status: 'alive',
      eliminatedRoundId: null,
    } as never)
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(403)
  })

  it('200s on happy path and flips target to alive', async () => {
    happyPathMocks()
    const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
    expect(res.status).toBe(200)
    expect(db.transaction).toHaveBeenCalledTimes(1)
    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
  })
})
```

- [ ] **Step 2: Run tests — expect fails**

Run: `pnpm vitest run src/app/api/games/[id]/admin/rebuy/[userId]/route.test.ts`
Expected: FAIL — "Cannot find module './route'".

- [ ] **Step 3: Implement the admin rebuy route**

Create `src/app/api/games/[id]/admin/rebuy/[userId]/route.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { isRebuyEligible } from '@/lib/game/rebuy'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession()
  const { id: gameId, userId: targetUserId } = await ctx.params

  const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
  if (!gameRow) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  if (gameRow.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const playerRow = await db.query.gamePlayer.findFirst({
    where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, targetUserId)),
  })
  if (!playerRow) return NextResponse.json({ error: 'not-in-game' }, { status: 404 })

  const rounds = await db.query.round.findMany({
    where: eq(round.competitionId, gameRow.competitionId),
  })
  const round1 = rounds.find((r) => r.number === 1)
  const round2 = rounds.find((r) => r.number === 2)
  if (!round1 || !round2) {
    return NextResponse.json({ error: 'rounds-not-set-up' }, { status: 400 })
  }

  const payments = await db.query.payment.findMany({
    where: and(eq(payment.gameId, gameId), eq(payment.userId, targetUserId)),
  })

  const eligible = isRebuyEligible({
    game: {
      gameMode: gameRow.gameMode,
      modeConfig: gameRow.modeConfig as { allowRebuys?: boolean } | null,
    },
    gamePlayer: {
      status: playerRow.status,
      eliminatedRoundId: playerRow.eliminatedRoundId,
    },
    round1: { id: round1.id },
    round2: { deadline: round2.deadline },
    paymentRowCount: payments.length,
    now: new Date(),
  })
  if (!eligible) return NextResponse.json({ error: 'not-eligible' }, { status: 403 })

  let insertedPaymentId = ''
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(payment)
      .values({
        gameId,
        userId: targetUserId,
        amount: gameRow.entryFee ?? '0.00',
        status: 'pending',
        method: 'manual',
      })
      .returning()
    insertedPaymentId = inserted.id

    await tx
      .update(gamePlayer)
      .set({ status: 'alive', eliminatedRoundId: null, eliminatedReason: null })
      .where(eq(gamePlayer.id, playerRow.id))
  })

  return NextResponse.json({ paymentId: insertedPaymentId, status: 'pending' })
}
```

- [ ] **Step 4: Run the tests — expect pass**

Run: `pnpm vitest run src/app/api/games/[id]/admin/rebuy/[userId]/route.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/api/games/[id]/admin/rebuy
git commit -m "feat(4c3): add admin-initiated rebuy API route"
```

---

## Task 8: Extend no-pick-handler for classic rounds 1 and 2

**Context:** Per spec §2.2. `no-pick-handler.ts` currently only handles classic round 3+ (rule 2 auto-pick); round 1–2 classic no-picks fall through. 4c3 fills the gap so (a) round 1 no-pick in `allowRebuys` games eliminates the player (making them rebuy-eligible), and (b) round 2 no-pick always eliminates, with `missed_rebuy_pick` when the player has > 1 payment rows.

**Files:**
- Modify: `src/lib/game/no-pick-handler.ts`
- Modify: `src/lib/game/no-pick-handler.test.ts`

- [ ] **Step 1: Extend the mock in `no-pick-handler.test.ts` and add failing tests**

The existing mock declares `payment: { findFirst: vi.fn() }`. The new handler branches call `db.query.payment.findMany`, so extend the mock first. Replace the existing `vi.mock('@/lib/db', ...)` block at the top of the file with:

```ts
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      round: { findFirst: vi.fn().mockResolvedValue(undefined) },
      game: { findMany: vi.fn().mockResolvedValue([]) },
      pick: { findFirst: vi.fn(), findMany: vi.fn() },
      fixture: { findMany: vi.fn() },
      team: { findMany: vi.fn() },
      payment: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      gamePlayer: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
}))

import { db } from '@/lib/db'
import { beforeEach } from 'vitest'
```

Add (near the top, after imports):

```ts
function makeClassicPlayer(overrides: Partial<{ id: string; userId: string; status: string }> = {}) {
  return {
    id: 'p1',
    userId: 'u1',
    status: 'alive',
    eliminatedRoundId: null,
    eliminatedReason: null,
    livesRemaining: 0,
    ...overrides,
  } as never
}

function makeClassicGame(allowRebuys: boolean, players: object[]) {
  return {
    id: 'g1',
    gameMode: 'classic',
    modeConfig: allowRebuys ? { allowRebuys: true } : {},
    status: 'active',
    currentRoundId: 'r1',
    players,
  } as never
}
```

Then append this describe block:

```ts
describe('processDeadlineLock — classic round 1 & 2 (4c3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('eliminates classic round 1 no-pick player when allowRebuys=true', async () => {
    vi.mocked(db.query.round.findFirst).mockResolvedValue({
      id: 'r1',
      number: 1,
    } as never)
    vi.mocked(db.query.game.findMany).mockResolvedValue([
      makeClassicGame(true, [makeClassicPlayer()]),
    ])
    vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)

    const result = await processDeadlineLock(['r1'])
    expect(result.playersEliminated).toBe(1)

    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      status: 'eliminated',
      eliminatedReason: 'no_pick_no_fallback',
      eliminatedRoundId: 'r1',
    })
  })

  it('does NOT eliminate classic round 1 no-pick player when allowRebuys=false', async () => {
    vi.mocked(db.query.round.findFirst).mockResolvedValue({
      id: 'r1',
      number: 1,
    } as never)
    vi.mocked(db.query.game.findMany).mockResolvedValue([
      makeClassicGame(false, [makeClassicPlayer()]),
    ])
    vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)

    const result = await processDeadlineLock(['r1'])
    expect(result.playersEliminated).toBe(0)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('eliminates classic round 2 no-pick with missed_rebuy_pick when paymentRowCount > 1', async () => {
    vi.mocked(db.query.round.findFirst).mockResolvedValue({
      id: 'r2',
      number: 2,
    } as never)
    vi.mocked(db.query.game.findMany).mockResolvedValue([
      makeClassicGame(true, [makeClassicPlayer()]),
    ])
    vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
    vi.mocked(db.query.payment.findMany).mockResolvedValue([
      { id: 'pay1' },
      { id: 'pay2' },
    ] as never)

    const result = await processDeadlineLock(['r2'])
    expect(result.playersEliminated).toBe(1)

    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      status: 'eliminated',
      eliminatedReason: 'missed_rebuy_pick',
      eliminatedRoundId: 'r2',
    })
  })

  it('eliminates classic round 2 no-pick with no_pick_no_fallback when paymentRowCount <= 1', async () => {
    vi.mocked(db.query.round.findFirst).mockResolvedValue({
      id: 'r2',
      number: 2,
    } as never)
    vi.mocked(db.query.game.findMany).mockResolvedValue([
      makeClassicGame(true, [makeClassicPlayer()]),
    ])
    vi.mocked(db.query.pick.findFirst).mockResolvedValue(undefined as never)
    vi.mocked(db.query.payment.findMany).mockResolvedValue([{ id: 'pay1' }] as never)

    const result = await processDeadlineLock(['r2'])
    expect(result.playersEliminated).toBe(1)

    const setCall = vi.mocked(db.update).mock.results[0]?.value.set.mock.calls[0]?.[0]
    expect(setCall).toMatchObject({
      status: 'eliminated',
      eliminatedReason: 'no_pick_no_fallback',
      eliminatedRoundId: 'r2',
    })
  })
})
```

- [ ] **Step 2: Run tests — expect fails**

Run: `pnpm vitest run src/lib/game/no-pick-handler.test.ts`
Expected: 4 new tests fail (the handler doesn't currently dispatch on round 1/2 for classic).

- [ ] **Step 3: Extend `no-pick-handler.ts`**

In `src/lib/game/no-pick-handler.ts`, modify the dispatch block (currently around line 34-43):

```ts
if (g.gameMode === 'classic') {
  if (roundRow.number === 1) {
    const allowRebuys =
      (g.modeConfig as { allowRebuys?: boolean } | null)?.allowRebuys === true
    if (allowRebuys) {
      await db
        .update(gamePlayer)
        .set({
          status: 'eliminated',
          eliminatedReason: 'no_pick_no_fallback',
          eliminatedRoundId: roundId,
        })
        .where(eq(gamePlayer.id, player.id))
      playersEliminated++
    }
    // When !allowRebuys in round 1: the classic.ts exemption logic already lets
    // them through without a pick; we leave them alone here (preserves
    // existing behavior).
  } else if (roundRow.number === 2) {
    const prevPayments = await db.query.payment.findMany({
      where: and(eq(payment.gameId, g.id), eq(payment.userId, player.userId)),
    })
    const reason =
      prevPayments.length > 1 ? 'missed_rebuy_pick' : 'no_pick_no_fallback'
    await db
      .update(gamePlayer)
      .set({
        status: 'eliminated',
        eliminatedReason: reason,
        eliminatedRoundId: roundId,
      })
      .where(eq(gamePlayer.id, player.id))
    playersEliminated++
  } else {
    // roundRow.number >= 3 — existing rule 2 auto-pick
    const result = await applyRule2Classic(g.id, player, roundId)
    if (result === 'auto-pick-inserted') autoPicksInserted++
    else if (result === 'eliminated-no-fallback') playersEliminated++
  }
} else if (g.gameMode === 'turbo' || g.gameMode === 'cup') {
  const result = await applyRule3TurboOrCup(g.id, player, roundId)
  playersEliminated++
  if (result.refunded) paymentsRefunded++
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/lib/game/no-pick-handler.test.ts`
Expected: all tests (existing + 4 new) pass.

- [ ] **Step 5: Full suite check**

Run: `pnpm test && pnpm tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```
git add src/lib/game/no-pick-handler.ts src/lib/game/no-pick-handler.test.ts
git commit -m "feat(4c3): handle classic round 1 & 2 no-pick paths"
```

---

## Task 9: Rebuy banner component

**Context:** Per spec §6.2. Two states: pre-payment (show "Rebuy £N" button) and pending-payment (show "Claim paid" button). Both live on the game detail page.

**Files:**
- Create: `src/components/game/rebuy-banner.tsx`

- [ ] **Step 1: Create the banner component**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface RebuyBannerProps {
  gameId: string
  entryFee: string
  round2Deadline: Date
  /** If set, the user has a pending rebuy payment awaiting claim. */
  pendingPayment: { id: string; amount: string } | null
}

export function RebuyBanner({
  gameId,
  entryFee,
  round2Deadline,
  pendingPayment,
}: RebuyBannerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function startRebuy() {
    setLoading(true)
    const res = await fetch(`/api/games/${gameId}/payments/rebuy`, { method: 'POST' })
    setLoading(false)
    if (res.ok) {
      toast.success('Rebuy initiated — mark as paid once transferred')
      router.refresh()
    } else {
      const body = await res.json().catch(() => ({ error: 'failed' }))
      toast.error(`Rebuy failed: ${body.error ?? 'unknown'}`)
    }
  }

  async function claimPaid(paymentId: string) {
    setLoading(true)
    const res = await fetch(`/api/games/${gameId}/payments/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success("You're back in!")
      router.refresh()
    } else {
      toast.error('Claim failed')
    }
  }

  const deadlineStr = round2Deadline.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (pendingPayment) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="font-display text-sm font-semibold text-amber-900">
          Rebuy payment pending
        </div>
        <p className="mt-1 text-xs text-amber-800">
          Mark as paid once you've transferred £{pendingPayment.amount}. You're back in as soon as
          the payment is claimed.
        </p>
        <button
          type="button"
          onClick={() => claimPaid(pendingPayment.id)}
          disabled={loading}
          className="mt-2 rounded bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 disabled:opacity-50"
        >
          {loading ? 'Working…' : 'Claim paid'}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--eliminated-border)] bg-[var(--eliminated-bg)] p-4">
      <div className="font-display text-sm font-semibold text-foreground">
        You're out of round 1 — buy back in for £{entryFee}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Rebuys close at the round 2 deadline ({deadlineStr}).
      </p>
      <button
        type="button"
        onClick={startRebuy}
        disabled={loading}
        className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {loading ? 'Working…' : `Rebuy £${entryFee}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/components/game/rebuy-banner.tsx
git commit -m "feat(4c3): add rebuy banner component"
```

---

## Task 10: Wire rebuy banner into game detail page + data plumbing

**Context:** Per spec §6.2. The game detail page needs to know (a) is the viewer eligible for rebuy and (b) do they have a pending rebuy payment. Both derive from existing data already loaded in `detail-queries.ts`.

**Files:**
- Modify: `src/lib/game/detail-queries.ts` (expose rebuy-banner props)
- Modify: `src/app/(app)/game/[id]/page.tsx` (render the banner when eligible)

- [ ] **Step 1: Add rebuy-banner data to the detail query response**

In `src/lib/game/detail-queries.ts`, modify `getGameDetail` (exported at line 19) — the function the game detail page calls. Add a new `rebuyBanner` field to its return object, derived from existing data.

Sketch:
```ts
// Near where the rest of the viewer-specific fields are computed
const viewerGamePlayer = gameData.players.find((p) => p.userId === viewerUserId)
const viewerPayments = payments.filter((p) => p.userId === viewerUserId)
const round1 = gameData.competition.rounds.find((r) => r.number === 1)
const round2 = gameData.competition.rounds.find((r) => r.number === 2)

let rebuyBanner: {
  entryFee: string
  round2Deadline: Date
  pendingPayment: { id: string; amount: string } | null
} | null = null

if (viewerGamePlayer && round1 && round2 && round2.deadline && gameData.entryFee) {
  const eligible = isRebuyEligible({
    game: {
      gameMode: gameData.gameMode,
      modeConfig: gameData.modeConfig as { allowRebuys?: boolean } | null,
    },
    gamePlayer: {
      status: viewerGamePlayer.status,
      eliminatedRoundId: viewerGamePlayer.eliminatedRoundId,
    },
    round1: { id: round1.id },
    round2: { deadline: round2.deadline },
    paymentRowCount: viewerPayments.length,
    now: new Date(),
  })

  // Also surface the banner in the "pending rebuy payment" state: the player has already
  // initiated the rebuy and now needs to claim paid. Detect: viewer has > 1 payment row
  // AND the most recent is pending AND game_player is alive.
  const mostRecentPayment = [...viewerPayments].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0]
  const hasPendingRebuy =
    viewerPayments.length > 1 &&
    mostRecentPayment?.status === 'pending' &&
    viewerGamePlayer.status === 'alive'

  if (eligible) {
    rebuyBanner = {
      entryFee: gameData.entryFee,
      round2Deadline: round2.deadline,
      pendingPayment: null,
    }
  } else if (hasPendingRebuy && mostRecentPayment) {
    rebuyBanner = {
      entryFee: gameData.entryFee,
      round2Deadline: round2.deadline,
      pendingPayment: { id: mostRecentPayment.id, amount: mostRecentPayment.amount },
    }
  }
}

// Include `rebuyBanner` in the returned object.
```

Remember to `import { isRebuyEligible } from './rebuy'` at the top.

Update the type exported from `detail-queries.ts` to include `rebuyBanner`.

- [ ] **Step 2: Render the banner in `page.tsx`**

In `src/app/(app)/game/[id]/page.tsx`, render `<RebuyBanner />` above the standings when `rebuyBanner` is set. Import the component:

```tsx
import { RebuyBanner } from '@/components/game/rebuy-banner'
```

Add to the JSX near the top of the game detail area (above standings, below header):

```tsx
{detail.rebuyBanner && (
  <RebuyBanner
    gameId={game.id}
    entryFee={detail.rebuyBanner.entryFee}
    round2Deadline={detail.rebuyBanner.round2Deadline}
    pendingPayment={detail.rebuyBanner.pendingPayment}
  />
)}
```

Adapt variable names to match the existing structure in the file.

- [ ] **Step 3: Manual smoke**

```
just db-reset
just dev
```

Create a classic game with `allowRebuys=true` and two players. Seed round 1 so one player loses, then navigate to the game page as that player. Verify:
1. Rebuy banner appears with the correct entry fee and round 2 deadline.
2. Click "Rebuy £N" → banner switches to pending-payment state with "Claim paid" button.
3. Click "Claim paid" → banner disappears, game_player status is alive, round 2 pick UI is available.

- [ ] **Step 4: Run typecheck + suite**

```
pnpm tsc --noEmit
pnpm test
```

Expected: green.

- [ ] **Step 5: Commit**

```
git add src/lib/game/detail-queries.ts src/app/\(app\)/game/\[id\]/page.tsx
git commit -m "feat(4c3): render rebuy banner on game detail page"
```

---

## Task 11: Surface admin rebuy action in admin payments panel

**Context:** Per spec §6.3. Admin needs a "Rebuy this player" action for any round-1-eliminated player (an off-platform cash rebuy scenario). The existing admin panel area in the game page should show this button inline with the affected user's payment row.

**Files:**
- Modify: `src/components/game/payments-panel.tsx`
- Modify: `src/lib/game/detail-queries.ts` (if the panel needs to know which users are rebuy-eligible)

- [ ] **Step 1: Extend `AdminPayment` with `isRebuyEligible: boolean`**

In `src/lib/game/detail-queries.ts`, inside the loop that builds the admin payments list, derive `isRebuyEligible` per (userId) using the predicate and attach it to each row. Only the row with `isRebuy=false` (the initial payment) needs the flag; the rebuy row, by definition, already represents a rebuy.

```ts
// Per user, check rebuy eligibility once, attach to the initial row
const uniqueUserIds = [...new Set(payments.map((p) => p.userId))]
const eligibilityByUser = new Map<string, boolean>()
for (const uid of uniqueUserIds) {
  const userPlayer = gameData.players.find((p) => p.userId === uid)
  const userPaymentRows = payments.filter((p) => p.userId === uid)
  if (!userPlayer || !round1 || !round2 || !round2.deadline) {
    eligibilityByUser.set(uid, false)
    continue
  }
  eligibilityByUser.set(
    uid,
    isRebuyEligible({
      game: {
        gameMode: gameData.gameMode,
        modeConfig: gameData.modeConfig as { allowRebuys?: boolean } | null,
      },
      gamePlayer: {
        status: userPlayer.status,
        eliminatedRoundId: userPlayer.eliminatedRoundId,
      },
      round1: { id: round1.id },
      round2: { deadline: round2.deadline },
      paymentRowCount: userPaymentRows.length,
      now: new Date(),
    }),
  )
}

// Then when mapping to AdminPayment rows:
// ...
const adminPayments = ...map((p, idx) => ({
  ...p,
  isRebuy: idx > 0,
  isRebuyEligible: idx === 0 ? (eligibilityByUser.get(p.userId) ?? false) : false,
}))
```

Expose `AdminPayment` type in `payments-panel.tsx` with the new field: `isRebuyEligible: boolean`.

- [ ] **Step 2: Add "Rebuy player" action to the panel**

In `src/components/game/payments-panel.tsx`, extend `callAction` with an `'admin-rebuy'` action that POSTs to `/api/games/${gameId}/admin/rebuy/${userId}`. Render the button on rows where `p.isRebuyEligible === true`:

```tsx
async function callAction(
  p: AdminPayment,
  action: 'dispute' | 'revert-to-pending' | 'mark-paid' | 'refund' | 'admin-rebuy',
) {
  if (action === 'admin-rebuy') {
    const res = await fetch(`/api/games/${props.gameId}/admin/rebuy/${p.userId}`, {
      method: 'POST',
    })
    if (res.ok) {
      toast.success('Player reactivated — rebuy payment created as pending')
      props.onChange?.()
    } else {
      toast.error('Rebuy failed')
    }
    return
  }
  // ...existing handling keyed by p.id...
}
```

And in the row-actions rendering, add an extra button when eligible:

```tsx
{p.isRebuyEligible && (
  <button
    type="button"
    onClick={() => callAction(p, 'admin-rebuy')}
    className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
  >
    Rebuy player
  </button>
)}
```

- [ ] **Step 3: Manual smoke**

Create a game with `allowRebuys=true`, seed round 1 loss for a player. Open the admin view. Verify:
1. The eliminated player's payment row shows a "Rebuy player" button.
2. Clicking it produces a new pending rebuy payment row.
3. The eligible badge disappears from the player's initial row (now paymentRowCount=2 → not eligible).

- [ ] **Step 4: Commit**

```
git add src/components/game/payments-panel.tsx src/lib/game/detail-queries.ts
git commit -m "feat(4c3): add admin rebuy action to payments panel"
```

---

## Task 12: Retrofit rule 1 (admin un-elimination) into `db.transaction`

**Context:** Fold-in from 4c2 follow-up list. Rule 1 un-elimination currently does two writes (status flip + pick insert) without a transaction. Wrap them while we're in the neighborhood.

**Files:**
- Modify: `src/app/api/games/[id]/admin/late-pick/route.ts` (confirm this is where rule 1 lives; grep if unsure)

- [ ] **Step 1: Locate rule 1 implementation**

Run:
```
grep -rn "un-eliminat\|unEliminat\|admin.*late.*pick" src/app/api src/lib
```

Identify the file that does the rule 1 update. Typical flow: admin-submits-pick-for-player → flips `game_player.status` back to alive → inserts a pick row.

- [ ] **Step 2: Wrap the two writes in `db.transaction`**

In the identified file (likely `src/app/api/games/[id]/admin/late-pick/route.ts`), refactor the block to:

```ts
await db.transaction(async (tx) => {
  await tx
    .update(gamePlayer)
    .set({
      status: 'alive',
      eliminatedRoundId: null,
      eliminatedReason: null,
    })
    .where(eq(gamePlayer.id, playerRow.id))

  await tx.insert(pick).values({
    // ...existing payload...
  })
})
```

No behavior change — only atomicity improvement.

- [ ] **Step 3: Update the corresponding test to reflect transaction usage (if it asserts on non-transactional paths)**

Usually the existing tests won't care because they mock `db.transaction`. Run the test file to confirm:

```
pnpm vitest run src/app/api/games/[id]/admin/late-pick/route.test.ts
```

If tests fail due to missing `db.transaction` in the Drizzle mock, add:
```ts
transaction: vi.fn(async (cb) => cb(dbMock)),
```

- [ ] **Step 4: Run suite**

Run: `pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "refactor(4c3): wrap rule 1 un-elimination in db.transaction"
```

---

## Task 13: Seed update — rebuy-enabled game with round-1-eliminated player

**Context:** Per spec §9 (manual smoke). Seed a classic game with `allowRebuys=true` and one player already eliminated in round 1, so the next `just db-reset` puts the app in a state where a developer can visually verify the rebuy banner and admin rebuy button.

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Add a new seed section for the rebuy game**

In `scripts/seed.ts`, near the existing cup-mid-match game seed (which was added in Phase 4c1's final commit), add a new section:

```ts
// ─────────────────────────────────────────────────────────────
// Rebuy-enabled classic game (Phase 4c3 smoke)
// Three players: A (won round 1), B (lost round 1 → rebuy eligible), C (admin-added, no payment, lost round 1 → rebuy eligible)
// ─────────────────────────────────────────────────────────────

// Create game with allowRebuys=true
// Round 1 is "completed"; round 2 is "active" with a future deadline
// Player B has a losing pick for round 1
// Player A has a winning pick for round 1
// Player C has no round 1 pick, no payment row (admin-added scenario)
```

Model the shape on the existing classic game in the seed file. The minimum required:
- `game`: `gameMode='classic'`, `modeConfig={ allowRebuys: true }`, `entryFee='10.00'`, `status='active'`.
- `rounds`: round 1 `status='completed'`, round 2 `status='active'` with `deadline` two days in the future.
- `game_player` rows for A, B, C with the appropriate statuses.
- `pick` rows for A (win) and B (loss) for round 1. No pick for C.
- `payment` rows for A and B (status `paid`), none for C.

- [ ] **Step 2: Reset the DB and verify**

```
just db-reset
```

Expected: seed completes without error.

Manually verify in the dev app (`just dev`) that the new game appears, B can see the rebuy banner, and C can see it too (with paymentRowCount=0).

- [ ] **Step 3: Commit**

```
git add scripts/seed.ts
git commit -m "chore(seed): add rebuy-enabled game for 4c3 smoke verification"
```

---

## Task 14: Final sweep — typecheck, lint, test, memory update

- [ ] **Step 1: Run the full verification**

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write .
```

Expected: all green. If Biome reports formatting, commit those fixes separately:

```
git add -A && git commit -m "chore(4c3): biome format"
```

- [ ] **Step 2: Update project memory**

Append to the relevant MEMORY.md entries to reflect 4c3 completion:
- `project_phase_state.md`: add "4c3 merged" line, update test count.
- `project_next_session.md`: rotate to name 4c4 as the next trigger ("start subphase 4 of 4c" etc.).

- [ ] **Step 3: Commit memory updates**

Memory files live in `~/.claude/projects/-home-sean-code-last-person-standing/memory/`, not in the repo — so no repo commit needed for memory.

- [ ] **Step 4: Create PR**

Use the `commit-push-pr` skill or push + open PR manually:

```
git push -u origin feature/phase-4c3-paid-rebuys
gh pr create --title "Phase 4c3: paid rebuys + payment state machine simplification" --body "<body>"
```

PR body outline:
- Summary of 4c3: rebuys, simplified claim flow, paymentId-keyed admin routes.
- Link to spec file.
- Test plan checklist.

---

## Self-review summary

- ✅ Spec §1 (scope + allowRebuys toggle) → Tasks 1, 2
- ✅ Spec §2.1 (exemption gate) → Task 1
- ✅ Spec §2.2 (classic round 1 & 2 no-pick) → Task 8
- ✅ Spec §3 (payment state machine) → Task 4
- ✅ Spec §4 (paymentId keying) → Task 5
- ✅ Spec §5.1 (eligibility predicate) → Task 3
- ✅ Spec §5.2 (player rebuy API) → Task 6
- ✅ Spec §5.3 (admin rebuy API) → Task 7
- ✅ Spec §5.4 (claim requires paymentId) → Task 4
- ✅ Spec §6.1 (game creation checkbox) → Task 2
- ✅ Spec §6.2 (rebuy banner) → Tasks 9, 10
- ✅ Spec §6.3 (admin panel update) → Tasks 5, 11
- ✅ Spec §7 (edge cases) → covered via tests in Tasks 3, 6, 7, 8
- ✅ Spec §8 (fold-ins) → Task 12 (rule 1 transaction)
- ✅ Spec §9 (testing strategy) → distributed across tasks; seed in Task 13; integration via manual smoke in Task 13
- ✅ Spec §10 (no schema changes) → confirmed across all tasks
- ✅ Spec §11 (out of scope) → not in plan (correctly omitted)

**Deferred from spec (intentional):**
- Integration test using real DB — the plan leans on manual smoke in Task 13. If CI flakiness becomes a concern, add a dedicated integration test file as a follow-up.
- Removing the `claimed` enum value — explicitly deferred per spec §3.
