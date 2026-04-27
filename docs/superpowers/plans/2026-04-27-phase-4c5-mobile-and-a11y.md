# Phase 4c5 — Mobile Polish + A11y Sweep: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate two custom modals to shadcn `Dialog` for free a11y wins, do a mobile width pass at iPhone 393px, clear ~8 Biome warnings, and finish carry-over deferrals from 4c2/4c3/4c4 (IN GAME tag, share-variant seed games, `/grid` alias removal, free-player rebuy in panel).

**Architecture:** No new patterns. Per-task changes in existing files. Modals migrate from custom `<div role="dialog">` to shadcn `Dialog` primitives (already in `src/components/ui/dialog.tsx`). Mobile fixes are Tailwind utility additions (`flex-col md:flex-row` etc.); no structural rewrites. Free-player surfacing extends the existing admin payment list builder in `getGameDetail` to emit synthetic rows for unpaid `gamePlayer` entries.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/ui (Radix Dialog), Tailwind CSS, Drizzle, Vitest.

---

## Working context

- Branch: `feature/phase-4c5-mobile-and-a11y`
- Worktree: `.worktrees/phase-4c5/`
- Spec: `docs/superpowers/specs/2026-04-27-phase-4c5-mobile-and-a11y-design.md`
- Test count target: 319 (current) → ~325 after new tests in W1, W5, W8.
- W9 (user-search email enumeration) **dropped** — verified in spec write-up that `src/app/api/users/search/route.ts` already returns `{users: []}` uniformly; no leak.

**Commands** (run from worktree root):
- `pnpm test` / `pnpm vitest run <path>` — Vitest
- `pnpm tsc --noEmit` — typecheck
- `pnpm exec biome check --write .` — lint + format
- `just dev` — dev server (for manual smoke; requires `docker compose up -d`)
- `just db-reset` — rebuild local DB from migrations + seed

After each task: `pnpm test && pnpm tsc --noEmit && pnpm exec biome check .` must all pass before commit.

---

## Task 1: Migrate `add-player-modal` to shadcn `Dialog`

**Context:** Currently `src/components/game/add-player-modal.tsx` rolls its own `<div role="dialog">` with four `biome-ignore lint/a11y/*` lines. Migrate to shadcn `Dialog` (already in `src/components/ui/dialog.tsx`), removing all four suppressions. Free wins: focus trap, Escape-to-close, `aria-labelledby` via `DialogTitle`. Modal becomes a child of `Dialog`/`DialogContent`; the parent component drives `open` state.

**Files:**
- Modify: `src/components/game/add-player-modal.tsx`
- Modify: `src/components/game/admin-panel.tsx` (caller; the existing pattern in `admin-panel.tsx` opens the modal on a button click — keep that, but switch from conditional render to `open` prop)

**Read first:**
- `src/components/ui/dialog.tsx` — shadcn Dialog primitives
- `src/components/game/share-dialog.tsx` — example of correct shadcn Dialog usage in this codebase
- `src/components/game/admin-panel.tsx` — how `add-player-modal` is currently mounted

### Step 1: Read the existing files

Run these in your head:
- Read `src/components/game/add-player-modal.tsx` end-to-end so you know the form, autocomplete, and post-submit behavior.
- Read `src/components/game/admin-panel.tsx` (around the `setOpenModal` state machine) so you know how the parent triggers the modal.
- Read `src/components/game/share-dialog.tsx` lines 25-130 for the canonical shadcn Dialog usage pattern.

### Step 2: Add a passing-after-migration test

Create or extend `src/components/game/add-player-modal.test.tsx`. If `@testing-library/react` is set up (check `package.json` devDependencies for `@testing-library/react`), use it. If not, mark this step complete with a `// TODO(4c5): add Escape-closes test once @testing-library/react is wired in` placeholder comment in the file and proceed; do NOT install testing-library as part of this task.

If testing-library IS available:

```tsx
// src/components/game/add-player-modal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddPlayerModal } from './add-player-modal'

describe('AddPlayerModal', () => {
  it('Escape closes the modal', () => {
    const onClose = vi.fn()
    render(<AddPlayerModal gameId="g1" open={true} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders dialog title for screen readers', () => {
    render(<AddPlayerModal gameId="g1" open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /add player/i })).toBeTruthy()
  })
})
```

If testing-library is NOT available, skip this step and rely on manual smoke + the existing test suite.

### Step 3: Run the test (expect failure)

If you wrote tests, run them — they should fail because the current modal is a custom `<div>` that doesn't intercept Escape and doesn't expose a proper accessible name.

```
pnpm vitest run src/components/game/add-player-modal.test.tsx
```

Expected: tests fail (Escape isn't handled; `getByRole('dialog')` may match but without an accessible name).

### Step 4: Migrate the modal

Replace `src/components/game/add-player-modal.tsx` with:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

interface AddedPlayer {
	gamePlayerId: string
	userName: string
}

interface AddPlayerModalProps {
	gameId: string
	open: boolean
	onClose: () => void
}

interface UserResult {
	id: string
	name: string
	email: string
	isInGame?: boolean
}

export function AddPlayerModal({ gameId, open, onClose }: AddPlayerModalProps) {
	const router = useRouter()
	const inputId = useId()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<UserResult[]>([])
	const [searching, setSearching] = useState(false)
	const [adding, setAdding] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [added, setAdded] = useState<AddedPlayer | null>(null)

	function handleClose() {
		setQuery('')
		setResults([])
		setError(null)
		setAdded(null)
		onClose()
	}

	async function handleSearch(value: string) {
		setQuery(value)
		setError(null)
		if (value.trim().length === 0) {
			setResults([])
			return
		}
		setSearching(true)
		try {
			const res = await fetch(
				`/api/users/search?q=${encodeURIComponent(value)}&gameId=${encodeURIComponent(gameId)}`,
			)
			if (!res.ok) {
				setError('Search failed')
				return
			}
			const body = (await res.json()) as { users: UserResult[] }
			setResults(body.users)
		} finally {
			setSearching(false)
		}
	}

	async function handleAdd(u: UserResult) {
		if (u.isInGame) return
		if (adding) return
		setAdding(true)
		setError(null)
		try {
			const res = await fetch(`/api/games/${gameId}/admin/add-player`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: u.id }),
			})
			const body = await res.json()
			if (!res.ok) {
				setError(body.error ?? 'failed')
				return
			}
			setAdded({ gamePlayerId: body.gamePlayer.id, userName: u.name })
		} finally {
			setAdding(false)
		}
	}

	function handlePickForThem() {
		if (!added) return
		handleClose()
		router.push(`/game/${gameId}?actingAs=${added.gamePlayerId}`)
	}

	function handleBackToGame() {
		handleClose()
		router.refresh()
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
			<DialogContent className="sm:max-w-md">
				{added ? (
					<>
						<DialogHeader>
							<DialogTitle>{added.userName} added</DialogTitle>
							<DialogDescription>Pick for them now, or come back later.</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<button
								type="button"
								onClick={handleBackToGame}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								Back to game
							</button>
							<button
								type="button"
								onClick={handlePickForThem}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
							>
								Pick for them
							</button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Add player</DialogTitle>
							<DialogDescription>Search by name or email to add a user to this game.</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							<input
								id={inputId}
								autoFocus
								value={query}
								onChange={(e) => handleSearch(e.target.value)}
								placeholder="Name or email"
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
							{searching && <p className="text-xs text-muted-foreground">Searching…</p>}
							{!searching && results.length > 0 && (
								<ul className="max-h-64 space-y-1 overflow-y-auto">
									{results.map((u) => (
										<li key={u.id}>
											<button
												type="button"
												onClick={() => handleAdd(u)}
												disabled={u.isInGame || adding}
												className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
											>
												<div className="min-w-0">
													<div className="truncate font-semibold">{u.name}</div>
													<div className="truncate text-xs text-muted-foreground">{u.email}</div>
												</div>
												{u.isInGame && (
													<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
														In game
													</span>
												)}
											</button>
										</li>
									))}
								</ul>
							)}
							{!searching && query.length > 0 && results.length === 0 && (
								<p className="text-xs text-muted-foreground">No matching users.</p>
							)}
							{error && <p className="text-xs text-red-500">{error}</p>}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
```

(If the existing modal had different props — e.g., it took an `onAdded` callback rather than handling navigation internally — preserve that contract. The above is the most likely shape based on the original; double-check against the parent `admin-panel.tsx` usage and adapt.)

### Step 5: Update `admin-panel.tsx` to pass `open` + `onClose`

The current pattern is:

```tsx
{openModal === 'add' && <AddPlayerModal gameId={gameId} onClose={() => setOpenModal(null)} />}
```

Change to:

```tsx
<AddPlayerModal gameId={gameId} open={openModal === 'add'} onClose={() => setOpenModal(null)} />
```

(The shadcn Dialog can stay mounted with `open=false`; it just doesn't render the overlay.)

Same for `split-pot-modal` if its mount pattern is similar — but that's Task 2. Leave split-pot alone for this task.

### Step 6: Run tests + typecheck + lint

```
pnpm vitest run src/components/game/add-player-modal.test.tsx
pnpm tsc --noEmit
pnpm exec biome check --write src/components/game/add-player-modal.tsx src/components/game/admin-panel.tsx
pnpm test
```

Expected: tests pass; typecheck clean; **no remaining `biome-ignore lint/a11y/*` lines in `add-player-modal.tsx`**.

### Step 7: Commit

```
git add src/components/game/add-player-modal.tsx src/components/game/admin-panel.tsx src/components/game/add-player-modal.test.tsx
git commit -m "feat(4c5): migrate add-player-modal to shadcn Dialog"
```

---

## Task 2: Migrate `split-pot-modal` to shadcn `Dialog`

**Context:** Same pattern as Task 1. `split-pot-modal.tsx` has the same custom-`<div>` pattern with the same four `biome-ignore` lines. The modal's content is a confirmation prompt with a "Split £X across N winners" button.

**Files:**
- Modify: `src/components/game/split-pot-modal.tsx`
- Modify: `src/components/game/admin-panel.tsx` (caller — same `open` prop change as Task 1's Step 5, applied to split-pot now)

### Step 1: Optional test (only if testing-library available)

```tsx
// src/components/game/split-pot-modal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SplitPotModal } from './split-pot-modal'

describe('SplitPotModal', () => {
  it('Escape closes the modal', () => {
    const onClose = vi.fn()
    render(<SplitPotModal gameId="g1" aliveCount={3} potTotal="300.00" open={true} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

Skip if testing-library isn't available. The migration is mechanical and the manual smoke at Step 5 is sufficient.

### Step 2: Migrate the modal

Replace `src/components/game/split-pot-modal.tsx` with:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'

interface SplitPotModalProps {
	gameId: string
	aliveCount: number
	potTotal: string
	open: boolean
	onClose: () => void
}

export function SplitPotModal({ gameId, aliveCount, potTotal, open, onClose }: SplitPotModalProps) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const totalNum = Number(potTotal)
	const perWinner = aliveCount > 0 ? (totalNum / aliveCount).toFixed(2) : '0.00'

	async function handleConfirm() {
		if (submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const res = await fetch(`/api/games/${gameId}/admin/split-pot`, { method: 'POST' })
			const body = await res.json()
			if (!res.ok) {
				setError(body.error ?? 'failed')
				return
			}
			onClose()
			router.refresh()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Split the pot now?</DialogTitle>
					<DialogDescription>
						This ends the game immediately. All {aliveCount} alive players are marked as winners.
						Eliminated players get nothing.
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-md border border-border bg-card p-3 text-center">
					<div className="text-xl font-extrabold tabular-nums text-emerald-500">£{perWinner} each</div>
					<div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						£{potTotal} split {aliveCount} ways
					</div>
				</div>
				<p className="rounded-r-sm border-l-2 border-amber-500 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-500">
					⚠ This can't be undone. Game status becomes "completed".
				</p>
				{error && <p className="text-xs text-red-500">Couldn't split: {error}</p>}
				<DialogFooter>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={submitting || aliveCount < 2}
						className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
					>
						Split £{potTotal} across {aliveCount} winners
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
```

### Step 3: Update `admin-panel.tsx` for split-pot mount

Change the conditional render to pass `open`:

```tsx
<SplitPotModal
	gameId={gameId}
	aliveCount={aliveCount}
	potTotal={potTotal}
	open={openModal === 'split'}
	onClose={() => setOpenModal(null)}
/>
```

### Step 4: Run tests + typecheck + lint

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write src/components/game/split-pot-modal.tsx src/components/game/admin-panel.tsx
```

Expected: full suite green; typecheck clean; no `biome-ignore lint/a11y/*` lines remain in `split-pot-modal.tsx`.

### Step 5: Commit

```
git add src/components/game/split-pot-modal.tsx src/components/game/admin-panel.tsx src/components/game/split-pot-modal.test.tsx
git commit -m "feat(4c5): migrate split-pot-modal to shadcn Dialog"
```

---

## Task 3: "IN GAME" tag on add-player autocomplete

**Context:** The admin add-player modal can attempt to add a user who is already a `game_player` for the current game. The API returns 409 `already-in-game`, but the autocomplete doesn't anticipate it. Surface an "(in game)" badge on result rows that match an existing player.

**Files:**
- Modify: `src/app/api/users/search/route.ts` (accept `?gameId=` query param; return `isInGame` per result)
- Modify: `src/app/api/users/search/route.test.ts` (test the new branch)
- The modal UI (from Task 1) already renders the `isInGame` badge — no changes needed there if Task 1 was done correctly.

### Step 1: Add a failing test

In `src/app/api/users/search/route.test.ts`, add:

```ts
it('marks results as isInGame when ?gameId= matches an existing game_player', async () => {
  // Mock setup follows the existing pattern in this test file.
  // db.select().from().where().limit() returns [{ id: 'u1', name: 'Sean', email: 's@example.com' }]
  // db.query.gamePlayer.findMany({where: gameId=g1}) returns [{ userId: 'u1' }]
  // ...read the existing test file to mirror its mocking style and adapt.

  const res = await GET(new Request('http://x?q=sean&gameId=g1'))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.users).toEqual([{ id: 'u1', name: 'Sean', email: 's@example.com', isInGame: true }])
})

it('omits isInGame (or sets false) when ?gameId= is not provided', async () => {
  // Mock setup: same db.select returns the same user; gamePlayer query NOT called.
  const res = await GET(new Request('http://x?q=sean'))
  expect(res.status).toBe(200)
  const body = await res.json()
  // Existing behavior: response shape is {users: [{id, name, email}]}.
  expect(body.users[0].isInGame).toBeUndefined()
})
```

Read `src/app/api/users/search/route.test.ts` first to mirror its mocking style; the snippets above are illustrative.

### Step 2: Run the tests (expect fails)

```
pnpm vitest run src/app/api/users/search
```

Expected: new tests fail because the route doesn't read `gameId` or set `isInGame`.

### Step 3: Update the route

Replace `src/app/api/users/search/route.ts` with:

```ts
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { user } from '@/lib/schema/auth'
import { gamePlayer } from '@/lib/schema/game'

export async function GET(request: Request): Promise<Response> {
	await requireSession()

	const { searchParams } = new URL(request.url)
	const q = (searchParams.get('q') ?? '').trim()
	const gameId = searchParams.get('gameId')
	if (q.length === 0) {
		return NextResponse.json({ users: [] })
	}

	const pattern = `${q.toLowerCase()}%`
	const results = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(or(sql`lower(${user.name}) like ${pattern}`, sql`lower(${user.email}) like ${pattern}`))
		.limit(10)

	if (!gameId || results.length === 0) {
		return NextResponse.json({ users: results })
	}

	const userIds = results.map((u) => u.id)
	const existingPlayers = await db
		.select({ userId: gamePlayer.userId })
		.from(gamePlayer)
		.where(and(eq(gamePlayer.gameId, gameId), inArray(gamePlayer.userId, userIds)))
	const inGameSet = new Set(existingPlayers.map((p) => p.userId))

	const augmented = results.map((u) => ({ ...u, isInGame: inGameSet.has(u.id) }))
	return NextResponse.json({ users: augmented })
}
```

### Step 4: Run tests (expect pass)

```
pnpm vitest run src/app/api/users/search
pnpm tsc --noEmit
```

### Step 5: Commit

```
git add src/app/api/users/search src/components/game/add-player-modal.tsx
git commit -m "feat(4c5): mark in-game users in /users/search; render badge in autocomplete"
```

(The `add-player-modal.tsx` is included because Task 1 already wrote the rendering for `u.isInGame` — but the API's `?gameId=` plumbing is what makes the flag present.)

---

## Task 4: Free-player rebuy in payments panel

**Context:** Admin-added players with `paymentRowCount=0` are rebuy-eligible per `isRebuyEligible` but invisible in the payments panel because the panel iterates only payment rows. Surface them as synthetic rows so the admin Rebuy button is reachable.

**Files:**
- Modify: `src/lib/game/detail-queries.ts` (extend `allPayments` builder)
- Modify: `src/components/game/payments-panel.tsx` (widen `AdminPayment.id` to `string | null`, `status` to include `'unpaid'`)
- Modify: `src/lib/game/detail-queries.test.ts` (or wherever the admin payments builder is tested)

### Step 1: Read existing structure

Read `src/lib/game/detail-queries.ts` around line 140 (the `allPayments = Array.from(paymentsByUser.entries()).flatMap(...)` block). Read `src/components/game/payments-panel.tsx`'s `AdminPayment` interface at line 7.

### Step 2: Widen `AdminPayment` types in `payments-panel.tsx`

Change:

```ts
export interface AdminPayment {
	id: string                 // <-- was string
	userId: string
	userName: string
	amount: string
	status: PaymentStatus       // <-- was PaymentStatus only
	isRebuy: boolean
	isRebuyEligible: boolean
	claimedAt: Date | null
	paidAt: Date | null
}
```

to:

```ts
export type AdminPaymentStatus = PaymentStatus | 'unpaid'

export interface AdminPayment {
	id: string | null  // null for synthetic "no payment yet" rows
	userId: string
	userName: string
	amount: string
	status: AdminPaymentStatus
	isRebuy: boolean
	isRebuyEligible: boolean
	claimedAt: Date | null
	paidAt: Date | null
}
```

In the `Row` rendering, the existing actions only show `Dispute` for `paid` and `Rebuy player` when `isRebuyEligible`. The new `'unpaid'` status falls through to neither — perfect; only the Rebuy button appears.

Also update `PaymentStatusChip` if it doesn't already handle the `'unpaid'` literal. Read `src/components/game/payment-status-chip.tsx`; if it doesn't accept `'unpaid'`, extend its allowed values + add a grey "Unpaid" chip. (One-line extension.)

### Step 3: Extend the builder in `detail-queries.ts`

Around the `allPayments` builder block (~line 140), after building `allPayments` from payment rows, add synthetic rows for `gamePlayer` entries that have NO payment row at all:

```ts
const playersWithPayments = new Set(allPayments.map((p) => p.userId))
const playersWithoutPayments = gameData.players.filter(
	(p) => !playersWithPayments.has(p.userId),
)
const syntheticUnpaidRows = playersWithoutPayments.map((p) => ({
	id: null as string | null,
	userId: p.userId,
	userName: userNames.get(p.userId) ?? 'Unknown',
	amount: gameData.entryFee ?? '0.00',
	status: 'unpaid' as const,
	isRebuy: false,
	isRebuyEligible: eligibilityByUser.get(p.userId) ?? false,
	claimedAt: null,
	paidAt: null,
}))
const finalAdminPayments = [...allPayments, ...syntheticUnpaidRows]
```

Replace the downstream consumer (`adminPayments = isAdmin ? allPayments : undefined`) with `adminPayments = isAdmin ? finalAdminPayments : undefined`.

`eligibilityByUser` and `userNames` are already in scope from Phase 4c3's changes.

### Step 4: Add a test

Append to `src/lib/game/detail-queries.test.ts` (if it exists; otherwise add as part of an existing nearby test file or skip if no test infrastructure for `getGameDetail`):

```ts
it('emits a synthetic unpaid row for admin-added players with no payment', async () => {
  // Mock setup: gameData.players = [{userId: 'u1', status: 'alive'}], no payments at all
  // for u1 (the gamePlayer was created via admin-add-player without a payment).
  // Expect the admin payments list to include a row with id=null, status='unpaid',
  // userId='u1', isRebuyEligible=true (assuming the predicate fires for round-1
  // eliminated etc — set up the mock to satisfy that).
  // ...mirror the mocking style of existing tests in detail-queries.test.ts...
})
```

If `detail-queries.test.ts` doesn't exist or doesn't cover `getGameDetail` directly, skip the test and rely on manual verification with the seeded "admin-added free player" fixture from Phase 4c3.

### Step 5: Verify and commit

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/game/detail-queries.ts src/components/game/payments-panel.tsx src/components/game/payment-status-chip.tsx
git add src/lib/game src/components/game
git commit -m "feat(4c5): surface admin-added free players in payments panel as unpaid rows"
```

Expected: typecheck clean; full suite green.

---

## Task 5: Seed live + winner + split-pot games for share variant smoke

**Context:** Per spec W6. Three new seeded games in `scripts/seed.ts` so `just db-reset` puts each share variant in a smoke-testable state. Models on the existing 4c3 "Rebuy Lads" pattern (around line 853 of `seed.ts`).

**Files:**
- Modify: `scripts/seed.ts`

### Step 1: Read the existing seed pattern

Read `scripts/seed.ts` end-to-end if you haven't already, but pay special attention to:
- The "Rebuy smoke game (Phase 4c3)" section (~line 853) for game-with-state pattern.
- Any existing pattern for marking fixtures as `live` or `finished` with non-null scores.
- How users are created/referenced (existing dev users at the top of the file).

### Step 2: Add the three new games

Append, after the rebuy smoke section, three new game seeds:

**5a — Live snapshot (classic):**
- Game name: `Live Lads (4c5 smoke)`, `gameMode='classic'`, `entryFee='10.00'`, `status='active'`.
- Round 1: completed, with a fixture that has fixed scores.
- Round 2: `status='active'`, `currentRoundId` points to it; one fixture in round 2 has `status='live'` with `homeScore=1`, `awayScore=0` (so a player picking the home team is "winning").
- 3 players, all `alive`, all with paid payments. Each has a pick for round 2 — one for the live fixture's home team, one for the live fixture's away team, one for a different fixture (`scheduled` / KO not yet).
- Expected: when this game opens in the share dialog, `defaultShareVariant === 'live'`.

**5b — Solo winner (classic):**
- Game name: `Champion's Cup (4c5 smoke)`, `gameMode='classic'`, `entryFee='20.00'`, `status='completed'`.
- 4 players, 1 with `status='winner'`, 3 with `status='eliminated'`.
- All four with paid payments (so pot = £80).
- Expected: when this game opens in the share dialog, `defaultShareVariant === 'winner'` and the winner block shows a single winner with £80 pot.

**5c — Split-pot winner (cup):**
- Game name: `Split Cup (4c5 smoke)`, `gameMode='cup'`, `modeConfig={ startingLives: 2, numberOfPicks: 5 }`, `entryFee='20.00'`, `status='completed'`.
- 5 players, 2 with `status='winner'`, 3 with `status='eliminated'`.
- All five with paid payments (pot = £100, so split = £50 each).
- Expected: when this game opens in the share dialog, `defaultShareVariant === 'winner'` and the winner block shows 2 winners with £50 each.

Reuse existing user IDs from the seed file's user creation block. Pick competitions/rounds/fixtures from the existing seed sets — don't create new ones.

### Step 3: Verify the seed runs

```
docker compose up -d  # if not already running
just db-reset
```

Expected: seed completes without error. Optional: open `psql` and confirm the three new games exist with their expected `status` and `currentRoundId`.

```
docker compose exec -T postgres psql -U postgres -d lps_dev -c "select name, status, game_mode from game where name like '%4c5 smoke%';"
```

### Step 4: Commit

```
git add scripts/seed.ts
git commit -m "chore(seed): add live/winner/split-pot smoke games for 4c5"
```

---

## Task 6: Remove `/api/share/grid/[gameId]` legacy alias

**Context:** Per spec W7. The alias was kept for one phase as belt-and-braces; ShareDialog points at `/standings` directly now (verified in `src/components/game/share-dialog.tsx`).

**Files:**
- Delete: `src/app/api/share/grid/` (the whole folder)

### Step 1: Confirm no callers

```
grep -rn "/api/share/grid" src
```

Expected: zero results (ShareDialog uses `/api/share/${variant}/${gameId}` where variant is `standings`/`live`/`winner`).

### Step 2: Delete the folder

```
rm -rf src/app/api/share/grid
```

### Step 3: Verify and commit

```
pnpm test
pnpm tsc --noEmit
git add -A
git commit -m "chore(4c5): remove legacy /api/share/grid alias"
```

Expected: full suite stays green; the alias's tests are deleted with the folder.

---

## Task 7: Mobile width audit pass

**Context:** Per spec W2. Open each in-scope page in DevTools at iPhone 393px (or 360px Android secondary). Catalogue any horizontal-scroll, unreachable-control, or unreadable-text issues. Apply Tailwind utility fixes only (no structural rewrites). Document each fix in commit messages.

**Files (potential — depends on what the audit finds):**
- `src/app/(app)/page.tsx` — dashboard
- `src/app/(app)/game/[id]/page.tsx` — game detail
- `src/app/(app)/game/create/page.tsx` — game creation
- `src/app/(app)/join/[code]/page.tsx` — join page
- Any sub-components rendered within those pages

### Step 1: Boot the dev environment with seeded data

```
docker compose up -d
just db-reset  # uses the new 4c5 seeded games from Task 5
just dev
```

In a separate terminal/tab, open Chrome DevTools → toggle device toolbar → choose iPhone 14 Pro (393×852) → Open `http://localhost:3000`.

### Step 2: Audit each page

For each page in scope, with several seeded games to navigate to:

1. **Dashboard** (`/`) — look at: card grid layout, action buttons, "join game" CTA, padding.
2. **Game detail (classic)** (`/game/<id>` for the rebuy or live smoke game) — look at: header, admin panel, payments panel, standings grid (including 30-row case if seed has enough), pick UI, share dialog.
3. **Game detail (cup)** — similar, focus on cup-grid horizontal scroll behavior.
4. **Game detail (turbo)** — similar, focus on turbo grid + ladder views.
5. **Game create** (`/game/create`) — look at: form steppers, mode selector cards, switches.
6. **Join** (`/join/<code>`) — look at: invite preview, accept/decline buttons.

For each issue found:
- Identify the responsible component(s).
- Add Tailwind utilities to fix (e.g., `flex-col md:flex-row`, `text-sm md:text-base`, `overflow-x-auto`, `max-w-full`, `min-w-0`, `truncate`).
- Commit per page with a message describing what was fixed.

### Step 3: Commit pattern

For each page (or batch of related fixes):

```
git add <files>
git commit -m "fix(4c5): mobile width fixes on <page>"
```

Example commit messages:
- `fix(4c5): mobile width fixes on dashboard — single-column grid below md`
- `fix(4c5): mobile width fixes on game detail — admin panel actions stack on narrow widths`
- `fix(4c5): mobile width fixes on cup grid — sticky player column for horizontal scroll`

### Step 4: After all pages audited, full suite check

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write .
```

Expected: all pass. Mobile fixes shouldn't break anything; if they do, the responsive utility was wrong — adjust.

### Step 5: If a page needs a structural rewrite (out of scope)

Document it in the PR body as "deferred to post-launch" and move on. Don't pad 4c5.

---

## Task 8: Keyboard navigation pass

**Context:** Per spec W3. Walk Tab through each main flow. Document gaps; fix simple ones.

**Files (potential):**
- Anywhere `<div onClick>` is used without `role="button"` and `tabIndex` — likely 5-10 occurrences across components.

### Step 1: Find candidate sites

```
grep -rn "onClick" src/components --include="*.tsx" | grep -v "type=" | grep "<div\|<span\|<li" | head -40
```

This catches `<div onClick>`, `<span onClick>`, `<li onClick>` — the typical keyboard-inaccessible patterns. Many will be fine (e.g., backdrop click handlers); some will be interactive-but-not-buttoned.

### Step 2: For each candidate, decide

- **If it's a real interactive control** (e.g., a clickable card that navigates somewhere): convert to `<button>` (or `<a>` if it's navigation), inheriting Tailwind `cursor-pointer` and tab semantics.
- **If it's a backdrop / scrim**: already handled by the modal migration (Task 1, 2). Skip.
- **If it's an interactive element that genuinely shouldn't be a button** (rare): add `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.

### Step 3: Verify focus-ring visibility

Look at `tailwind.config.ts` (if present) or `app/globals.css` for `focus-visible:` defaults. Confirm interactive elements have visible focus rings. If a button class is missing `focus-visible:ring-*`, add it.

Spot-check by Tab-traversing the dashboard and game detail pages in the browser. Confirm every reachable element has a visible focus indicator.

### Step 4: Commit

Per fix or per file batch:

```
git add <files>
git commit -m "fix(4c5): keyboard nav — convert <div onClick> to <button> in <component>"
```

### Step 5: After all fixes, full suite check

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write .
```

---

## Task 9: Biome warnings final cleanup

**Context:** Per spec W4. After Tasks 1-8, the count should be lower (modal a11y suppressions gone). Final pass to clear remaining warnings.

**Files (potential):**
- `scripts/seed.ts` (`noNonNullAssertion`)
- `src/app/api/picks/[gameId]/[roundId]/route.ts` (`noNonNullAssertion`)
- `src/lib/game/detail-queries.ts` (`useOptionalChain` — pre-existing in `getShareLiveData`)
- Whatever else surfaces

### Step 1: Run Biome

```
pnpm exec biome check .
```

Note the warnings.

### Step 2: Fix each

For `noNonNullAssertion`:
- Replace `foo!` with explicit null-check or `?.` chain.
- If the assertion is genuinely needed (e.g., for a value the type system can't narrow but you've verified is present), leave a `// biome-ignore lint/style/noNonNullAssertion: <reason>` with a real explanation.

For `useOptionalChain`:
- Apply Biome's suggested fix (replace `a && a.b` with `a?.b`).

### Step 3: Verify zero warnings

```
pnpm exec biome check .
```

Expected: `Found 0 warnings` (or just no warning lines).

### Step 4: Commit

```
git add -A
git commit -m "chore(4c5): clear remaining Biome warnings"
```

---

## Task 10: Final sweep + PR

**Files:** none (just verification + push).

### Step 1: Full verification

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check .
pnpm build
```

All four must pass (build succeeds with `.env.local` from `.env.example`; suite green; typecheck clean; zero Biome warnings).

### Step 2: Manual smoke summary

Confirm at iPhone 393px:
- Dashboard renders, card grid stacks if needed, all CTAs visible.
- Game detail (classic + cup + turbo) renders without horizontal-scroll page-bleed.
- Add player + split pot modals open, trap focus, Escape closes.
- Share dialog renders correctly; dropdown reachable; download works.
- Rebuy banner stacks correctly when present.

### Step 3: Push + PR

```
git push -u origin feature/phase-4c5-mobile-and-a11y
gh pr create --title "Phase 4c5: mobile polish + a11y sweep" --body "$(cat <<'PRBODY'
## Summary

Polish + a11y sweep across 4a/4b/4c surfaces. Migrates two custom modals to shadcn `Dialog`, runs a mobile width pass at iPhone 393px, clears all Biome warnings, finishes carry-over deferrals from earlier phases.

### What's done
- `add-player-modal` + `split-pot-modal` migrated to shadcn `Dialog` — focus trap, Escape, `aria-labelledby` for free; four `biome-ignore lint/a11y/*` suppressions removed.
- "IN GAME" badge on add-player autocomplete via `?gameId=` query param on `/api/users/search`.
- Free-player rebuy in payments panel: synthetic "unpaid" rows surface admin-added players with no payment row so the Rebuy button is reachable.
- Three new seeded games for share-variant smoke (live snapshot, solo winner, split-pot winner).
- Legacy `/api/share/grid/[gameId]` alias deleted.
- Mobile width audit + fixes across dashboard, game detail (per mode), game create, join. Tailwind utility additions only.
- Keyboard nav pass: rogue `<div onClick>` interactives converted to `<button>`/`<a>`; focus rings audited.
- All Biome warnings resolved (0 → 0).

### Out of scope (deferred)
- WCAG 2.1 AA conformance audit.
- Screen-reader testing.
- Mobile-first re-thinks (bottom nav, swipe gestures).
- User-search email enumeration hardening — verified during plan write-up that the endpoint already returns uniform `{users: []}` shape; not a leak.

### Spec & plan
- `docs/superpowers/specs/2026-04-27-phase-4c5-mobile-and-a11y-design.md`
- `docs/superpowers/plans/2026-04-27-phase-4c5-mobile-and-a11y.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
)"
```

Done. Phase 4c5 ready for dormant merge.

---

## Self-review summary

- ✅ Spec W1 (modal a11y migration) → Tasks 1, 2.
- ✅ Spec W2 (mobile width pass) → Task 7.
- ✅ Spec W3 (keyboard nav pass) → Task 8.
- ✅ Spec W4 (Biome warnings cleanup) → Task 9.
- ✅ Spec W5 ("IN GAME" tag) → Task 3.
- ✅ Spec W6 (seed live/winner/split-pot) → Task 5.
- ✅ Spec W7 (`/grid` removal) → Task 6.
- ✅ Spec W8 (free-player rebuy in panel) → Task 4.
- ⊘ Spec W9 (email enumeration) — dropped: verified during plan write-up that `users/search/route.ts` returns uniform `{users: []}` shape regardless of match. No leak. Documented in plan header.

**Deferred from spec:**
- None at the spec level. WCAG, screen-reader testing, mobile re-think, color contrast — all explicitly out of scope per spec §"Non-goals".
