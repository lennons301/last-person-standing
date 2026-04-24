# Phase 4c2: Admin UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver three admin-only actions (add player, pick for player, split pot) plus engine rules for no-pick handling (classic auto-pick from round 3+, turbo/cup refund-and-eliminate) so the app is usable in practice for friend-group game management.

**Architecture:** Dedicated `<AdminPanel>` card on game detail hosts the two game-wide actions (add player, split pot). Contextual `✎` icons on standings rows trigger pick-for-player URL-param mode that reuses the existing `ClassicPick` / `TurboPick` / `CupPick` interfaces. Engine rules fire from the existing daily-sync cron's deadline-lock hook.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Drizzle ORM + postgres.js, Vitest. No new dependencies.

**Design spec:** `docs/superpowers/specs/2026-04-24-phase-4c2-admin-ux-design.md`

---

## Scope

Single sub-phase (4c2), one feature branch (`feature/phase-4c2-admin-ux`). Merges dormant onto `main`; runtime verification happens in Phase 4.5.

## File structure

### Created

| Path | Responsibility |
|---|---|
| `drizzle/NNNN_<name>.sql` | Generated migration — adds `pick.is_auto`, `game_player.eliminated_reason`, `team.league_position`, `payment.refunded_at`. |
| `src/lib/game/auto-pick.ts` | Pure function `pickLowestRankedUnusedTeam`. |
| `src/lib/game/auto-pick.test.ts` | Unit tests for `pickLowestRankedUnusedTeam`. |
| `src/lib/game/no-pick-handler.ts` | Orchestrator `processDeadlineLock` — invoked from daily-sync, dispatches to rule 2 (classic auto-pick) or rule 3 (turbo/cup refund-eliminate). |
| `src/lib/game/no-pick-handler.test.ts` | Integration tests against a test DB. |
| `src/app/api/users/search/route.ts` | `GET /api/users/search?q=...` — returns up to 10 users matching name/email. |
| `src/app/api/users/search/route.test.ts` | Route tests. |
| `src/app/api/games/[id]/admin/add-player/route.ts` | `POST /api/games/[id]/admin/add-player` — admin-gated, inserts `gamePlayer`. |
| `src/app/api/games/[id]/admin/add-player/route.test.ts` | Route tests. |
| `src/components/game/admin-panel.tsx` | Always-visible-to-admin card with "+ Add player" + "Split pot" buttons. |
| `src/components/game/add-player-modal.tsx` | Search-and-select modal with post-submit chain to pick-for-player. |
| `src/components/game/split-pot-modal.tsx` | Confirmation modal wrapping the existing split-pot POST route. |
| `src/components/game/acting-as-banner.tsx` | Contained card banner shown on pick page when `?actingAs=...` is present. |
| `src/components/game/auto-pick-banner.tsx` | One-time dismissible banner for the affected player. |

### Modified

- `src/lib/schema/game.ts` — add `isAuto` column to `pick`, `eliminatedReason` to `gamePlayer`.
- `src/lib/schema/competition.ts` — add `leaguePosition` to `team`.
- `src/lib/schema/payment.ts` — add `refundedAt` to `payment`.
- `src/lib/game/bootstrap-competitions.ts` — persist `league_position` during standings sync.
- `src/app/api/picks/[gameId]/[roundId]/route.ts` — accept `actingAs` body field; apply rule 1 un-elimination.
- `src/app/api/cron/daily-sync/route.ts` — invoke `processDeadlineLock()` after competition sync.
- `src/components/game/game-detail-view.tsx` — render `<AdminPanel />` + `<AutoPickBanner />` for admins / affected players.
- `src/components/standings/progress-grid.tsx` — contextual `✎` icon + auto-pick ribbon/amber treatment on pick cells.
- `src/components/standings/cup-grid.tsx` — contextual `✎` icon (ribbon threaded through for parity though cup won't trigger rule 2).
- `src/components/standings/cup-ladder.tsx` — contextual `✎` on backer chips.
- `src/components/standings/turbo-standings.tsx` — contextual `✎` icon.
- `src/app/(app)/game/[id]/pick/page.tsx` (or wherever pick route lives — may need to check existing structure) — read `?actingAs` URL param, render `<ActingAsBanner />`, load target player's pick history.
- `scripts/seed.ts` — add a game scenario with a missed deadline to exercise rule 2 + rule 1.

## Execution order

Tasks are numbered to match the intended sequence. TDD is used wherever there's pure logic to test; for UI and routes, tests are written before implementation where the test harness supports it.

---

## Part A — Schema and pure logic

### Task 1: Schema migration

**Files:**
- Modify: `src/lib/schema/game.ts`
- Modify: `src/lib/schema/competition.ts`
- Modify: `src/lib/schema/payment.ts`
- Create (generated): `drizzle/NNNN_<name>.sql`

Adds four nullable/default-safe columns across four tables. No enum extensions; `eliminated_reason` is free-form text with TS-enforced union.

- [ ] **Step 1: Edit `src/lib/schema/game.ts`**

In the `pick` table definition, add after the existing columns (before closing parenthesis):

```typescript
isAuto: boolean('is_auto').notNull().default(false),
```

In the `gamePlayer` table definition, add after `eliminatedRoundNumber`:

```typescript
eliminatedReason: text('eliminated_reason'),
```

Document the valid values above the column with a comment:

```typescript
// Valid values: 'loss' | 'missed_rebuy_pick' | 'no_pick_no_fallback' | 'admin_removed'
eliminatedReason: text('eliminated_reason'),
```

- [ ] **Step 2: Edit `src/lib/schema/competition.ts`**

In the `team` table definition, add after the existing columns:

```typescript
leaguePosition: integer('league_position'),
```

- [ ] **Step 3: Edit `src/lib/schema/payment.ts`**

In the `payment` table definition, add after `claimedAt`:

```typescript
refundedAt: timestamp('refunded_at'),
```

- [ ] **Step 4: Generate migration**

Run: `just db-generate`
Expected: new file `drizzle/NNNN_<name>.sql` created with `ALTER TABLE` statements adding the four columns.

- [ ] **Step 5: Apply migration locally**

Run: `just db-migrate`
Expected: migration applies cleanly; no errors.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schema/ drizzle/
git commit -m "feat(schema): add auto-pick flag, elimination reason, league position, refunded timestamp"
```

---

### Task 2: `pickLowestRankedUnusedTeam` pure function

**Files:**
- Create: `src/lib/game/auto-pick.ts`
- Create: `src/lib/game/auto-pick.test.ts`

Pure function: given a round's fixtures, a set of already-used team ids, and a team-position lookup, returns the id of the lowest-ranked unused team (or `null` if none available).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/game/auto-pick.test.ts
import { describe, expect, it } from 'vitest'
import { pickLowestRankedUnusedTeam } from './auto-pick'

interface TestFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
}

describe('pickLowestRankedUnusedTeam', () => {
	const fixtures: TestFixture[] = [
		{ id: 'fx1', homeTeamId: 't-ars', awayTeamId: 't-che' },
		{ id: 'fx2', homeTeamId: 't-liv', awayTeamId: 't-eve' },
		{ id: 'fx3', homeTeamId: 't-mci', awayTeamId: 't-wba' },
	]
	const positions = new Map([
		['t-ars', 3],
		['t-che', 6],
		['t-liv', 2],
		['t-eve', 12],
		['t-mci', 1],
		['t-wba', 20],
	])

	it('returns the team with highest league_position (worst rank) when none used', () => {
		expect(
			pickLowestRankedUnusedTeam({ fixtures, usedTeamIds: new Set(), teamPositions: positions }),
		).toBe('t-wba')
	})

	it('excludes used teams', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-wba']),
				teamPositions: positions,
			}),
		).toBe('t-eve')
	})

	it('returns null when all teams in round are used', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(['t-ars', 't-che', 't-liv', 't-eve', 't-mci', 't-wba']),
				teamPositions: positions,
			}),
		).toBe(null)
	})

	it('treats teams with null/missing position as lowest-ranked (safe default)', () => {
		const positionsWithMissing = new Map([
			['t-ars', 3],
			['t-che', 6],
			['t-liv', 2],
			['t-eve', 12],
			['t-mci', 1],
			// t-wba missing — treated as position Infinity
		])
		expect(
			pickLowestRankedUnusedTeam({
				fixtures,
				usedTeamIds: new Set(),
				teamPositions: positionsWithMissing,
			}),
		).toBe('t-wba')
	})

	it('tie-breaks by team id alphabetically', () => {
		const tied = new Map([
			['t-aaa', 20],
			['t-zzz', 20],
		])
		const tiedFixtures: TestFixture[] = [{ id: 'fx1', homeTeamId: 't-aaa', awayTeamId: 't-zzz' }]
		expect(
			pickLowestRankedUnusedTeam({
				fixtures: tiedFixtures,
				usedTeamIds: new Set(),
				teamPositions: tied,
			}),
		).toBe('t-aaa')
	})

	it('returns null when fixtures array is empty', () => {
		expect(
			pickLowestRankedUnusedTeam({
				fixtures: [],
				usedTeamIds: new Set(),
				teamPositions: positions,
			}),
		).toBe(null)
	})
})
```

- [ ] **Step 2: Run the tests — verify FAIL**

Run: `pnpm exec vitest run src/lib/game/auto-pick.test.ts`
Expected: FAIL with "cannot find module ./auto-pick".

- [ ] **Step 3: Implement `auto-pick.ts`**

```typescript
// src/lib/game/auto-pick.ts
interface FixtureRef {
	id: string
	homeTeamId: string
	awayTeamId: string
}

interface PickLowestRankedInput {
	fixtures: FixtureRef[]
	usedTeamIds: Set<string>
	teamPositions: Map<string, number>
}

export function pickLowestRankedUnusedTeam({
	fixtures,
	usedTeamIds,
	teamPositions,
}: PickLowestRankedInput): string | null {
	const candidates = new Set<string>()
	for (const fx of fixtures) {
		if (!usedTeamIds.has(fx.homeTeamId)) candidates.add(fx.homeTeamId)
		if (!usedTeamIds.has(fx.awayTeamId)) candidates.add(fx.awayTeamId)
	}
	if (candidates.size === 0) return null

	let best: { teamId: string; position: number } | null = null
	for (const teamId of candidates) {
		const position = teamPositions.get(teamId) ?? Number.POSITIVE_INFINITY
		if (best === null) {
			best = { teamId, position }
			continue
		}
		if (position > best.position) {
			best = { teamId, position }
		} else if (position === best.position && teamId < best.teamId) {
			best = { teamId, position }
		}
	}
	return best?.teamId ?? null
}
```

- [ ] **Step 4: Run the tests — verify PASS**

Run: `pnpm exec vitest run src/lib/game/auto-pick.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/auto-pick.ts src/lib/game/auto-pick.test.ts
git commit -m "feat(game): add pickLowestRankedUnusedTeam pure function"
```

---

## Part B — User search and add-player API

### Task 3: User search route

**Files:**
- Create: `src/app/api/users/search/route.ts`
- Create: `src/app/api/users/search/route.test.ts`

`GET /api/users/search?q=<string>` — returns up to 10 users matching name or email (case-insensitive prefix match). Any authenticated user can call it.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/users/search/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
	db: {
		select: vi.fn(),
	},
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

describe('GET /api/users/search', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-me' } } as never)
	})

	it('returns [] for empty query', async () => {
		const req = new Request('http://localhost/api/users/search?q=')
		const res = await GET(req)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ users: [] })
	})

	it('returns matching users limited to 10', async () => {
		const mockUsers = Array.from({ length: 15 }, (_, i) => ({
			id: `u-${i}`,
			name: `User ${i}`,
			email: `u${i}@example.com`,
		}))
		const selectChain = {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(mockUsers.slice(0, 10)),
				}),
			}),
		}
		vi.mocked(db.select).mockReturnValue(selectChain as never)

		const req = new Request('http://localhost/api/users/search?q=user')
		const res = await GET(req)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.users).toHaveLength(10)
	})
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm exec vitest run src/app/api/users/search/route.test.ts`
Expected: FAIL with "cannot find module ./route".

- [ ] **Step 3: Implement route**

```typescript
// src/app/api/users/search/route.ts
import { or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { user } from '@/lib/schema/auth'

export async function GET(request: Request): Promise<Response> {
	await requireSession()

	const { searchParams } = new URL(request.url)
	const q = (searchParams.get('q') ?? '').trim()
	if (q.length === 0) {
		return NextResponse.json({ users: [] })
	}

	const pattern = `${q.toLowerCase()}%`
	const results = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(
			or(sql`lower(${user.name}) like ${pattern}`, sql`lower(${user.email}) like ${pattern}`),
		)
		.limit(10)

	return NextResponse.json({ users: results })
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `pnpm exec vitest run src/app/api/users/search/route.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/users/search/
git commit -m "feat(api): add user search endpoint"
```

---

### Task 4: Add-player route

**Files:**
- Create: `src/app/api/games/[id]/admin/add-player/route.ts`
- Create: `src/app/api/games/[id]/admin/add-player/route.test.ts`

`POST /api/games/[id]/admin/add-player` — body `{ userId }`. Admin-gated. Inserts `gamePlayer` row or returns 409 if duplicate, 404 if user not found.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/api/games/[id]/admin/add-player/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
	db: { query: { game: { findFirst: vi.fn() }, user: { findFirst: vi.fn() }, gamePlayer: { findFirst: vi.fn() } }, insert: vi.fn() },
}))

import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

function makeReq(body: unknown) {
	return new Request('http://localhost/api/games/g1/admin/add-player', {
		method: 'POST',
		body: JSON.stringify(body),
	})
}

const params = { params: Promise.resolve({ id: 'g1' }) }

describe('POST /api/games/[id]/admin/add-player', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireSession).mockResolvedValue({ user: { id: 'u-admin' } } as never)
	})

	it('returns 403 for non-admin', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ id: 'g1', createdBy: 'u-other', modeConfig: { startingLives: 3 }, gameMode: 'classic' } as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(403)
	})

	it('returns 404 when target user not found', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ id: 'g1', createdBy: 'u-admin', modeConfig: { startingLives: 3 }, gameMode: 'classic' } as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(404)
	})

	it('returns 409 when user already in game', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ id: 'g1', createdBy: 'u-admin', modeConfig: { startingLives: 3 }, gameMode: 'classic' } as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue({ id: 'u-new' } as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp-exist', userId: 'u-new' } as never)
		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(409)
	})

	it('inserts gamePlayer and returns 200', async () => {
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ id: 'g1', createdBy: 'u-admin', modeConfig: { startingLives: 3 }, gameMode: 'classic' } as never)
		vi.mocked(db.query.user.findFirst).mockResolvedValue({ id: 'u-new' } as never)
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue(undefined as never)
		const insertChain = { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'gp-new', userId: 'u-new' }]) }) }
		vi.mocked(db.insert).mockReturnValue(insertChain as never)

		const res = await POST(makeReq({ userId: 'u-new' }), params)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.gamePlayer.id).toBe('gp-new')
	})
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm exec vitest run src/app/api/games/[id]/admin/add-player/route.test.ts`
Expected: FAIL with "cannot find module ./route".

- [ ] **Step 3: Implement route**

```typescript
// src/app/api/games/[id]/admin/add-player/route.ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game, gamePlayer } from '@/lib/schema/game'
import { user } from '@/lib/schema/auth'

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await params
	const body = (await request.json()) as { userId?: string }

	if (!body.userId) {
		return NextResponse.json({ error: 'missing-userId' }, { status: 400 })
	}

	const gameRow = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!gameRow) {
		return NextResponse.json({ error: 'not-found' }, { status: 404 })
	}
	if (gameRow.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}

	const targetUser = await db.query.user.findFirst({ where: eq(user.id, body.userId) })
	if (!targetUser) {
		return NextResponse.json({ error: 'user-not-found' }, { status: 404 })
	}

	const existing = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, body.userId)),
	})
	if (existing) {
		return NextResponse.json({ error: 'already-in-game' }, { status: 409 })
	}

	const startingLives = (gameRow.modeConfig as { startingLives?: number } | null)?.startingLives ?? 1
	const [inserted] = await db
		.insert(gamePlayer)
		.values({
			gameId,
			userId: body.userId,
			status: 'alive',
			livesRemaining: startingLives,
		})
		.returning()

	return NextResponse.json({ gamePlayer: inserted })
}
```

- [ ] **Step 4: Run tests — verify PASS**

Run: `pnpm exec vitest run src/app/api/games/[id]/admin/add-player/route.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Typecheck + full tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/games/[id]/admin/add-player/
git commit -m "feat(api): add admin add-player route"
```

---

## Part C — Pick-for-player API

### Task 5: Extend pick route with `actingAs` + rule 1

**Files:**
- Modify: `src/app/api/picks/[gameId]/[roundId]/route.ts`
- Modify (test): `src/app/api/picks/[gameId]/[roundId]/route.test.ts` (create if doesn't exist)

Accept optional `actingAs` body field. When present:
- Require the session user to be the game admin (`game.createdBy`).
- Require `actingAs` to reference a `gamePlayer` in this game.
- Target that player's pick history + used-teams for validation, not the admin's.
- On successful write, if target's `eliminatedReason === 'missed_rebuy_pick'`, flip status back to `alive` in the same transaction.

- [ ] **Step 1: Read the existing route**

Run: `cat src/app/api/picks/\[gameId\]/\[roundId\]/route.ts`

Note the current structure: session check, gameData load, pick validation, pick insert, cup-mode restricted check (from 4b). The `actingAs` handling is an override layer on top.

- [ ] **Step 2: Add the `actingAs` resolution block**

Near the top of the POST handler, after the session + gameData load, add:

```typescript
const body = (await request.json()) as { picks?: unknown[]; actingAs?: string }
let targetGamePlayer = await db.query.gamePlayer.findFirst({
	where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
})

if (body.actingAs) {
	// Admin is picking for another player.
	if (gameData.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'forbidden' }, { status: 403 })
	}
	const actingAsPlayer = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.id, body.actingAs), eq(gamePlayer.gameId, gameId)),
	})
	if (!actingAsPlayer) {
		return NextResponse.json({ error: 'actingAs-not-in-game' }, { status: 404 })
	}
	targetGamePlayer = actingAsPlayer
}

if (!targetGamePlayer) {
	return NextResponse.json({ error: 'not-in-game' }, { status: 403 })
}
```

All subsequent references to "this player's picks" should use `targetGamePlayer.id` / `.userId`. Search the file for the existing `gamePlayer` lookup and replace with `targetGamePlayer`. Used-teams lookups must query `pick.gamePlayerId = targetGamePlayer.id`.

- [ ] **Step 3: Add rule 1 un-elimination after successful pick write**

After the pick insert succeeds (and before the response), add:

```typescript
let unEliminated = false
if (body.actingAs && targetGamePlayer.eliminatedReason === 'missed_rebuy_pick') {
	await db
		.update(gamePlayer)
		.set({ status: 'alive', eliminatedReason: null, eliminatedRoundNumber: null })
		.where(eq(gamePlayer.id, targetGamePlayer.id))
	unEliminated = true
}
```

Return `{ ...existing, unEliminated }` in the JSON response.

- [ ] **Step 4: Add tests for `actingAs`**

In `src/app/api/picks/[gameId]/[roundId]/route.test.ts`, add these tests (if no file exists, create one using the mock pattern from Task 3):

```typescript
it('rejects actingAs from non-admin with 403', async () => {
	// mock gameData.createdBy = 'u-other', session.user.id = 'u-admin'
	// POST body: { picks: [...], actingAs: 'gp-target' }
	// expect 403
})

it('rejects actingAs referencing a player not in this game with 404', async () => {
	// mock gameData.createdBy = 'u-admin', session.user.id = 'u-admin'
	// actingAs lookup returns undefined
	// expect 404
})

it('un-eliminates target when reason is missed_rebuy_pick', async () => {
	// target.eliminatedReason = 'missed_rebuy_pick', target.status = 'eliminated'
	// after successful pick: db.update called on gamePlayer with status: 'alive', eliminatedReason: null
	// response body.unEliminated === true
})

it('does not un-eliminate when reason is something else', async () => {
	// target.eliminatedReason = 'loss'
	// after pick: no db.update for gamePlayer; response body.unEliminated === false
})
```

- [ ] **Step 5: Run tests — verify new tests PASS**

Run: `pnpm exec vitest run src/app/api/picks/[gameId]/[roundId]/route.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/picks/[gameId]/[roundId]/
git commit -m "feat(api): support actingAs in pick route with rule-1 un-elimination"
```

---

## Part D — Engine rules 2 and 3

### Task 6: `processDeadlineLock` orchestrator

**Files:**
- Create: `src/lib/game/no-pick-handler.ts`
- Create: `src/lib/game/no-pick-handler.test.ts`

Orchestrator that scans for no-pick players in newly-live rounds and applies rule 2 (classic, round ≥ 3) or rule 3 (turbo/cup).

- [ ] **Step 1: Implement `no-pick-handler.ts`**

```typescript
// src/lib/game/no-pick-handler.ts
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round, team } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'
import { pickLowestRankedUnusedTeam } from './auto-pick'

export async function processDeadlineLock(roundIds: string[]): Promise<{
	autoPicksInserted: number
	playersEliminated: number
	paymentsRefunded: number
}> {
	let autoPicksInserted = 0
	let playersEliminated = 0
	let paymentsRefunded = 0

	for (const roundId of roundIds) {
		const roundRow = await db.query.round.findFirst({ where: eq(round.id, roundId) })
		if (!roundRow) continue

		const games = await db.query.game.findMany({
			where: and(eq(game.currentRoundId, roundId), ne(game.status, 'completed')),
			with: { players: true },
		})

		for (const g of games) {
			const activePlayers = g.players.filter((p) => p.status === 'alive')
			for (const player of activePlayers) {
				const existingPick = await db.query.pick.findFirst({
					where: and(eq(pick.gamePlayerId, player.id), eq(pick.roundId, roundId)),
				})
				if (existingPick) continue

				if (g.gameMode === 'classic' && roundRow.number >= 3) {
					const result = await applyRule2Classic(g.id, player, roundId)
					if (result === 'auto-pick-inserted') autoPicksInserted++
					else if (result === 'eliminated-no-fallback') playersEliminated++
				} else if (g.gameMode === 'turbo' || g.gameMode === 'cup') {
					const result = await applyRule3TurboOrCup(g.id, player, roundRow.number)
					playersEliminated++
					if (result.refunded) paymentsRefunded++
				}
			}
		}
	}

	return { autoPicksInserted, playersEliminated, paymentsRefunded }
}

async function applyRule2Classic(
	gameId: string,
	player: typeof gamePlayer.$inferSelect,
	roundId: string,
): Promise<'auto-pick-inserted' | 'eliminated-no-fallback'> {
	const fixtures = await db.query.fixture.findMany({
		where: eq(fixture.roundId, roundId),
		with: { homeTeam: true, awayTeam: true },
	})
	const usedPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.gamePlayerId, player.id)),
	})
	const usedTeamIds = new Set(usedPicks.flatMap((p) => (p.teamId ? [p.teamId] : [])))

	const allTeamIds = new Set<string>()
	for (const fx of fixtures) {
		allTeamIds.add(fx.homeTeamId)
		allTeamIds.add(fx.awayTeamId)
	}
	const teamRows = allTeamIds.size
		? await db.query.team.findMany({ where: inArray(team.id, Array.from(allTeamIds)) })
		: []
	const teamPositions = new Map(
		teamRows.map((t) => [t.id, t.leaguePosition ?? Number.POSITIVE_INFINITY] as const),
	)

	const teamId = pickLowestRankedUnusedTeam({
		fixtures: fixtures.map((fx) => ({
			id: fx.id,
			homeTeamId: fx.homeTeamId,
			awayTeamId: fx.awayTeamId,
		})),
		usedTeamIds,
		teamPositions,
	})

	if (!teamId) {
		await db
			.update(gamePlayer)
			.set({
				status: 'eliminated',
				eliminatedReason: 'no_pick_no_fallback',
				eliminatedRoundNumber: undefined,
			})
			.where(eq(gamePlayer.id, player.id))
		return 'eliminated-no-fallback'
	}

	const chosenFixture = fixtures.find(
		(fx) => fx.homeTeamId === teamId || fx.awayTeamId === teamId,
	)
	if (!chosenFixture) {
		// Defensive — should not happen since teamId came from fixtures.
		return 'eliminated-no-fallback'
	}
	const predictedResult = chosenFixture.homeTeamId === teamId ? 'home_win' : 'away_win'
	await db.insert(pick).values({
		gameId,
		roundId,
		gamePlayerId: player.id,
		fixtureId: chosenFixture.id,
		teamId,
		predictedResult,
		confidenceRank: null,
		isAuto: true,
	})
	return 'auto-pick-inserted'
}

async function applyRule3TurboOrCup(
	gameId: string,
	player: typeof gamePlayer.$inferSelect,
	roundNumber: number,
): Promise<{ refunded: boolean }> {
	await db
		.update(gamePlayer)
		.set({
			status: 'eliminated',
			eliminatedReason: 'no_pick_no_fallback',
			eliminatedRoundNumber: roundNumber,
		})
		.where(eq(gamePlayer.id, player.id))

	const refundCandidate = await db.query.payment.findFirst({
		where: and(
			eq(payment.gameId, gameId),
			eq(payment.userId, player.userId),
			inArray(payment.status, ['paid', 'claimed']),
		),
		orderBy: (p, { desc }) => desc(p.createdAt),
	})
	if (!refundCandidate) return { refunded: false }

	await db
		.update(payment)
		.set({ status: 'refunded', refundedAt: new Date() })
		.where(eq(payment.id, refundCandidate.id))
	return { refunded: true }
}
```

- [ ] **Step 2: Write test scaffolding (minimal — full integration tests in Task 7)**

```typescript
// src/lib/game/no-pick-handler.test.ts
import { describe, expect, it, vi } from 'vitest'
import { processDeadlineLock } from './no-pick-handler'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			round: { findFirst: vi.fn() },
			game: { findMany: vi.fn().mockResolvedValue([]) },
			pick: { findFirst: vi.fn(), findMany: vi.fn() },
			fixture: { findMany: vi.fn() },
			team: { findMany: vi.fn() },
			payment: { findFirst: vi.fn() },
		},
		insert: vi.fn(),
		update: vi.fn(),
	},
}))

describe('processDeadlineLock', () => {
	it('no-ops when no games use the round', async () => {
		const result = await processDeadlineLock(['r1'])
		expect(result).toEqual({ autoPicksInserted: 0, playersEliminated: 0, paymentsRefunded: 0 })
	})
})
```

- [ ] **Step 3: Run — verify PASS**

Run: `pnpm exec vitest run src/lib/game/no-pick-handler.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/no-pick-handler.ts src/lib/game/no-pick-handler.test.ts
git commit -m "feat(game): add processDeadlineLock orchestrator for rules 2/3"
```

---

### Task 7: Persist `league_position` during competition sync

**Files:**
- Modify: `src/lib/game/bootstrap-competitions.ts`

When `bootstrap-competitions.ts` syncs competition data, it should also persist the latest standings into `team.league_position`. Use the existing `fetchStandings` adapter method.

- [ ] **Step 1: Read existing bootstrap**

Run: `cat src/lib/game/bootstrap-competitions.ts | head -80`

Locate the team-upsert loop.

- [ ] **Step 2: After team upsert, fetch standings and persist positions**

After the existing team sync, add:

```typescript
const standings = await adapter.fetchStandings()
for (const row of standings) {
	await db
		.update(team)
		.set({ leaguePosition: row.position })
		.where(
			and(
				eq(team.competitionId, competitionId),
				eq(team.externalId, row.teamExternalId),
			),
		)
}
```

(Adjust exact imports/variables to match the file's existing style.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Update existing test to assert position persistence**

If `bootstrap-competitions.test.ts` exists and mocks the adapter, add an assertion that `db.update` is called for each standings row with `leaguePosition`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/bootstrap-competitions.ts src/lib/game/bootstrap-competitions.test.ts
git commit -m "feat(sync): persist league_position during competition sync"
```

---

### Task 8: Wire `processDeadlineLock` into daily-sync

**Files:**
- Modify: `src/app/api/cron/daily-sync/route.ts`

After the existing competition sync completes, collect the set of round IDs that transitioned to `live` in this run and hand them to `processDeadlineLock`.

- [ ] **Step 1: Read current daily-sync**

Run: `cat src/app/api/cron/daily-sync/route.ts`

Identify where round-transition detection happens (Phase 4b added this for auto-submits).

- [ ] **Step 2: Collect transitioned round ids and invoke handler**

At the end of the POST handler, after the existing sync work:

```typescript
import { processDeadlineLock } from '@/lib/game/no-pick-handler'

// ... after collecting the list of rounds that moved to `live` ...
const deadlineLockedRoundIds: string[] = /* the existing collection */
if (deadlineLockedRoundIds.length > 0) {
	await processDeadlineLock(deadlineLockedRoundIds)
}
```

(The existing Phase 4b code that detects `transitioningToOpen` for auto-submits already iterates the right set — reuse that collection or extract if needed.)

- [ ] **Step 3: Extend existing daily-sync tests**

Add a test case where a round transitions; assert `processDeadlineLock` was called with the round id.

- [ ] **Step 4: Typecheck + full tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/daily-sync/
git commit -m "feat(sync): invoke processDeadlineLock on round transitions"
```

---

## Part E — UI components

### Task 9: `<AdminPanel>` component

**Files:**
- Create: `src/components/game/admin-panel.tsx`

Always-visible-to-admin card below standings. Two buttons: "+ Add player" (primary), "Split pot (N alive)" (neutral). Clicking opens the corresponding modal.

- [ ] **Step 1: Implement**

```typescript
// src/components/game/admin-panel.tsx
'use client'
import { useState } from 'react'
import { AddPlayerModal } from './add-player-modal'
import { SplitPotModal } from './split-pot-modal'

interface AdminPanelProps {
	gameId: string
	aliveCount: number
	potTotal: string
}

export function AdminPanel({ gameId, aliveCount, potTotal }: AdminPanelProps) {
	const [openModal, setOpenModal] = useState<'add' | 'split' | null>(null)

	return (
		<>
			<div className="rounded-xl border border-border bg-card p-4">
				<div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
					<span className="rounded-sm bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
						Admin
					</span>
					Game actions
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setOpenModal('add')}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
					>
						+ Add player
					</button>
					<button
						type="button"
						onClick={() => setOpenModal('split')}
						disabled={aliveCount < 2}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
					>
						Split pot ({aliveCount} alive)
					</button>
				</div>
			</div>
			{openModal === 'add' && (
				<AddPlayerModal gameId={gameId} onClose={() => setOpenModal(null)} />
			)}
			{openModal === 'split' && (
				<SplitPotModal
					gameId={gameId}
					aliveCount={aliveCount}
					potTotal={potTotal}
					onClose={() => setOpenModal(null)}
				/>
			)}
		</>
	)
}
```

- [ ] **Step 2: Typecheck (will fail — modal components don't exist yet)**

Run: `pnpm exec tsc --noEmit`
Expected: tsc fails with "cannot find module ./add-player-modal". Acceptable — Tasks 10 and 11 add those.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/admin-panel.tsx
git commit -m "feat(game): add AdminPanel component shell"
```

---

### Task 10: `<AddPlayerModal>` component

**Files:**
- Create: `src/components/game/add-player-modal.tsx`

Modal with search → results → select → submit. Post-submit success state chains to `/game/[id]/pick?actingAs=<newGamePlayerId>`.

- [ ] **Step 1: Implement**

```typescript
// src/components/game/add-player-modal.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface UserRow {
	id: string
	name: string
	email: string
}

interface AddPlayerModalProps {
	gameId: string
	onClose: () => void
}

interface AddedState {
	gamePlayerId: string
	userName: string
}

export function AddPlayerModal({ gameId, onClose }: AddPlayerModalProps) {
	const router = useRouter()
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<UserRow[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)
	const [added, setAdded] = useState<AddedState | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (added) return
		if (query.trim().length === 0) {
			setResults([])
			return
		}
		const timer = setTimeout(async () => {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
			if (!res.ok) return
			const body = (await res.json()) as { users: UserRow[] }
			setResults(body.users)
		}, 200)
		return () => clearTimeout(timer)
	}, [query, added])

	const selected = results.find((u) => u.id === selectedId) ?? null

	async function handleAdd() {
		if (!selected || submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const res = await fetch(`/api/games/${gameId}/admin/add-player`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: selected.id }),
			})
			const body = await res.json()
			if (!res.ok) {
				setError(body.error ?? 'failed-to-add')
				return
			}
			setAdded({ gamePlayerId: body.gamePlayer.id, userName: selected.name })
		} finally {
			setSubmitting(false)
		}
	}

	function handleGoToPick() {
		if (!added) return
		router.push(`/game/${gameId}/pick?actingAs=${added.gamePlayerId}`)
	}

	function handleBackToGame() {
		onClose()
		router.refresh()
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
			onClick={onClose}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				className="w-[340px] rounded-lg border border-border bg-background p-5 shadow-2xl"
			>
				{added ? (
					<>
						<h3 className="text-[15px] font-bold">{added.userName} added</h3>
						<p className="mb-4 mt-1 text-xs text-muted-foreground">
							Pick for them now, or come back later.
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={handleBackToGame}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								Back to game
							</button>
							<button
								type="button"
								onClick={handleGoToPick}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
							>
								Pick for {added.userName}
							</button>
						</div>
					</>
				) : (
					<>
						<h3 className="text-[15px] font-bold">Add player to this game</h3>
						<p className="mb-3 mt-1 text-xs text-muted-foreground">
							Search an existing user by name or email.
						</p>
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="name or email…"
							className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
						/>
						<div className="mt-2 max-h-[180px] overflow-y-auto">
							{results.map((u) => (
								<button
									type="button"
									key={u.id}
									onClick={() => setSelectedId(u.id)}
									className={cn(
										'mb-0.5 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm',
										selectedId === u.id && 'border-primary bg-primary/10',
										selectedId !== u.id && 'hover:bg-card hover:border-border',
									)}
								>
									<span className="flex-1">
										<span className="block font-semibold">{u.name}</span>
										<span className="block text-[11px] text-muted-foreground">{u.email}</span>
									</span>
								</button>
							))}
						</div>
						{error === 'already-in-game' && (
							<p className="mt-2 text-xs text-amber-600">That user is already in this game.</p>
						)}
						{error && error !== 'already-in-game' && (
							<p className="mt-2 text-xs text-red-500">Couldn't add: {error}</p>
						)}
						<p className="mt-3 rounded-l-sm border-l-2 border-primary bg-primary/10 px-2 py-2 text-[11px] text-muted-foreground">
							Can't find someone? Ask them to sign up first.
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={onClose}
								className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleAdd}
								disabled={!selected || submitting}
								className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
							>
								{selected ? `Add ${selected.name}` : 'Add'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean (`admin-panel.tsx`'s import of this module now resolves).

- [ ] **Step 3: Commit**

```bash
git add src/components/game/add-player-modal.tsx
git commit -m "feat(game): add AddPlayerModal with pick-chain success state"
```

---

### Task 11: `<SplitPotModal>` component

**Files:**
- Create: `src/components/game/split-pot-modal.tsx`

Confirmation modal. Shows pot.total, per-winner amount, explicit warning, green confirm button. Submits to existing split-pot route.

- [ ] **Step 1: Implement**

```typescript
// src/components/game/split-pot-modal.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface SplitPotModalProps {
	gameId: string
	aliveCount: number
	potTotal: string
	onClose: () => void
}

export function SplitPotModal({ gameId, aliveCount, potTotal, onClose }: SplitPotModalProps) {
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
			const res = await fetch(`/api/games/${gameId}/admin/split-pot`, {
				method: 'POST',
			})
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
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
			onClick={onClose}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				className="w-[360px] rounded-lg border border-border bg-background p-5 shadow-2xl"
			>
				<h3 className="text-[15px] font-bold">Split the pot now?</h3>
				<p className="mb-4 mt-1 text-xs text-muted-foreground">
					This ends the game immediately. All {aliveCount} alive players are marked as winners.
					Eliminated players get nothing.
				</p>
				<div className="mb-4 rounded-md border border-border bg-card p-3 text-center">
					<div className="text-xl font-extrabold tabular-nums text-emerald-500">
						£{perWinner} each
					</div>
					<div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						£{potTotal} split {aliveCount} ways
					</div>
				</div>
				<p className="mb-4 rounded-r-sm border-l-2 border-amber-500 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-500">
					⚠ This can't be undone. Game status becomes "completed".
				</p>
				{error && <p className="mb-3 text-xs text-red-500">Couldn't split: {error}</p>}
				<div className="flex justify-end gap-2">
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
				</div>
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/split-pot-modal.tsx
git commit -m "feat(game): add SplitPotModal confirmation"
```

---

### Task 12: `<ActingAsBanner>` component

**Files:**
- Create: `src/components/game/acting-as-banner.tsx`

Contained card banner for the pick page's acting-as mode.

- [ ] **Step 1: Implement**

```typescript
// src/components/game/acting-as-banner.tsx
'use client'
import { useRouter } from 'next/navigation'

interface ActingAsBannerProps {
	gameId: string
	targetUserName: string
	targetAvatarInitials: string
}

export function ActingAsBanner({ gameId, targetUserName, targetAvatarInitials }: ActingAsBannerProps) {
	const router = useRouter()
	return (
		<div className="mx-4 mt-3 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground">
			<span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-[11px] font-bold">
				{targetAvatarInitials}
			</span>
			<div className="flex flex-col">
				<span className="text-[10px] font-black uppercase tracking-wider opacity-85">
					Admin mode
				</span>
				<span className="text-sm font-semibold">You're picking for {targetUserName}</span>
			</div>
			<button
				type="button"
				onClick={() => router.push(`/game/${gameId}`)}
				className="ml-auto rounded-md bg-black/25 px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
			>
				Exit admin mode
			</button>
		</div>
	)
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add src/components/game/acting-as-banner.tsx
git commit -m "feat(game): add ActingAsBanner for pick-for-player mode"
```

---

### Task 13: `<AutoPickBanner>` component

**Files:**
- Create: `src/components/game/auto-pick-banner.tsx`

One-time dismissible banner. Reads/writes `localStorage.dismissedAutoPicks` (JSON array of pick ids).

- [ ] **Step 1: Implement**

```typescript
// src/components/game/auto-pick-banner.tsx
'use client'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dismissedAutoPicks'

interface AutoPickBannerProps {
	pickId: string
	teamShortName: string
	kickoffLabel: string
}

function getDismissed(): string[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		return raw ? (JSON.parse(raw) as string[]) : []
	} catch {
		return []
	}
}

function persistDismissed(ids: string[]) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function AutoPickBanner({ pickId, teamShortName, kickoffLabel }: AutoPickBannerProps) {
	const [dismissed, setDismissed] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		if (getDismissed().includes(pickId)) {
			setDismissed(true)
		}
	}, [pickId])

	if (!mounted || dismissed) return null

	function handleDismiss() {
		const ids = getDismissed()
		if (!ids.includes(pickId)) {
			ids.push(pickId)
			persistDismissed(ids)
		}
		setDismissed(true)
	}

	return (
		<div className="mx-4 my-3 flex items-start gap-3 rounded-lg border border-amber-500/50 bg-card p-3">
			<span className="text-lg text-amber-500">⚠</span>
			<div className="flex-1">
				<h4 className="text-xs font-bold">You missed the deadline</h4>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					We auto-picked {teamShortName} for you — the lowest-ranked team you hadn't used.
					Kickoff is {kickoffLabel}. Message the admin if you want to swap.
				</p>
			</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="text-sm text-muted-foreground"
				aria-label="Dismiss"
			>
				✕
			</button>
		</div>
	)
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add src/components/game/auto-pick-banner.tsx
git commit -m "feat(game): add AutoPickBanner one-time notification"
```

---

### Task 14: Contextual `✎` icon on standings rows

**Files:**
- Modify: `src/components/standings/progress-grid.tsx`
- Modify: `src/components/standings/cup-grid.tsx`
- Modify: `src/components/standings/cup-ladder.tsx`
- Modify: `src/components/standings/turbo-standings.tsx`

Add an optional `adminPickForPlayerUrl?: (gamePlayerId: string) => string` prop and a `showAdminActions?: boolean` flag. On rows where the player hasn't picked in the current open round, render a small `✎` link button.

- [ ] **Step 1: `progress-grid.tsx`**

Add to props type:

```typescript
showAdminActions?: boolean
gameId?: string
```

At the point where rows are rendered, if `showAdminActions && !player.currentRoundPicked`, append:

```tsx
<a
	href={`/game/${gameId}/pick?actingAs=${player.gamePlayerId}`}
	title={`Pick for ${player.name}`}
	className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted"
>
	✎
</a>
```

- [ ] **Step 2: Repeat for `cup-grid.tsx`, `cup-ladder.tsx`, `turbo-standings.tsx`**

Same pattern — accept `showAdminActions?: boolean` + `gameId?: string` props; determine "no pick this round" from each component's existing data; render the `✎` link button.

- [ ] **Step 3: Typecheck + full tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/standings/
git commit -m "feat(standings): add contextual admin pencil icon for pick-for-player"
```

---

### Task 15: Auto-pick ribbon on progress-grid pick cells

**Files:**
- Modify: `src/components/standings/progress-grid.tsx`

Render an amber "AUTO" ribbon on pick cells whose `isAuto === true`. Amber dashed treatment while pending; ribbon persists post-settlement.

- [ ] **Step 1: Extend cell rendering**

Locate the `GridCell` helper (if extracted) or the inline cell rendering. Add:

```tsx
<span
	className={cn(
		/* existing classes */,
		pick?.isAuto && pick?.result === 'pending' && 'border border-dashed border-amber-500 text-amber-500 bg-amber-500/10',
	)}
>
	{pick?.teamShort ?? '—'}
	{pick?.isAuto && (
		<span className="absolute -right-0.5 -top-0.5 rounded-sm bg-amber-500 px-1 py-0 text-[8px] font-black uppercase tracking-wider text-white">
			AUTO
		</span>
	)}
</span>
```

- [ ] **Step 2: Update the `pick` prop shape to include `isAuto`**

Ensure the upstream query (`getProgressGridData` or equivalent in `detail-queries.ts`) selects `pick.is_auto`.

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/standings/progress-grid.tsx src/lib/game/detail-queries.ts
git commit -m "feat(standings): render AUTO ribbon on auto-picked cells"
```

---

## Part F — Integration

### Task 16: Wire admin-panel + auto-pick-banner into GameDetailView

**Files:**
- Modify: `src/components/game/game-detail-view.tsx`

Render `<AdminPanel />` below standings when viewer is admin. Render `<AutoPickBanner />` at top of body when the viewer's current-round pick is `isAuto: true`.

- [ ] **Step 1: Read current component**

Run: `cat src/components/game/game-detail-view.tsx | head -80`

- [ ] **Step 2: Add imports and conditional renders**

Near existing imports:

```typescript
import { AdminPanel } from '@/components/game/admin-panel'
import { AutoPickBanner } from '@/components/game/auto-pick-banner'
```

Inside the return, below the standings rendering:

```tsx
{isAdmin && (
	<AdminPanel
		gameId={game.id}
		aliveCount={game.players.filter((p) => p.status === 'alive').length}
		potTotal={game.pot.total}
	/>
)}
```

Near the top of the body (just under LiveScoreTicker from 4c1):

```tsx
{myPickIsAuto && myPick && (
	<AutoPickBanner
		pickId={myPick.id}
		teamShortName={myPick.teamShortName}
		kickoffLabel={myPick.kickoffLabel}
	/>
)}
```

Derive `myPickIsAuto` from `game.myCurrentRoundPick?.isAuto` (whichever property the existing detail data exposes; extend `getGameDetail` if needed to surface `isAuto` on the viewer's pick).

- [ ] **Step 3: Pass `showAdminActions` and `gameId` to standings renders**

In the same component, update the props being passed to the standings components added in Task 14:

```tsx
<ProgressGrid data={...} showAdminActions={isAdmin} gameId={game.id} />
<CupStandings data={...} showAdminActions={isAdmin} gameId={game.id} />
<TurboStandings data={...} showAdminActions={isAdmin} gameId={game.id} />
```

(Use whichever component is rendered based on game mode.)

- [ ] **Step 4: Typecheck + full tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/game-detail-view.tsx src/lib/game/detail-queries.ts
git commit -m "feat(game): integrate admin panel and auto-pick banner into game detail"
```

---

### Task 17: Wire acting-as mode into pick page

**Files:**
- Modify: `src/app/(app)/game/[id]/page.tsx` (or wherever pick rendering happens — inspect first)

Read `?actingAs=...` URL param. If present AND viewer is admin AND the target is a valid `gamePlayer` in this game, load the target player's pick context (used teams, lives, etc.) instead of the admin's. Render `<ActingAsBanner />` above the pick UI.

- [ ] **Step 1: Read the existing pick-route page**

Run: `cat src/app/\(app\)/game/\[id\]/page.tsx`

Identify where the "current viewer's pick state" is loaded.

- [ ] **Step 2: Extract + override the target gamePlayer**

```typescript
const actingAsId = typeof searchParams.actingAs === 'string' ? searchParams.actingAs : null
const isAdmin = gameData.createdBy === session.user.id
let targetGamePlayerId: string | null = myGamePlayer.id
let actingAsTarget: { userName: string; initials: string } | null = null

if (actingAsId && isAdmin) {
	const target = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.id, actingAsId), eq(gamePlayer.gameId, gameData.id)),
		with: { user: true },
	})
	if (target) {
		targetGamePlayerId = target.id
		const name = target.user.name
		actingAsTarget = {
			userName: name,
			initials: name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase(),
		}
	}
}
```

Replace references to "my pick history" / "my used teams" with queries keyed off `targetGamePlayerId`.

- [ ] **Step 3: Render the banner**

Near the top of the pick render:

```tsx
{actingAsTarget && (
	<ActingAsBanner
		gameId={gameData.id}
		targetUserName={actingAsTarget.userName}
		targetAvatarInitials={actingAsTarget.initials}
	/>
)}
```

Submit button on the pick UI should pass `actingAs: targetGamePlayerId` in the POST body when `actingAsTarget` is non-null. Look for the pick form component (probably `ClassicPick` / `TurboPick` / `CupPick`) and thread a new optional `submitOverride?: { actingAs: string; buttonLabel: string }` prop, OR — simpler — pass a new `actingAs?: string` prop down and let the pick components read it when building their POST body.

- [ ] **Step 4: Update pick components to forward `actingAs` in POST body**

For each of `ClassicPick`, `TurboPick`, `CupPick`: locate the `fetch('/api/picks/…')` call. Add `actingAs` to the JSON body when present:

```typescript
body: JSON.stringify({ picks: [...], ...(actingAs ? { actingAs } : {}) }),
```

Also change the submit button label to "Submit as {targetName}" when acting-as is set.

- [ ] **Step 5: Typecheck + full tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/game/\[id\]/page.tsx src/components/picks/
git commit -m "feat(game): implement actingAs URL param and submit-as-X flow"
```

---

## Part G — Seed and verification

### Task 18: Dev seed — missed-deadline scenario

**Files:**
- Modify: `scripts/seed.ts`

Add a seed scenario where one classic-game player has no pick for the current round (round ≥ 3), so rule 2's auto-pick flow can be exercised locally via `just db-reset`.

- [ ] **Step 1: Read current seed**

Run: `tail -60 scripts/seed.ts`

- [ ] **Step 2: Add missed-pick block**

Near the existing classic-game seeding, after players have picked for rounds 1-2, INTENTIONALLY skip inserting a pick for one player in round 3+:

```typescript
// --- Missed-deadline scenario for 4c2 rule 2 verification -----------------
// Player "Rachel" has no pick for round 3 of the classic game.
// Running `processDeadlineLock(['<round-3-id>'])` will auto-assign her the
// lowest-ranked unused team. Also sets league_position on teams for realism.
const positions: Record<string, number> = {
	ARS: 3, CHE: 8, LIV: 2, EVE: 13, MCI: 1, BUR: 20,
	// fill in remaining teams realistically
}
for (const [shortName, pos] of Object.entries(positions)) {
	await db.update(team)
		.set({ leaguePosition: pos })
		.where(and(eq(team.competitionId, plCompetitionId), eq(team.shortName, shortName)))
}
```

(Engineer: inspect the existing seed for actual team shortName keys; adjust.)

- [ ] **Step 3: Run seed to verify**

Run: `just db-reset`
Expected: seed completes; inspecting the DB shows:
- Rachel's `game_player` row exists for the classic game with `status: 'alive'`.
- No `pick` row for Rachel in round 3.
- Teams have non-null `league_position`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): add missed-deadline scenario for 4c2 verification"
```

---

### Task 19: Full verification sweep

**Files:** None (may produce a `chore: format` commit).

- [ ] **Step 1: Biome**

Run: `pnpm exec biome check --write .`
Expected: clean OR formats some files.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `pnpm exec vitest run`
Expected: all pass; count is `baseline + ~20` (auto-pick 6 cases, users/search 2 cases, add-player 4 cases, pick route actingAs 4 cases, no-pick-handler 1+, daily-sync extension 1+).

- [ ] **Step 4: Next build**

Run: `pnpm exec next build`
Expected: compile + TS phases pass. "Collect page data" may fail on missing env; sandbox-only.

- [ ] **Step 5: Manual dev smoke (optional — requires docker)**

```bash
docker compose up -d
just db-reset
just dev
```

Navigate to the classic game. As admin:
- Confirm `<AdminPanel />` renders with "+ Add player" and "Split pot" buttons.
- Confirm Rachel's row shows the `✎` icon (because she has no round-3 pick).
- Click `✎` → pick page loads with `<ActingAsBanner />`; submit as Rachel → un-elimination fires if applicable.
- Click "+ Add player" → modal opens; search works; add a user and use the "Pick for X now" chain.
- Trigger `processDeadlineLock(['round-3-id'])` manually via `tsx scripts/run-deadline-lock.ts` (or hit the daily-sync cron locally) → Rachel gets an auto-assigned pick with `isAuto: true`.
- Reload game detail as Rachel → `<AutoPickBanner />` appears once; dismiss sticks in localStorage.

- [ ] **Step 6: Commit formatting if any**

If biome made changes:

```bash
git add -A
git commit -m "chore: format and smoke-fix for Phase 4c2"
```

---

## Out-of-scope reminders

- Paid rebuys (4c3). The refund flow laid here (rule 3) is the starting point.
- Admin kick/remove player with history cleanup.
- Admin ownership transfer.
- `paymentId`-keyed admin payment routes (4b follow-up; 4c3 should handle).
- Email / push notifications on auto-pick.
- GH Actions secrets (Phase 4.5).

## Risk mitigation

- **Stale `league_position`.** If daily-sync fails the day a deadline falls, auto-pick runs against stale positions. Mitigation: `pickLowestRankedUnusedTeam` treats null positions as "worst" so missing standings still yields a pick; the wrong team may get assigned but the player isn't stuck. Phase 4.5 playbook verifies standings freshness pre-weekend.
- **Admin un-elimination transaction.** Pick insert + status flip must be atomic — otherwise a crash between the two leaves partial state. Implementation uses `db.transaction(...)` to wrap both.
- **Concurrent deadline-lock invocations.** Two daily-sync runs in quick succession could both try to auto-pick the same player. The `pick` table has a `(game_player_id, round_id)` uniqueness constraint; second insert fails silently.
- **Multiple payment rows on refund.** Rule 3 refunds the most recent `paid`/`claimed` row. Documented as "most recent wins" — current semantics until rebuys change the model in 4c3.
- **URL-param admin mode.** Non-admin hitting `/game/[id]/pick?actingAs=<otherId>` is rejected server-side in the pick route with 403; the page-level check redirects to game detail. No privilege escalation risk.
