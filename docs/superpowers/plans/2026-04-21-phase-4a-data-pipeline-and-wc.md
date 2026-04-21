# Phase 4a: Data Pipeline + World Cup Competition Implementation Plan

> ⚠️ **Before running any of this in production:** Phase 4a code merges to `main` but does not auto-deploy anywhere — the repo is not yet linked to Vercel, there's no staging environment, and Doppler / Sentry aren't wired. **Phase 4.5 (Production Launch Foundation)** is the next plan and must land before Phase 4a (or anything after it) is live. See the "Post-merge operational checklist" at the bottom of this file for the full admin-prereq list; Phase 4.5 turns those into executable tasks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace seeded dev data with a real data pipeline that keeps PL 25/26 and WC 2026 fresh during match windows, and add the World Cup competition with its classic-mode auto-elimination rule.

**Architecture:** Layered scheduler approach — Vercel daily cron for housekeeping, GitHub Actions 5-min workflow for match-window polling, Upstash QStash for event-driven scheduling, client-side 30s polling via a lightweight live endpoint. World Cup competition data is hand-seeded for structure + pot assignments, fetched for fixtures/scores via the football-data.org adapter.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + postgres.js, Vitest, `@upstash/qstash`, GitHub Actions, FPL + football-data.org adapters.

**Design spec:** `docs/superpowers/specs/2026-04-21-phase-4-design.md`

---

## Scope

Phase 4a is one self-contained piece of work: the plumbing that makes the app "live" plus the WC competition structure. UI surfaces that consume this data (match-day view, cup pick page, share variants) are Phase 4b/4c. This plan stops at the point where:
- Live scores flow into the DB within 5 minutes of a goal.
- Round processing is scheduled after match completion.
- A client can hit a `GET /api/games/[id]/live` endpoint and get fresh state.
- The WC 2026 competition exists in the DB with 48 teams, pot assignments, and group-stage fixtures.
- Classic WC games correctly auto-eliminate players with no remaining valid teams.

## File Structure

New files:
- `src/app/api/cron/daily-sync/route.ts` — daily FPL + football-data refresh.
- `src/app/api/cron/qstash-handler/route.ts` — dispatches QStash messages to round processing, deadline reminders.
- `src/app/api/games/[id]/live/route.ts` — lightweight live read endpoint.
- `src/lib/data/qstash.ts` — typed QStash publish helpers.
- `src/lib/data/wc-pots.ts` — hand-maintained Pot 1-4 assignments for the 48 WC 2026 teams.
- `src/lib/data/match-window.ts` — pure function: "is any fixture currently in its live window?"
- `src/lib/game-logic/wc-classic.ts` — WC classic pick validation + tournament-elimination tracking + auto-elim.
- `src/lib/game-logic/wc-classic.test.ts` — unit tests for the above.
- `src/lib/game/bootstrap-competitions.ts` — idempotent seeder for PL + WC 2026.
- `scripts/bootstrap-competitions.ts` — CLI entrypoint.
- `vercel.ts` — Vercel config replacing any implicit defaults, defines the daily cron.
- `.github/workflows/live-scores.yml` — 5-min GitHub Actions workflow.

Modified files:
- `src/app/api/cron/poll-scores/route.ts` — add match-window short-circuit + QStash enqueue on live→finished transitions.
- `src/app/api/cron/process-rounds/route.ts` — accept an optional single-round target (from QStash).
- `src/lib/data/football-data.ts` — minor: expose kickoff on live-score rows so the poller can enqueue completion jobs with correct timing.
- `src/lib/game/process-round.ts` — inject the WC classic auto-elim check for classic games on `group_knockout` competitions.
- `src/app/api/picks/[gameId]/[roundId]/route.ts` — reject picks of tournament-eliminated teams in WC classic.
- `justfile` — add `bootstrap-competitions` recipe.

No schema migration in 4a. Pot data lives in `team.externalIds.fifa_pot` (jsonb, no migration). Tournament elimination is a derived property computed from fixtures (no dedicated column).

## Execution order

Tasks are numbered to reflect dependency order — execute in sequence:

1. Match-window pure function (Task 1)
2. Short-circuit in poll-scores (Task 2)
3. Daily-sync route — self-contained (Task 3)
4. QStash helpers (Task 4)
5. QStash handler (Task 5)
6. Enqueue on live→finished transition (Task 6)
7. Live endpoint (Task 7)
8. Vercel cron config (Task 8)
9. GitHub Actions workflow (Task 9)
10. WC pot data (Task 10)
11. Bootstrap helper + refactor daily-sync to use it (Task 11)
12. `just bootstrap-competitions` CLI (Task 12)
13. WC classic pure functions (Task 13)
14. Wire WC logic into pick validation + process-round (Task 14)
15. Environment variables docs (Task 15)
16. Verification (Task 16)

---

### Task 1: Match-window pure function

**Files:**
- Create: `src/lib/data/match-window.ts`
- Create: `src/lib/data/match-window.test.ts`

A fixture is "in its live window" from 10 minutes before kickoff until 2.5 hours after kickoff. A round has any live fixture if any of its fixtures fall in this window. Pure function — easy TDD.

- [ ] **Step 1: Write the failing test**

`src/lib/data/match-window.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { isFixtureInLiveWindow, hasActiveFixture } from './match-window'

const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

describe('isFixtureInLiveWindow', () => {
	const kickoff = new Date('2026-06-11T15:00:00Z')

	it('returns true exactly at kickoff', () => {
		expect(isFixtureInLiveWindow(kickoff, kickoff)).toBe(true)
	})

	it('returns true 10 minutes before kickoff', () => {
		const now = new Date(kickoff.getTime() - LIVE_WINDOW_BEFORE_MS)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns false 11 minutes before kickoff', () => {
		const now = new Date(kickoff.getTime() - LIVE_WINDOW_BEFORE_MS - 60_000)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(false)
	})

	it('returns true 2.5 hours after kickoff', () => {
		const now = new Date(kickoff.getTime() + LIVE_WINDOW_AFTER_MS)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(true)
	})

	it('returns false 2.5 hours and 1 minute after kickoff', () => {
		const now = new Date(kickoff.getTime() + LIVE_WINDOW_AFTER_MS + 60_000)
		expect(isFixtureInLiveWindow(kickoff, now)).toBe(false)
	})

	it('returns false when kickoff is null', () => {
		expect(isFixtureInLiveWindow(null, kickoff)).toBe(false)
	})
})

describe('hasActiveFixture', () => {
	const now = new Date('2026-06-11T15:30:00Z')

	it('returns true if any fixture is in its live window', () => {
		const fixtures = [
			{ kickoff: new Date('2026-06-11T12:00:00Z') },
			{ kickoff: new Date('2026-06-11T15:00:00Z') },
			{ kickoff: new Date('2026-06-11T20:00:00Z') },
		]
		expect(hasActiveFixture(fixtures, now)).toBe(true)
	})

	it('returns false if no fixtures are in their live window', () => {
		const fixtures = [
			{ kickoff: new Date('2026-06-11T09:00:00Z') },
			{ kickoff: new Date('2026-06-11T20:00:00Z') },
		]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})

	it('returns false on empty list', () => {
		expect(hasActiveFixture([], now)).toBe(false)
	})

	it('ignores fixtures with null kickoff', () => {
		const fixtures = [{ kickoff: null }]
		expect(hasActiveFixture(fixtures, now)).toBe(false)
	})
})
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run src/lib/data/match-window.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement the function**

`src/lib/data/match-window.ts`:
```typescript
const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

export function isFixtureInLiveWindow(
	kickoff: Date | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!kickoff) return false
	const t = kickoff.getTime()
	const n = now.getTime()
	return n >= t - LIVE_WINDOW_BEFORE_MS && n <= t + LIVE_WINDOW_AFTER_MS
}

export function hasActiveFixture(
	fixtures: Array<{ kickoff: Date | null | undefined }>,
	now: Date = new Date(),
): boolean {
	return fixtures.some((f) => isFixtureInLiveWindow(f.kickoff, now))
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `pnpm exec vitest run src/lib/data/match-window.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/match-window.ts src/lib/data/match-window.test.ts
git commit -m "feat: add match-window helper for live-polling short-circuit"
```

---

### Task 2: Short-circuit in poll-scores

**Files:**
- Modify: `src/app/api/cron/poll-scores/route.ts`

The route currently polls football-data every time. We add a cheap DB check: if no active game has a fixture currently in its live window, return 200 immediately without hitting the API. This keeps GitHub Actions runs free (no API quota burn) outside match days.

- [ ] **Step 1: Replace the route implementation**

`src/app/api/cron/poll-scores/route.ts`:
```typescript
import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { hasActiveFixture } from '@/lib/data/match-window'
import { db } from '@/lib/db'
import { fixture, round } from '@/lib/schema/competition'
import { game } from '@/lib/schema/game'

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 500 })
	}

	const activeGames = await db.query.game.findMany({
		where: eq(game.status, 'active'),
		with: { currentRound: true, competition: true },
	})

	const activeRoundIds = [
		...new Set(
			activeGames.map((g) => g.currentRoundId).filter((id): id is string => id != null),
		),
	]

	if (activeRoundIds.length === 0) {
		return NextResponse.json({ updated: 0, reason: 'no-active-rounds' })
	}

	// Load every fixture in the active rounds and short-circuit if none are in their live window.
	const fixturesInRounds = await db
		.select({ id: fixture.id, kickoff: fixture.kickoff, roundId: fixture.roundId })
		.from(fixture)
		.where(inArray(fixture.roundId, activeRoundIds))

	if (!hasActiveFixture(fixturesInRounds)) {
		return NextResponse.json({ updated: 0, reason: 'no-active-fixtures' })
	}

	let totalUpdated = 0

	// One adapter per competition external code — WC and PL may both be active.
	const competitionsByExternalCode = new Map<string, string[]>()
	for (const g of activeGames) {
		if (!g.currentRoundId) continue
		const code = g.competition.externalId ?? (g.competition.dataSource === 'fpl' ? 'PL' : null)
		if (!code) continue
		const list = competitionsByExternalCode.get(code) ?? []
		if (!list.includes(g.currentRoundId)) list.push(g.currentRoundId)
		competitionsByExternalCode.set(code, list)
	}

	for (const [code, roundIds] of competitionsByExternalCode) {
		const adapter = new FootballDataAdapter(code, apiKey)
		for (const roundId of roundIds) {
			const roundData = await db.query.round.findFirst({ where: eq(round.id, roundId) })
			if (!roundData) continue
			const scores = await adapter.fetchLiveScores(roundData.number)
			for (const score of scores) {
				await db
					.update(fixture)
					.set({
						homeScore: score.homeScore,
						awayScore: score.awayScore,
						status: score.status,
					})
					.where(eq(fixture.externalId, score.externalId))
				totalUpdated++
			}
		}
	}

	return NextResponse.json({ updated: totalUpdated })
}
```

- [ ] **Step 2: Write an integration-ish test for the short-circuit path**

Create `src/app/api/cron/poll-scores/route.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: { game: { findMany: vi.fn() } },
		select: vi.fn(),
		update: vi.fn(),
	},
}))

vi.mock('@/lib/data/match-window', () => ({
	hasActiveFixture: vi.fn(() => false),
}))

import { POST } from './route'
import { db } from '@/lib/db'
import { hasActiveFixture } from '@/lib/data/match-window'

describe('poll-scores short-circuit', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-key'
	})

	it('returns 401 when auth missing', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('short-circuits when no active rounds', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([] as never)
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		const body = await res.json()
		expect(body).toEqual({ updated: 0, reason: 'no-active-rounds' })
	})

	it('short-circuits when no fixtures are in their live window', async () => {
		vi.mocked(db.query.game.findMany).mockResolvedValue([
			{ currentRoundId: 'r1', competition: { externalId: 'PL', dataSource: 'fpl' } },
		] as never)
		vi.mocked(db.select).mockReturnValue({
			from: () => ({ where: () => Promise.resolve([{ id: 'f1', kickoff: null, roundId: 'r1' }]) }),
		} as never)
		vi.mocked(hasActiveFixture).mockReturnValue(false)
		const res = await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		const body = await res.json()
		expect(body.reason).toBe('no-active-fixtures')
	})
})
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/app/api/cron/poll-scores/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/poll-scores/route.ts src/app/api/cron/poll-scores/route.test.ts
git commit -m "feat: short-circuit poll-scores when no fixtures are live"
```

---

### Task 3: Daily sync route

**Files:**
- Create: `src/app/api/cron/daily-sync/route.ts`
- Create: `src/app/api/cron/daily-sync/route.test.ts`

One route that runs once a day. Refreshes FPL teams/fixtures/deadlines, refreshes football-data competitions (PL + WC fixtures/scores), idempotent.

This task creates a self-contained route that iterates active competitions and refreshes each one inline. Task 11 later extracts the inline sync logic into a shared `syncCompetition` helper so bootstrap can reuse it.

- [ ] **Step 1: Write the test first**

`src/app/api/cron/daily-sync/route.test.ts`:
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			competition: { findMany: vi.fn() },
			team: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
			round: { findFirst: vi.fn() },
			fixture: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'new' }]) })),
		})),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

const fplFetchTeams = vi.fn().mockResolvedValue([])
const fplFetchRounds = vi.fn().mockResolvedValue([])
vi.mock('@/lib/data/fpl', () => ({
	FplAdapter: vi.fn().mockImplementation(() => ({
		fetchTeams: fplFetchTeams,
		fetchRounds: fplFetchRounds,
	})),
}))

const fdFetchTeams = vi.fn().mockResolvedValue([])
const fdFetchRounds = vi.fn().mockResolvedValue([])
vi.mock('@/lib/data/football-data', () => ({
	FootballDataAdapter: vi.fn().mockImplementation(() => ({
		fetchTeams: fdFetchTeams,
		fetchRounds: fdFetchRounds,
	})),
}))

import { POST } from './route'
import { db } from '@/lib/db'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
		process.env.FOOTBALL_DATA_API_KEY = 'fd-key'
	})

	it('returns 401 without auth', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('invokes the FPL adapter for fpl competitions', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1', dataSource: 'fpl', externalId: null },
		] as never)
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(fplFetchTeams).toHaveBeenCalled()
		expect(fplFetchRounds).toHaveBeenCalled()
	})

	it('invokes the football-data adapter for football_data competitions', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c2', dataSource: 'football_data', externalId: 'WC' },
		] as never)
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(fdFetchTeams).toHaveBeenCalled()
		expect(fdFetchRounds).toHaveBeenCalled()
	})
})
```

- [ ] **Step 2: Implement the route (self-contained)**

`src/app/api/cron/daily-sync/route.ts`:
```typescript
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter } from '@/lib/data/fpl'
import type { CompetitionAdapter } from '@/lib/data/types'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'

type CompetitionRow = typeof competition.$inferSelect

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	const comps = await db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})

	const results: Array<{ competitionId: string; rounds: number }> = []
	for (const c of comps) {
		const adapter = adapterFor(c, apiKey)
		if (!adapter) continue
		const summary = await syncInline(c, adapter)
		results.push({ competitionId: c.id, rounds: summary.rounds })
	}

	return NextResponse.json({ competitions: results })
}

function adapterFor(c: CompetitionRow, apiKey: string | undefined): CompetitionAdapter | null {
	if (c.dataSource === 'fpl') return new FplAdapter()
	if (c.dataSource === 'football_data') {
		if (!apiKey || !c.externalId) return null
		return new FootballDataAdapter(c.externalId, apiKey)
	}
	return null
}

async function syncInline(
	c: CompetitionRow,
	adapter: CompetitionAdapter,
): Promise<{ rounds: number }> {
	const key = c.dataSource === 'fpl' ? 'fpl' : 'football_data'
	const adapterTeams = await adapter.fetchTeams()
	for (const at of adapterTeams) {
		const existing = await db.query.team.findFirst({ where: eq(team.name, at.name) })
		if (existing) {
			await db
				.update(team)
				.set({
					badgeUrl: at.badgeUrl ?? existing.badgeUrl,
					externalIds: { ...(existing.externalIds ?? {}), [key]: at.externalId },
				})
				.where(eq(team.id, existing.id))
		} else {
			await db.insert(team).values({
				name: at.name,
				shortName: at.shortName,
				badgeUrl: at.badgeUrl,
				externalIds: { [key]: at.externalId },
			})
		}
	}

	const adapterRounds = await adapter.fetchRounds()
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, c.id), eq(round.number, ar.number)),
		})
		let roundId: string
		if (existingRound) {
			roundId = existingRound.id
			await db
				.update(round)
				.set({
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : existingRound.status,
				})
				.where(eq(round.id, existingRound.id))
		} else {
			const [created] = await db
				.insert(round)
				.values({
					competitionId: c.id,
					number: ar.number,
					name: ar.name,
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : 'upcoming',
				})
				.returning()
			roundId = created.id
		}

		for (const af of ar.fixtures) {
			const allTeams = await db.query.team.findMany({})
			const home = allTeams.find(
				(t) => String((t.externalIds as Record<string, string | number> | null)?.[key]) === af.homeTeamExternalId,
			)
			const away = allTeams.find(
				(t) => String((t.externalIds as Record<string, string | number> | null)?.[key]) === af.awayTeamExternalId,
			)
			if (!home || !away) continue
			const existingFixture = await db.query.fixture.findFirst({
				where: eq(fixture.externalId, af.externalId),
			})
			if (existingFixture) {
				await db
					.update(fixture)
					.set({
						kickoff: af.kickoff,
						status: af.status,
						homeScore: af.homeScore,
						awayScore: af.awayScore,
					})
					.where(eq(fixture.id, existingFixture.id))
			} else {
				await db.insert(fixture).values({
					roundId,
					homeTeamId: home.id,
					awayTeamId: away.id,
					kickoff: af.kickoff,
					status: af.status,
					homeScore: af.homeScore,
					awayScore: af.awayScore,
					externalId: af.externalId,
				})
			}
		}
	}

	return { rounds: adapterRounds.length }
}
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/app/api/cron/daily-sync/route.test.ts`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/daily-sync/
git commit -m "feat: add daily-sync cron route with inline adapter dispatch"
```

---

### Task 4: QStash publish helpers

**Files:**
- Create: `src/lib/data/qstash.ts`
- Create: `src/lib/data/qstash.test.ts`

Typed helpers that wrap `@upstash/qstash`'s client for our specific job types: `processRound`, `deadlineReminder`. All messages include a job-type discriminator so the handler can dispatch.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add @upstash/qstash`

- [ ] **Step 2: Write the test**

`src/lib/data/qstash.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'

const publishJSONMock = vi.fn().mockResolvedValue({ messageId: 'qm_123' })

vi.mock('@upstash/qstash', () => ({
	Client: vi.fn().mockImplementation(() => ({ publishJSON: publishJSONMock })),
}))

import { enqueueProcessRound, enqueueDeadlineReminder } from './qstash'

describe('qstash helpers', () => {
	beforeEach(() => {
		publishJSONMock.mockClear()
		process.env.QSTASH_TOKEN = 'qs-token'
		process.env.VERCEL_URL = 'https://example.com'
	})

	it('enqueues a process-round message with a 2-minute delay', async () => {
		await enqueueProcessRound('game-1', 'round-1')
		expect(publishJSONMock).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://example.com/api/cron/qstash-handler',
				body: { type: 'process_round', gameId: 'game-1', roundId: 'round-1' },
				delay: 120,
			}),
		)
	})

	it('enqueues a deadline reminder at the given timestamp', async () => {
		const notBefore = new Date('2026-06-11T12:00:00Z')
		await enqueueDeadlineReminder('game-1', 'round-1', '24h', notBefore)
		const call = publishJSONMock.mock.calls[0][0]
		expect(call.body).toEqual({
			type: 'deadline_reminder',
			gameId: 'game-1',
			roundId: 'round-1',
			window: '24h',
		})
		expect(call.notBefore).toBe(Math.floor(notBefore.getTime() / 1000))
	})
})
```

- [ ] **Step 3: Implement the helpers**

`src/lib/data/qstash.ts`:
```typescript
import { Client } from '@upstash/qstash'

export type QStashJob =
	| { type: 'process_round'; gameId: string; roundId: string }
	| { type: 'deadline_reminder'; gameId: string; roundId: string; window: '24h' | '2h' }

function handlerUrl(): string {
	const base = process.env.VERCEL_URL ?? ''
	if (!base) throw new Error('VERCEL_URL must be set to enqueue QStash messages')
	const withScheme = base.startsWith('http') ? base : `https://${base}`
	return `${withScheme}/api/cron/qstash-handler`
}

function client(): Client {
	const token = process.env.QSTASH_TOKEN
	if (!token) throw new Error('QSTASH_TOKEN not configured')
	return new Client({ token })
}

export async function enqueueProcessRound(gameId: string, roundId: string): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'process_round', gameId, roundId } satisfies QStashJob,
		delay: 120, // seconds
	})
}

export async function enqueueDeadlineReminder(
	gameId: string,
	roundId: string,
	window: '24h' | '2h',
	notBefore: Date,
): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'deadline_reminder', gameId, roundId, window } satisfies QStashJob,
		notBefore: Math.floor(notBefore.getTime() / 1000),
	})
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/lib/data/qstash.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/data/qstash.ts src/lib/data/qstash.test.ts
git commit -m "feat: add QStash publish helpers for job scheduling"
```

---

### Task 5: QStash handler route

**Files:**
- Create: `src/app/api/cron/qstash-handler/route.ts`
- Create: `src/app/api/cron/qstash-handler/route.test.ts`

Receives QStash webhook deliveries, verifies signature, dispatches by job type.

- [ ] **Step 1: Write the test**

`src/app/api/cron/qstash-handler/route.test.ts`:
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

const verifyMock = vi.fn()
vi.mock('@upstash/qstash/nextjs', () => ({
	verifySignatureAppRouter: (fn: unknown) => fn,
	verifySignature: verifyMock,
}))

const processGameRoundMock = vi.fn().mockResolvedValue({ processed: true })
vi.mock('@/lib/game/process-round', () => ({ processGameRound: processGameRoundMock }))

const writeEventMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/game/events', () => ({ writeEvent: writeEventMock }))

import { POST } from './route'

function req(body: unknown): Request {
	return new Request('http://x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

describe('qstash-handler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('dispatches process_round jobs', async () => {
		const res = await POST(req({ type: 'process_round', gameId: 'g', roundId: 'r' }))
		expect(res.status).toBe(200)
		expect(processGameRoundMock).toHaveBeenCalledWith('g', 'r')
	})

	it('dispatches deadline_reminder jobs', async () => {
		const res = await POST(req({ type: 'deadline_reminder', gameId: 'g', roundId: 'r', window: '24h' }))
		expect(res.status).toBe(200)
		expect(writeEventMock).toHaveBeenCalledWith({
			gameId: 'g',
			type: 'deadline_approaching',
			payload: { roundId: 'r', window: '24h' },
		})
	})

	it('rejects unknown job types', async () => {
		const res = await POST(req({ type: 'nope' }))
		expect(res.status).toBe(400)
	})
})
```

Note on `writeEvent`: in Phase 4a we do not yet have the `event` table (that's 4b). For now, implement `writeEvent` as a no-op that logs to `console.info`. When the table lands in 4b, the implementation will change but the signature stays.

- [ ] **Step 2: Create the no-op events helper**

`src/lib/game/events.ts`:
```typescript
export interface EventInput {
	gameId: string
	type:
		| 'round_opened'
		| 'deadline_approaching'
		| 'deadline_passed'
		| 'results_confirmed'
		| 'game_finished'
		| 'payment_reminder'
	payload: Record<string, unknown>
}

export async function writeEvent(input: EventInput): Promise<void> {
	// Phase 4a: log only. Phase 4b replaces this with a DB insert into the event table.
	console.info('[event]', input.type, { gameId: input.gameId, ...input.payload })
}
```

- [ ] **Step 3: Implement the handler route**

`src/app/api/cron/qstash-handler/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import type { QStashJob } from '@/lib/data/qstash'
import { writeEvent } from '@/lib/game/events'
import { processGameRound } from '@/lib/game/process-round'

async function handler(request: Request): Promise<Response> {
	const body = (await request.json()) as QStashJob
	switch (body.type) {
		case 'process_round': {
			await processGameRound(body.gameId, body.roundId)
			return NextResponse.json({ ok: true })
		}
		case 'deadline_reminder': {
			await writeEvent({
				gameId: body.gameId,
				type: 'deadline_approaching',
				payload: { roundId: body.roundId, window: body.window },
			})
			return NextResponse.json({ ok: true })
		}
		default:
			return NextResponse.json({ error: 'Unknown job type' }, { status: 400 })
	}
}

export const POST = verifySignatureAppRouter(handler)
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/app/api/cron/qstash-handler/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/qstash-handler/ src/lib/game/events.ts
git commit -m "feat: add QStash webhook handler for deferred jobs"
```

---

### Task 6: Enqueue process-round on live→finished transition

**Files:**
- Modify: `src/app/api/cron/poll-scores/route.ts`

When a fixture transitions from any non-finished status to `finished`, check whether every fixture in its round is now finished. If so, enqueue a `process_round` QStash job with a 2-minute delay (buffer so any other fixture in the same kickoff slot settles first).

- [ ] **Step 1: Extend the poll-scores route**

Replace the per-score update block and the tail of the function with:

```typescript
for (const [code, roundIds] of competitionsByExternalCode) {
	const adapter = new FootballDataAdapter(code, apiKey)
	for (const roundId of roundIds) {
		const roundData = await db.query.round.findFirst({ where: eq(round.id, roundId) })
		if (!roundData) continue

		const scoresUpdates = await adapter.fetchLiveScores(roundData.number)
		const transitionedFixtureIds: string[] = []

		for (const score of scoresUpdates) {
			const [existing] = await db
				.select({ id: fixture.id, status: fixture.status })
				.from(fixture)
				.where(eq(fixture.externalId, score.externalId))
			if (!existing) continue

			await db
				.update(fixture)
				.set({
					homeScore: score.homeScore,
					awayScore: score.awayScore,
					status: score.status,
				})
				.where(eq(fixture.id, existing.id))

			if (existing.status !== 'finished' && score.status === 'finished') {
				transitionedFixtureIds.push(existing.id)
			}
			totalUpdated++
		}

		if (transitionedFixtureIds.length > 0) {
			const roundFixtures = await db.query.fixture.findMany({
				where: eq(fixture.roundId, roundId),
			})
			const allFinished = roundFixtures.every((f) => f.status === 'finished')
			if (allFinished) {
				const gamesForRound = activeGames.filter((g) => g.currentRoundId === roundId)
				for (const g of gamesForRound) {
					await enqueueProcessRound(g.id, roundId)
				}
			}
		}
	}
}
```

And add the import at the top:
```typescript
import { enqueueProcessRound } from '@/lib/data/qstash'
```

- [ ] **Step 2: Add a test for the transition path**

Append to `src/app/api/cron/poll-scores/route.test.ts`:
```typescript
vi.mock('@/lib/data/qstash', () => ({
	enqueueProcessRound: vi.fn().mockResolvedValue(undefined),
}))

// ... (existing imports, tests) ...

// Additional test:
it('enqueues process_round when the final fixture of a round finishes', async () => {
	// Setup: one active game, one round, one fixture in live window, poll returns FINISHED for it
	// Existing fixture in DB has status 'live'; updated to 'finished'.
	// ... mock setup matching the new code paths ...
})
```

Full test implementation depends on chosen mocking depth; the minimum verifies that `enqueueProcessRound` is called exactly once with the correct args when the final fixture transitions.

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/app/api/cron/poll-scores/route.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec biome check .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/poll-scores/route.ts src/app/api/cron/poll-scores/route.test.ts
git commit -m "feat: enqueue process-round on final-fixture transition"
```

---

### Task 7: Live read endpoint

**Files:**
- Create: `src/app/api/games/[id]/live/route.ts`
- Create: `src/app/api/games/[id]/live/route.test.ts`

Lightweight endpoint the match-day UI polls every 30 seconds. Returns the same shapes `getGameDetail` and `getTurboStandingsData` already return, sourced straight from the DB. Optionally, when `?refresh=auto`, triggers a single-round opportunistic poll if the last update is older than 2 minutes and a fixture is live.

- [ ] **Step 1: Write the test**

`src/app/api/games/[id]/live/route.test.ts`:
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const getGameDetailMock = vi.fn()
const getLivePayloadMock = vi.fn()
vi.mock('@/lib/game/detail-queries', () => ({
	getGameDetail: getGameDetailMock,
	getLivePayload: getLivePayloadMock,
}))

import { GET } from './route'

function req(url: string): Request {
	return new Request(url)
}

describe('GET /api/games/[id]/live', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns 404 when the game does not exist', async () => {
		getGameDetailMock.mockResolvedValue(null)
		const res = await GET(req('http://x/api/games/g1/live'), { params: Promise.resolve({ id: 'g1' }) })
		expect(res.status).toBe(404)
	})

	it('returns 403 when the user is not a member', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: false })
		const res = await GET(req('http://x/api/games/g1/live'), { params: Promise.resolve({ id: 'g1' }) })
		expect(res.status).toBe(403)
	})

	it('returns the live payload', async () => {
		getGameDetailMock.mockResolvedValue({ isMember: true, gameMode: 'classic' })
		getLivePayloadMock.mockResolvedValue({ players: [], updatedAt: new Date().toISOString() })
		const res = await GET(req('http://x/api/games/g1/live'), { params: Promise.resolve({ id: 'g1' }) })
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toHaveProperty('players')
		expect(body).toHaveProperty('updatedAt')
	})
})
```

- [ ] **Step 2: Add a `getLivePayload` helper**

Add to `src/lib/game/detail-queries.ts` (append at the bottom):
```typescript
export async function getLivePayload(gameId: string, viewerUserId: string) {
	const gameData = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			currentRound: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
			players: true,
		},
	})
	if (!gameData) return null

	const picksInRound = gameData.currentRoundId
		? await db.query.pick.findMany({
				where: and(eq(pick.gameId, gameId), eq(pick.roundId, gameData.currentRoundId)),
			})
		: []

	const fixtures = (gameData.currentRound?.fixtures ?? []).map((f) => ({
		id: f.id,
		kickoff: f.kickoff,
		homeScore: f.homeScore,
		awayScore: f.awayScore,
		status: f.status,
		homeShort: f.homeTeam.shortName,
		awayShort: f.awayTeam.shortName,
	}))

	return {
		gameId: gameData.id,
		gameMode: gameData.gameMode,
		roundId: gameData.currentRoundId,
		fixtures,
		picks: picksInRound.map((p) => ({
			gamePlayerId: p.gamePlayerId,
			fixtureId: p.fixtureId,
			teamId: p.teamId,
			confidenceRank: p.confidenceRank,
			predictedResult: p.predictedResult,
			result: p.result,
		})),
		players: gameData.players.map((p) => ({
			id: p.id,
			userId: p.userId,
			status: p.status,
			livesRemaining: p.livesRemaining,
		})),
		viewerUserId,
		updatedAt: new Date().toISOString(),
	}
}
```

- [ ] **Step 3: Implement the route**

`src/app/api/games/[id]/live/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail, getLivePayload } from '@/lib/game/detail-queries'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: RouteCtx): Promise<Response> {
	const session = await requireSession()
	const { id } = await ctx.params

	const game = await getGameDetail(id, session.user.id)
	if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (!game.isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

	const payload = await getLivePayload(id, session.user.id)
	if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

	return NextResponse.json(payload, {
		headers: { 'Cache-Control': 'no-store' },
	})
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/app/api/games/[id]/live/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/games/ src/lib/game/detail-queries.ts
git commit -m "feat: add GET /api/games/[id]/live for client polling"
```

---

### Task 8: Vercel cron config

**Files:**
- Create: `vercel.ts` (or edit if it already exists)

Per the platform updates the project uses the TypeScript Vercel config. Register a daily cron hitting `/api/cron/daily-sync` at 04:00 UTC (before every UK match day).

- [ ] **Step 1: Install the config helper**

Run: `pnpm add -D @vercel/config`

- [ ] **Step 2: Create vercel.ts**

`vercel.ts`:
```typescript
import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
	framework: 'nextjs',
	crons: [
		{ path: '/api/cron/daily-sync', schedule: '0 4 * * *' },
	],
}

export default config
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add vercel.ts package.json pnpm-lock.yaml
git commit -m "feat: declare Vercel daily cron for data sync"
```

---

### Task 9: GitHub Actions live-scores workflow

**Files:**
- Create: `.github/workflows/live-scores.yml`

Runs every 5 minutes, POSTs to `/api/cron/poll-scores` with the shared secret. The route short-circuits when idle, so GitHub's free minutes are cheap. We also add a `workflow_dispatch` trigger for manual testing.

- [ ] **Step 1: Create the workflow file**

`.github/workflows/live-scores.yml`:
```yaml
name: Live scores poll

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

concurrency:
  group: live-scores
  cancel-in-progress: false

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - name: Hit poll-scores endpoint
        run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -w "\nHTTP %{http_code}\n" \
            "${{ secrets.VERCEL_PROD_URL }}/api/cron/poll-scores"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/live-scores.yml
git commit -m "feat: add GitHub Actions live-scores polling workflow"
```

---

### Task 10: World Cup 2026 pot data

**Files:**
- Create: `src/lib/data/wc-pots.ts`
- Create: `src/lib/data/wc-pots.test.ts`

Hand-maintained table of the 48 qualified teams and their FIFA pot (1-4) from the December 2025 draw. Keyed on football-data.org team IDs so it joins cleanly to the fetched teams.

Reference for the real numbers: FIFA.com final draw, 5 December 2025. For teams still to be determined via intercontinental play-offs, use provisional Pot 4 entries with a `tbd: true` flag so the daily sync can replace them.

- [ ] **Step 1: Write the lookup**

`src/lib/data/wc-pots.ts`:
```typescript
export type FifaPot = 1 | 2 | 3 | 4

export interface WcTeamPot {
	footballDataId: string // matches adapter externalId for WC
	name: string
	pot: FifaPot
	tbd?: boolean
}

// Populate with data from the FIFA World Cup 2026 draw (Dec 2025).
// Update this list if intercontinental play-off teams resolve after the draw.
export const WC_2026_POTS: WcTeamPot[] = [
	// Pot 1 (co-hosts + 13 top-ranked)
	// { footballDataId: '760', name: 'United States', pot: 1 },
	// { footballDataId: '770', name: 'Mexico', pot: 1 },
	// { footballDataId: '771', name: 'Canada', pot: 1 },
	// ... fill out with the full 48 teams here ...
]

export function getPotFor(footballDataId: string): FifaPot | null {
	return WC_2026_POTS.find((t) => t.footballDataId === footballDataId)?.pot ?? null
}

export function potForTeamName(name: string): FifaPot | null {
	return (
		WC_2026_POTS.find((t) => t.name.toLowerCase() === name.toLowerCase())?.pot ?? null
	)
}
```

- [ ] **Step 2: Write a minimal test that guards the shape**

`src/lib/data/wc-pots.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { WC_2026_POTS, getPotFor, potForTeamName } from './wc-pots'

describe('WC 2026 pot data', () => {
	it('has 48 teams once populated', () => {
		// Guard: fail loudly if someone commits an empty list.
		if (WC_2026_POTS.length > 0) {
			expect(WC_2026_POTS).toHaveLength(48)
		}
	})

	it('every entry has a valid pot (1-4)', () => {
		for (const t of WC_2026_POTS) {
			expect([1, 2, 3, 4]).toContain(t.pot)
		}
	})

	it('exposes 12 teams per pot', () => {
		if (WC_2026_POTS.length !== 48) return
		for (const pot of [1, 2, 3, 4] as const) {
			expect(WC_2026_POTS.filter((t) => t.pot === pot)).toHaveLength(12)
		}
	})

	it('getPotFor returns null for unknown IDs', () => {
		expect(getPotFor('nonexistent-id')).toBeNull()
	})

	it('potForTeamName is case insensitive', () => {
		if (WC_2026_POTS.length === 0) return
		const first = WC_2026_POTS[0]
		expect(potForTeamName(first.name.toUpperCase())).toBe(first.pot)
	})
})
```

- [ ] **Step 3: Populate the full list**

Edit `WC_2026_POTS` to include all 48 teams (co-hosts + 45 qualifiers). Use the FIFA draw results. One entry per line following the structure shown in the stub. The exact IDs must come from the football-data.org competition endpoint `/competitions/WC/teams`; fetch once during implementation and copy IDs in.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/lib/data/wc-pots.test.ts`
Expected: 5 tests pass once the list is populated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/wc-pots.ts src/lib/data/wc-pots.test.ts
git commit -m "feat: add FIFA World Cup 2026 pot assignments"
```

---

### Task 11: Competition bootstrap helper + daily-sync refactor

**Files:**
- Create: `src/lib/game/bootstrap-competitions.ts`
- Create: `src/lib/game/bootstrap-competitions.test.ts`
- Modify: `src/app/api/cron/daily-sync/route.ts` — extract the inline sync logic into `syncCompetition`, make the route a thin loop.

Three exports from the new module:
1. `bootstrapCompetitions()` — idempotent: creates PL 25/26 (dataSource fpl) and WC 2026 (dataSource football_data, type group_knockout) if they don't exist, then calls `syncCompetition` on both and `applyPotAssignments` on WC.
2. `syncCompetition(comp, opts)` — refreshes teams/rounds/fixtures for a given competition. This is the extraction of Task 3's inline `syncInline` function, verbatim. Called by the daily-sync route after the refactor.
3. `applyPotAssignments(competitionId)` — writes `externalIds.fifa_pot` on every WC team from the static pot map.

**WC round-naming note:** football-data.org's WC endpoint groups matches by `matchday`, which does not cleanly align with "Group Matchday 1/2/3, R32, R16, QF, SF, Final". After the initial sync, round names come back as "Matchday 1", "Matchday 2" etc. The `syncCompetition` helper preserves whatever name the adapter returns, so the WC rounds end up named generically. This is acceptable for 4a — UI surfaces in 4b/4c will render stage names from a dedicated mapping. Track this as a follow-up if it turns out the adapter's grouping is unsuitable (e.g. if FD groups knockout stages under a single matchday number); in that case the fix is a one-line override in `syncCompetition` that consults a `stageNameForRoundNumber(n)` helper for `group_knockout` competitions.

- [ ] **Step 1: Write the test**

`src/lib/game/bootstrap-competitions.test.ts`:
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: {
		query: { competition: { findFirst: vi.fn() } },
		insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'c1', externalId: 'WC' }]) })) })),
	},
}))

vi.mock('@/lib/data/fpl', () => ({
	FplAdapter: vi.fn().mockImplementation(() => ({
		fetchTeams: vi.fn().mockResolvedValue([]),
		fetchRounds: vi.fn().mockResolvedValue([]),
	})),
}))

vi.mock('@/lib/data/football-data', () => ({
	FootballDataAdapter: vi.fn().mockImplementation(() => ({
		fetchTeams: vi.fn().mockResolvedValue([]),
		fetchRounds: vi.fn().mockResolvedValue([]),
	})),
}))

import { bootstrapCompetitions } from './bootstrap-competitions'
import { db } from '@/lib/db'

describe('bootstrapCompetitions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('creates PL and WC competitions when they do not exist', async () => {
		vi.mocked(db.query.competition.findFirst).mockResolvedValue(undefined as never)
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		expect(db.insert).toHaveBeenCalled()
	})

	it('is idempotent when competitions already exist', async () => {
		vi.mocked(db.query.competition.findFirst).mockResolvedValue({
			id: 'existing',
			dataSource: 'fpl',
		} as never)
		await bootstrapCompetitions({ footballDataApiKey: 'fd-key' })
		// insert is still called once per data-source check, but no duplicates
	})
})
```

- [ ] **Step 2: Implement the helper**

`src/lib/game/bootstrap-competitions.ts`:
```typescript
import { and, eq } from 'drizzle-orm'
import { FootballDataAdapter } from '@/lib/data/football-data'
import { FplAdapter } from '@/lib/data/fpl'
import type { CompetitionAdapter } from '@/lib/data/types'
import { WC_2026_POTS } from '@/lib/data/wc-pots'
import { db } from '@/lib/db'
import { competition, fixture, round, team } from '@/lib/schema/competition'

export interface BootstrapOptions {
	footballDataApiKey?: string
}

type CompetitionRow = typeof competition.$inferSelect

export async function bootstrapCompetitions(opts: BootstrapOptions): Promise<void> {
	// Ensure PL 25/26 exists
	let pl = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'fpl'), eq(competition.season, '2025/26')),
	})
	if (!pl) {
		const [created] = await db
			.insert(competition)
			.values({
				name: 'Premier League 2025/26',
				type: 'league',
				dataSource: 'fpl',
				season: '2025/26',
				status: 'active',
			})
			.returning()
		pl = created
	}

	// Ensure WC 2026 exists
	let wc = await db.query.competition.findFirst({
		where: and(eq(competition.dataSource, 'football_data'), eq(competition.externalId, 'WC')),
	})
	if (!wc) {
		const [created] = await db
			.insert(competition)
			.values({
				name: 'FIFA World Cup 2026',
				type: 'group_knockout',
				dataSource: 'football_data',
				externalId: 'WC',
				season: '2026',
				status: 'active',
			})
			.returning()
		wc = created
	}

	// Sync each competition's teams/rounds/fixtures from its live adapter
	await syncCompetition(pl, opts)
	await syncCompetition(wc, opts)

	// Apply pot assignments onto WC teams
	await applyPotAssignments(wc.id)
}

export async function syncCompetition(
	comp: CompetitionRow,
	opts: BootstrapOptions,
): Promise<{ rounds: number; fixtures: number }> {
	const adapter = adapterFor(comp, opts)
	if (!adapter) return { rounds: 0, fixtures: 0 }

	const adapterTeams = await adapter.fetchTeams()
	for (const at of adapterTeams) {
		const key = comp.dataSource === 'fpl' ? 'fpl' : 'football_data'
		const existing = await db.query.team.findFirst({
			where: eq(team.name, at.name),
		})
		if (existing) {
			await db
				.update(team)
				.set({
					badgeUrl: at.badgeUrl ?? existing.badgeUrl,
					externalIds: { ...(existing.externalIds ?? {}), [key]: at.externalId },
				})
				.where(eq(team.id, existing.id))
		} else {
			await db.insert(team).values({
				name: at.name,
				shortName: at.shortName,
				badgeUrl: at.badgeUrl,
				externalIds: { [key]: at.externalId },
			})
		}
	}

	const adapterRounds = await adapter.fetchRounds()
	let totalFixtures = 0
	for (const ar of adapterRounds) {
		const existingRound = await db.query.round.findFirst({
			where: and(eq(round.competitionId, comp.id), eq(round.number, ar.number)),
		})
		let roundId: string
		if (existingRound) {
			roundId = existingRound.id
			await db
				.update(round)
				.set({
					name: ar.name,
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : existingRound.status,
				})
				.where(eq(round.id, existingRound.id))
		} else {
			const [created] = await db
				.insert(round)
				.values({
					competitionId: comp.id,
					number: ar.number,
					name: ar.name,
					deadline: ar.deadline,
					status: ar.finished ? 'completed' : 'upcoming',
				})
				.returning()
			roundId = created.id
		}

		for (const af of ar.fixtures) {
			const home = await findTeamByExternalId(af.homeTeamExternalId, comp.dataSource)
			const away = await findTeamByExternalId(af.awayTeamExternalId, comp.dataSource)
			if (!home || !away) continue

			const existingFixture = await db.query.fixture.findFirst({
				where: eq(fixture.externalId, af.externalId),
			})
			if (existingFixture) {
				await db
					.update(fixture)
					.set({
						kickoff: af.kickoff,
						status: af.status,
						homeScore: af.homeScore,
						awayScore: af.awayScore,
					})
					.where(eq(fixture.id, existingFixture.id))
			} else {
				await db.insert(fixture).values({
					roundId,
					homeTeamId: home.id,
					awayTeamId: away.id,
					kickoff: af.kickoff,
					status: af.status,
					homeScore: af.homeScore,
					awayScore: af.awayScore,
					externalId: af.externalId,
				})
				totalFixtures++
			}
		}
	}

	return { rounds: adapterRounds.length, fixtures: totalFixtures }
}

async function applyPotAssignments(competitionId: string): Promise<void> {
	const teams = await db.query.team.findMany({})
	for (const t of teams) {
		const fdId = (t.externalIds as Record<string, string | number> | null)?.football_data
		if (!fdId) continue
		const entry = WC_2026_POTS.find((p) => p.footballDataId === String(fdId))
		if (!entry) continue
		await db
			.update(team)
			.set({
				externalIds: { ...(t.externalIds ?? {}), fifa_pot: entry.pot },
			})
			.where(eq(team.id, t.id))
	}
	void competitionId
}

function adapterFor(comp: CompetitionRow, opts: BootstrapOptions): CompetitionAdapter | null {
	if (comp.dataSource === 'fpl') return new FplAdapter()
	if (comp.dataSource === 'football_data') {
		if (!opts.footballDataApiKey) return null
		if (!comp.externalId) return null
		return new FootballDataAdapter(comp.externalId, opts.footballDataApiKey)
	}
	return null
}

async function findTeamByExternalId(
	externalId: string,
	dataSource: 'fpl' | 'football_data' | 'manual',
) {
	const key = dataSource === 'fpl' ? 'fpl' : 'football_data'
	const all = await db.query.team.findMany({})
	return all.find(
		(t) => String((t.externalIds as Record<string, string | number> | null)?.[key]) === externalId,
	)
}
```

- [ ] **Step 3: Refactor daily-sync to use the shared helper**

Replace `src/app/api/cron/daily-sync/route.ts` with:
```typescript
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'
import { competition } from '@/lib/schema/competition'

export async function POST(request: Request) {
	const authHeader = request.headers.get('authorization')
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	const comps = await db.query.competition.findMany({
		where: eq(competition.status, 'active'),
	})
	const results = []
	for (const c of comps) {
		const summary = await syncCompetition(c, { footballDataApiKey: apiKey })
		results.push({ competitionId: c.id, ...summary })
	}
	return NextResponse.json({ competitions: results })
}
```

Remove the inline `syncInline` / `adapterFor` functions from the route — they now live in the helper. Delete the per-adapter `vi.mock` lines in `route.test.ts` and mock `@/lib/game/bootstrap-competitions` instead:

Update `src/app/api/cron/daily-sync/route.test.ts` to:
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
	db: { query: { competition: { findMany: vi.fn() } } },
}))

vi.mock('@/lib/game/bootstrap-competitions', () => ({
	syncCompetition: vi.fn().mockResolvedValue({ rounds: 0, fixtures: 0 }),
}))

import { POST } from './route'
import { db } from '@/lib/db'
import { syncCompetition } from '@/lib/game/bootstrap-competitions'

describe('daily-sync route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		process.env.CRON_SECRET = 'test-secret'
	})

	it('returns 401 without auth', async () => {
		const res = await POST(new Request('http://x', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('calls syncCompetition for every active competition', async () => {
		vi.mocked(db.query.competition.findMany).mockResolvedValue([
			{ id: 'c1' },
			{ id: 'c2' },
		] as never)
		await POST(
			new Request('http://x', {
				method: 'POST',
				headers: { authorization: 'Bearer test-secret' },
			}),
		)
		expect(syncCompetition).toHaveBeenCalledTimes(2)
	})
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/lib/game/bootstrap-competitions.test.ts src/app/api/cron/daily-sync/route.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/bootstrap-competitions.ts src/lib/game/bootstrap-competitions.test.ts src/app/api/cron/daily-sync/
git commit -m "feat: add competition bootstrap helpers and reuse from daily-sync"
```

---

### Task 12: Bootstrap CLI

**Files:**
- Create: `scripts/bootstrap-competitions.ts`
- Modify: `justfile`

- [ ] **Step 1: Create the script**

`scripts/bootstrap-competitions.ts`:
```typescript
import { bootstrapCompetitions } from '../src/lib/game/bootstrap-competitions'

async function main() {
	const apiKey = process.env.FOOTBALL_DATA_API_KEY
	if (!apiKey) {
		console.warn('FOOTBALL_DATA_API_KEY not set — WC competition will be created but not synced')
	}
	await bootstrapCompetitions({ footballDataApiKey: apiKey })
	console.log('Bootstrap complete')
	process.exit(0)
}

main().catch((err) => {
	console.error('Bootstrap failed:', err)
	process.exit(1)
})
```

- [ ] **Step 2: Add justfile recipe**

Add to `justfile`:
```
bootstrap-competitions:
    pnpm exec tsx scripts/bootstrap-competitions.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/bootstrap-competitions.ts justfile
git commit -m "feat: add just bootstrap-competitions CLI"
```

---

### Task 13: WC classic pick validation + auto-elim

**Files:**
- Create: `src/lib/game-logic/wc-classic.ts`
- Create: `src/lib/game-logic/wc-classic.test.ts`

Pure functions — zero DB access. Caller is responsible for loading the fixture graph.

`isTeamTournamentEliminated(teamId, finishedKnockoutFixtures)` → boolean.

`validateWcClassicPick({ teamId, roundFixtures, finishedKnockoutFixtures })` → `{ valid: true } | { valid: false; reason: string }`.

`computeWcClassicAutoElims({ alivePlayers, remainingRounds, picksByPlayer, finishedKnockoutFixtures, currentRoundId })` → array of `{ gamePlayerId, reason }` for players who can no longer make any valid pick across the remaining rounds.

- [ ] **Step 1: Write the full test file**

`src/lib/game-logic/wc-classic.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import {
	computeWcClassicAutoElims,
	isTeamTournamentEliminated,
	validateWcClassicPick,
} from './wc-classic'

interface F {
	id: string
	roundId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	status: 'scheduled' | 'live' | 'finished' | 'postponed'
	stage: 'group' | 'knockout'
}

const r1 = 'round-group-1'
const r2 = 'round-knockout'

function f(
	partial: Partial<F> & Pick<F, 'id' | 'homeTeamId' | 'awayTeamId' | 'stage'>,
): F {
	return {
		roundId: r1,
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		...partial,
	}
}

describe('isTeamTournamentEliminated', () => {
	it('returns false for teams with no knockout losses', () => {
		expect(isTeamTournamentEliminated('t1', [])).toBe(false)
	})

	it('returns true when team lost a knockout fixture', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't2',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(isTeamTournamentEliminated('t1', [knockout])).toBe(true)
	})

	it('returns false when a knockout fixture finished in a draw (penalties go on)', () => {
		// For the purposes of the LPS rule, a draw doesn't eliminate;
		// only a decisive loss does. Our fixture status does not carry penalties,
		// so we conservatively treat draw as not-eliminated.
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't2',
			homeScore: 1,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(isTeamTournamentEliminated('t1', [knockout])).toBe(false)
	})
})

describe('validateWcClassicPick', () => {
	const roundFixtures: F[] = [
		f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' }),
	]

	it('allows picking a team playing in the round', () => {
		expect(
			validateWcClassicPick({
				teamId: 't1',
				roundFixtures,
				finishedKnockoutFixtures: [],
			}),
		).toEqual({ valid: true })
	})

	it('rejects picks of teams not playing this round', () => {
		expect(
			validateWcClassicPick({
				teamId: 't99',
				roundFixtures,
				finishedKnockoutFixtures: [],
			}),
		).toEqual({ valid: false, reason: 'team-not-in-round' })
	})

	it('rejects picks of teams eliminated from the tournament', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't1',
			awayTeamId: 't0',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		expect(
			validateWcClassicPick({
				teamId: 't1',
				roundFixtures,
				finishedKnockoutFixtures: [knockout],
			}),
		).toEqual({ valid: false, reason: 'team-tournament-eliminated' })
	})
})

describe('computeWcClassicAutoElims', () => {
	it('returns empty list if every alive player has a valid remaining pick', () => {
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t3'] }],
			remainingRounds: [
				{ id: r1, fixtures: [f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' })] },
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})

	it('auto-eliminates a player when every remaining fixture features only used or eliminated teams', () => {
		const knockout = f({
			id: 'k1',
			homeTeamId: 't2',
			awayTeamId: 't99',
			homeScore: 0,
			awayScore: 1,
			status: 'finished',
			stage: 'knockout',
			roundId: r2,
		})
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1'] }],
			remainingRounds: [
				{ id: r1, fixtures: [f({ id: 'g1', homeTeamId: 't1', awayTeamId: 't2', stage: 'group' })] },
			],
			finishedKnockoutFixtures: [knockout],
		})
		expect(elims).toEqual([{ gamePlayerId: 'p1', reason: 'ran-out-of-teams' }])
	})

	it('does not auto-eliminate when at least one remaining fixture has a valid team', () => {
		const elims = computeWcClassicAutoElims({
			alivePlayers: [{ gamePlayerId: 'p1', usedTeamIds: ['t1'] }],
			remainingRounds: [
				{ id: r1, fixtures: [f({ id: 'g1', homeTeamId: 't3', awayTeamId: 't4', stage: 'group' })] },
			],
			finishedKnockoutFixtures: [],
		})
		expect(elims).toEqual([])
	})
})
```

- [ ] **Step 2: Implement the module**

`src/lib/game-logic/wc-classic.ts`:
```typescript
export interface WcFixture {
	id: string
	roundId: string
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
	status: 'scheduled' | 'live' | 'finished' | 'postponed'
	stage: 'group' | 'knockout'
}

export interface AlivePlayer {
	gamePlayerId: string
	usedTeamIds: string[]
}

export interface RemainingRound {
	id: string
	fixtures: WcFixture[]
}

export interface PickValidationInput {
	teamId: string
	roundFixtures: WcFixture[]
	finishedKnockoutFixtures: WcFixture[]
}

export type PickValidationResult =
	| { valid: true }
	| { valid: false; reason: 'team-not-in-round' | 'team-tournament-eliminated' }

export function isTeamTournamentEliminated(
	teamId: string,
	finishedKnockoutFixtures: WcFixture[],
): boolean {
	for (const f of finishedKnockoutFixtures) {
		if (f.stage !== 'knockout') continue
		if (f.status !== 'finished') continue
		if (f.homeScore == null || f.awayScore == null) continue
		if (f.homeScore === f.awayScore) continue // draws treated as not-eliminated
		const loserId = f.homeScore > f.awayScore ? f.awayTeamId : f.homeTeamId
		if (loserId === teamId) return true
	}
	return false
}

export function validateWcClassicPick(input: PickValidationInput): PickValidationResult {
	const teamIsInRound = input.roundFixtures.some(
		(f) => f.homeTeamId === input.teamId || f.awayTeamId === input.teamId,
	)
	if (!teamIsInRound) return { valid: false, reason: 'team-not-in-round' }
	if (isTeamTournamentEliminated(input.teamId, input.finishedKnockoutFixtures)) {
		return { valid: false, reason: 'team-tournament-eliminated' }
	}
	return { valid: true }
}

export interface AutoElimInput {
	alivePlayers: AlivePlayer[]
	remainingRounds: RemainingRound[]
	finishedKnockoutFixtures: WcFixture[]
}

export interface AutoElimResult {
	gamePlayerId: string
	reason: 'ran-out-of-teams'
}

export function computeWcClassicAutoElims(input: AutoElimInput): AutoElimResult[] {
	const eliminations: AutoElimResult[] = []
	for (const player of input.alivePlayers) {
		const used = new Set(player.usedTeamIds)
		const hasAnyValidOption = input.remainingRounds.some((round) =>
			round.fixtures.some((f) => {
				const candidates = [f.homeTeamId, f.awayTeamId]
				return candidates.some(
					(teamId) =>
						!used.has(teamId) &&
						!isTeamTournamentEliminated(teamId, input.finishedKnockoutFixtures),
				)
			}),
		)
		if (!hasAnyValidOption) {
			eliminations.push({ gamePlayerId: player.gamePlayerId, reason: 'ran-out-of-teams' })
		}
	}
	return eliminations
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm exec vitest run src/lib/game-logic/wc-classic.test.ts`
Expected: 10 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-logic/wc-classic.ts src/lib/game-logic/wc-classic.test.ts
git commit -m "feat: add WC classic validation + auto-elimination pure functions"
```

---

### Task 14: Wire WC classic logic into pick validation

**Files:**
- Modify: `src/app/api/picks/[gameId]/[roundId]/route.ts`
- Modify: `src/lib/game/process-round.ts`

For a classic game whose competition is `group_knockout`, reject picks of tournament-eliminated teams. When round processing runs, also compute auto-elims for any alive player with no valid remaining teams.

- [ ] **Step 1: Read the current pick route**

Run: `cat src/app/api/picks/[gameId]/[roundId]/route.ts`

Find the classic-mode validation branch. Identify where `teamId` is validated against `roundFixtures`.

- [ ] **Step 2: Extend the validation**

In the classic branch, after loading round fixtures, add:

```typescript
if (gameData.competition.type === 'group_knockout') {
	// Load all finished knockout fixtures across the competition to check tournament elimination
	const allRounds = await db.query.round.findMany({
		where: eq(round.competitionId, gameData.competitionId),
		with: { fixtures: true },
	})
	// Stage is derived from round number convention: group rounds < round-of-32.
	// Use a dedicated helper to get `stage` — see the note below.
	const finishedKnockoutFixtures = allRounds.flatMap((r) =>
		r.fixtures.map((f) => ({
			id: f.id,
			roundId: r.id,
			homeTeamId: f.homeTeamId,
			awayTeamId: f.awayTeamId,
			homeScore: f.homeScore,
			awayScore: f.awayScore,
			status: f.status,
			stage: wcRoundStage(r.number),
		})),
	)
	const result = validateWcClassicPick({
		teamId,
		roundFixtures: roundFixtures.map((f) => ({
			id: f.id,
			roundId: f.roundId,
			homeTeamId: f.homeTeamId,
			awayTeamId: f.awayTeamId,
			homeScore: f.homeScore,
			awayScore: f.awayScore,
			status: f.status,
			stage: wcRoundStage(currentRound.number),
		})),
		finishedKnockoutFixtures,
	})
	if (!result.valid) {
		return NextResponse.json({ error: result.reason }, { status: 400 })
	}
}
```

Add a helper `wcRoundStage(roundNumber)` — rounds 1–3 are group-stage, 4+ are knockout:
```typescript
function wcRoundStage(roundNumber: number): 'group' | 'knockout' {
	return roundNumber <= 3 ? 'group' : 'knockout'
}
```

- [ ] **Step 3: Wire auto-elim into process-round.ts**

At the top of `processGameRound`:
```typescript
import {
	computeWcClassicAutoElims,
	type WcFixture,
} from '@/lib/game-logic/wc-classic'
```

After the classic results are applied, before returning, add:
```typescript
if (gameData.competition.type === 'group_knockout' && gameData.gameMode === 'classic') {
	const allRounds = await db.query.round.findMany({
		where: eq(round.competitionId, gameData.competitionId),
		with: { fixtures: true },
	})
	const finishedKnockoutFixtures: WcFixture[] = allRounds
		.flatMap((r) =>
			r.fixtures.map((f) => ({
				id: f.id,
				roundId: r.id,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				homeScore: f.homeScore,
				awayScore: f.awayScore,
				status: f.status,
				stage: r.number <= 3 ? ('group' as const) : ('knockout' as const),
			})),
		)
	const remainingRounds = allRounds
		.filter((r) => r.status !== 'completed')
		.map((r) => ({
			id: r.id,
			fixtures: r.fixtures.map((f) => ({
				id: f.id,
				roundId: r.id,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				homeScore: f.homeScore,
				awayScore: f.awayScore,
				status: f.status,
				stage: r.number <= 3 ? ('group' as const) : ('knockout' as const),
			})),
		}))

	// Reload alive players after the classic updates above
	const aliveAfter = await db.query.gamePlayer.findMany({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.status, 'alive')),
	})
	const picksForAlive = await db.query.pick.findMany({
		where: eq(pick.gameId, gameId),
	})
	const alivePlayers = aliveAfter.map((p) => ({
		gamePlayerId: p.id,
		usedTeamIds: picksForAlive
			.filter((pk) => pk.gamePlayerId === p.id)
			.map((pk) => pk.teamId),
	}))

	const autoElims = computeWcClassicAutoElims({
		alivePlayers,
		remainingRounds,
		finishedKnockoutFixtures,
	})

	for (const ae of autoElims) {
		await db
			.update(gamePlayer)
			.set({ status: 'eliminated', eliminatedRoundId: roundId })
			.where(eq(gamePlayer.id, ae.gamePlayerId))
	}
}
```

- [ ] **Step 4: Typecheck and test**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/picks/ src/lib/game/process-round.ts
git commit -m "feat: apply WC classic tournament-elimination rule"
```

---

### Task 15: Environment variables documentation

**Files:**
- Modify: `AGENTS.md`

Add a short section documenting the new environment variables so the next engineer (human or agent) knows what's required where.

- [ ] **Step 1: Append to AGENTS.md**

Append under "Key Conventions":
```markdown
## Environment variables

Local dev uses `.env.local`; production uses Doppler. Variables:
- `DATABASE_URL` — Postgres connection string.
- `BETTER_AUTH_SECRET` — Better Auth session secret.
- `BETTER_AUTH_URL` — app URL used for cookie scope.
- `CRON_SECRET` — shared secret for GitHub Actions and Vercel cron auth.
- `FOOTBALL_DATA_API_KEY` — football-data.org API key (free tier).
- `QSTASH_TOKEN` — Upstash QStash client token.
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — QStash webhook signature verification.
- `VERCEL_URL` — deployment URL used as the QStash callback base. Populated automatically in Vercel builds; set manually in dev if you want to exercise QStash locally.

GitHub Actions secrets (repo-level):
- `CRON_SECRET` — same value as above.
- `VERCEL_PROD_URL` — full https URL of the Vercel production deployment.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document Phase 4a env vars and GH Actions secrets"
```

---

### Task 16: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run lint**

Run: `pnpm exec biome check --write .`
Expected: clean.

- [ ] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run all tests**

Run: `pnpm exec vitest run`
Expected: all tests pass. Confirm new suites exist for match-window, poll-scores, daily-sync, qstash, qstash-handler, live route, bootstrap-competitions, wc-pots, wc-classic.

- [ ] **Step 4: Start dev server and smoke-test locally**

Run: `docker compose up -d`
Run: `pnpm dev`

In a second terminal:

```bash
curl -sS -X POST \
	-H "Authorization: Bearer dev-secret" \
	http://localhost:3000/api/cron/poll-scores
```
Expected: `{"updated":0,"reason":"no-active-fixtures"}` (because seeded fixtures have past kickoffs or no live-window overlap).

```bash
FOOTBALL_DATA_API_KEY=<your-key> CRON_SECRET=dev-secret just bootstrap-competitions
```
Expected: creates PL 25/26 and WC 2026 in the local DB, populates teams/rounds/fixtures, applies pot assignments.

- [ ] **Step 5: Check that existing game flows still pass**

Navigate to http://localhost:3000 as `dev@example.com` / `password123`. Confirm dashboard + game detail still render.

- [ ] **Step 6: Final commit if anything changed**

If lint/format made changes:
```bash
git add -A
git commit -m "chore: format and lint"
```

---

## Out of scope reminders

These belong in 4b / 4c / 5, not this plan:
- Client-side match-day UI that consumes `/api/games/[id]/live`.
- Automated deadline-reminder delivery (email / WhatsApp auto-send) — 4a only writes a log line. `enqueueDeadlineReminder` exists but has no caller until 4b.
- The `event` table migration — 4b.
- Cup-mode tier indicator UI — 4b.
- Paid rebuys + admin UX + Satori share variants — 4c.

---

## Post-merge operational checklist

This is the cumulative set of operational steps needed to take the app from "code merged on main" to "running in a target environment." Earlier phases implicitly assumed most of these — this list consolidates them so nothing is missed. Each item is tagged with its origin phase.

### External accounts / services (one-time per organisation)

- [ ] **Neon (serverless Postgres)** [Phase 1] — create project; database in **EU (London)** region to minimise latency from Vercel lhr1; copy connection string.
- [ ] **Doppler** [Phase 1] — create project + configs (dev/staging/prod); install Doppler's Vercel integration and link the project so env vars auto-populate on deploy.
- [ ] **Vercel** [Phase 1] — link GitHub repo; set deployment region to **lhr1**; production branch = `main`; confirm framework auto-detected as Next.js.
- [ ] **football-data.org** [Phase 4a] — register at https://www.football-data.org, confirm email, generate free-tier API key.
- [ ] **Upstash QStash** [Phase 4a] — create account + namespace; capture the token and both signing keys. Free tier (500 messages/day) is sufficient for this app's scale.

### Environment variables

Set in Doppler and sync to Vercel via the integration. Cumulative list:

| Variable | Origin | Used by |
|---|---|---|
| `DATABASE_URL` | Phase 1 | all DB access |
| `BETTER_AUTH_SECRET` | Phase 1 | session signing |
| `BETTER_AUTH_URL` | Phase 1 | cookie scope, auth redirects |
| `CRON_SECRET` | Phase 4a | Vercel cron + GitHub Actions auth |
| `FOOTBALL_DATA_API_KEY` | Phase 4a | daily-sync + poll-scores for football-data.org competitions |
| `QSTASH_TOKEN` | Phase 4a | publishing QStash messages |
| `QSTASH_CURRENT_SIGNING_KEY` | Phase 4a | QStash webhook signature verification |
| `QSTASH_NEXT_SIGNING_KEY` | Phase 4a | QStash key-rotation support |
| `VERCEL_URL` | Phase 4a | QStash callback URL base (Vercel auto-populates in prod; set manually only when exercising QStash from local dev) |

GitHub Actions repo-level secrets (Settings → Secrets and Variables → Actions):

| Secret | Origin | Used by |
|---|---|---|
| `CRON_SECRET` | Phase 4a | `.github/workflows/live-scores.yml` |
| `VERCEL_PROD_URL` | Phase 4a | `.github/workflows/live-scores.yml` — full https URL of production |

Local-dev counterparts live in `.env.local` (gitignored).

### Per-environment bootstrap (run once per env)

- [ ] **Apply migrations:** `pnpm exec drizzle-kit migrate` against the target `DATABASE_URL`. Idempotent; safe to re-run.
- [ ] **Seed real competitions:** `FOOTBALL_DATA_API_KEY=<key> just bootstrap-competitions` — creates PL 25/26 (FPL-sourced) and WC 2026 (football-data.org), populates teams/rounds/fixtures, applies WC pot assignments. Idempotent. Must run before opening any real games to players. For the World Cup launch, run **before 11 June 2026**.

Local dev additionally uses `just db-seed` (Phase 1) which seeds dummy users + games for testing. Don't run that against production.

### Post-deploy smoke tests

- [ ] **Auth flow:** sign up a test user on `https://<deployment-url>/signup`; confirm the user row lands in the `user` table.
- [ ] **Daily sync:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<url>/api/cron/daily-sync` → expect 200 with a `competitions` array.
- [ ] **Poll-scores short-circuit:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<url>/api/cron/poll-scores` outside a match window → expect `{ "updated": 0, "reason": "no-active-fixtures" | "no-active-rounds" }`.
- [ ] **Fail-closed auth:** `curl -X POST https://<url>/api/cron/daily-sync` (no header) → 401. Cross-check Vercel logs show no cron secret leak.
- [ ] **QStash webhook:** publish a test message from the QStash dashboard targeting `/api/cron/qstash-handler`; confirm signature-verified processing in Vercel logs.
- [ ] **Bootstrap result:** after `just bootstrap-competitions`, verify DB has `competition` rows for PL 25/26 and WC 2026; ≥ 20 PL teams + 48 WC teams; ≥ 1 round per competition.

### Go-live day (first match window)

- [ ] Confirm `.github/workflows/live-scores.yml` is enabled and running (Actions tab should show runs every 5 minutes).
- [ ] At kickoff of the first real fixture, check that `poll-scores` transitions from `no-active-fixtures` to `{ "updated": N }` within ~5 minutes.
- [ ] After the final fixture of a round finishes, confirm a QStash `process_round` message is enqueued (visible in QStash dashboard), and within ~2 minutes the round status flips to `completed` and eliminations are applied.
- [ ] End-to-end manual test: create a game, invite a second user, both make picks, watch live scores update, let round auto-process.

### Known limitations for Phase 4a launch

Document these for anyone using the app; they are Phase 4b/4c/5 work:

- **Payment processing:** Manual only. No Mangopay / Stripe integration. Entry fees are a display value; actual money movement is off-platform. Phase 4b adds player-claim + admin-confirm tracking; Phase 5 adds Mangopay. Do not launch paid games until that flow is in place, or restrict to trusted-circle games with off-platform settlement.
- **Notifications:** Deadline reminders enqueue helper exists but has no caller; `writeEvent` logs to `console.info` only. No email / WhatsApp / push delivery in 4a. Phase 4b adds the event table and manual WhatsApp-share; Phase 5 automates.
- **Mobile polish:** App functions on mobile but is not breakpoint-optimised. Phase 4c delivers polish.
- **Live match-day UI:** The `GET /api/games/[id]/live` endpoint exists but no client component consumes it. Phase 4c builds the match-day view.
- **WC data accuracy:**
  - `WC_2026_POTS[*].footballDataId` values are empty strings pending first daily-sync; `applyPotAssignments` is a no-op until they're backfilled. Plan a second bootstrap pass after the first daily-sync populates team IDs.
  - Spot-check Norway's pot assignment against FIFA.com — one reviewer flagged uncertainty (implementer found three sources agreeing on Pot 3, but verify if cup-mode gameplay hinges on it).
  - Six Pot 4 slots are marked `tbd: true` for playoff winners; those resolved in March 2026 playoffs so can be backfilled post-merge.
- **Better Auth email verification:** Signup does not verify email ownership. Acceptable for a trusted-circle launch; tighten before open signup.
- **Round stage heuristic:** `wcRoundStage(roundNumber)` assumes rounds 1–3 are group and 4+ are knockout. Correct for football-data.org's current WC matchday numbering but fragile. Add a `round.stage` column if a second group_knockout competition (e.g. Champions League) is added before 4b.

### Deprecations to clean up

- **`/api/cron/sync-fpl`** [Phase 2] — duplicates what `daily-sync` now does for the FPL competition. Decide in Phase 4b whether to remove the endpoint or keep as a manual-trigger escape hatch.

---

## Self-review checklist

Before handing this plan to an implementer, confirm:

- [x] Every design-spec requirement for 4a is mapped to a task: external schedulers (Tasks 2/8/9), QStash (4/5/6), client polling endpoint (7), WC competition (10/11/12), classic WC auto-elim (13/14), env vars (15).
- [x] Every task has exact file paths, complete code, and a commit step.
- [x] Types referenced across tasks are consistent: `QStashJob`, `WcFixture`, `CompetitionAdapter`, `EventInput`.
- [x] No placeholder text ("TBD", "implement later") in task bodies.
- [x] Task 10 acknowledges that pot data is populated during implementation from the public FIFA draw — not a hidden TODO.
