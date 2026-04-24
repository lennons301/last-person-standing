# Phase 4c1: Match-Day Live UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the client-side polling layer, live score ticker, goal celebrations, pick-row enrichment, and elimination fade that make the app feel alive during match windows — without WebSockets, a new data provider, or a server-side events table.

**Architecture:** A single new React context (`<LiveProvider>`) polls the existing `/api/games/[id]/live` endpoint on an adaptive timer (30s during match windows, 5min otherwise), diffs consecutive payloads to emit synthetic goal + elimination events, and exposes state via `useLiveGame()`. UI components subscribe to render the ticker and apply enrichment overlays. One cron cadence change on the GitHub Actions workflow bumps server freshness from 5min to 1min.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind v4, lucide-react, Vitest. No new dependencies.

**Design spec:** `docs/superpowers/specs/2026-04-24-phase-4c1-live-match-day-design.md`

---

## Scope

Single sub-phase (4c1), one feature branch (`feature/phase-4c1-live-match-day`). Merges dormant onto `main`; runtime verification happens in Phase 4.5.

## File structure

### Created

| Path | Responsibility |
|---|---|
| `src/lib/live/types.ts` | Shared TypeScript types — `LivePayload`, `GoalEvent`, `PickSettlementEvent`. Frozen contract between server `getLivePayload` and all client consumers. |
| `src/lib/live/derive.ts` | Pure functions — `deriveMatchState`, `projectPickOutcome`. |
| `src/lib/live/derive.test.ts` | Tests for `derive.ts`. |
| `src/lib/live/detect.ts` | Pure functions — `detectGoalDeltas`, `detectPickSettlements`. |
| `src/lib/live/detect.test.ts` | Tests for `detect.ts`. |
| `src/components/live/live-provider.tsx` | React context + poll timer + fetch + diff + error state. Owns all live-state side effects. |
| `src/components/live/use-live-game.ts` | Hook reading from context. Public API for consumers. |
| `src/components/live/use-live-game.test.ts` | Hook tests using `@testing-library/react` + `vi.useFakeTimers`. |
| `src/components/live/live-score-ticker.tsx` | Top-of-page horizontal strip. Composes `<LiveFixtureCard>` per fixture. Hides when no fixture in window. |
| `src/components/live/live-fixture-card.tsx` | Per-fixture card: badges, scores, status pill, "My pick" tag, celebration state wiring. |
| `src/components/live/goal-celebration.tsx` | Decorator managing celebration CSS classes + floating chip via `setTimeout`. |
| `src/components/live/live-indicators.tsx` | Small shared atoms: `<LiveDot>`, `<ReconnectingChip>`. |

### Modified

- `src/components/game/game-detail-view.tsx` — wrap children in `<LiveProvider>`, render `<LiveScoreTicker>` above existing content.
- `src/components/standings/cup-grid.tsx` — accept optional `live?: LivePayload` prop; apply viewer-row enrichment + score-bump badges + elimination fade.
- `src/components/standings/cup-ladder.tsx` — same `live` prop pattern; live fixture cards show live scores.
- `src/components/standings/cup-timeline.tsx` — same pattern.
- `src/components/standings/cup-standings.tsx` — tab wrapper threads `live` through to active tab's component.
- `src/components/game/turbo-standings.tsx` — same `live` pattern.
- `src/components/standings/progress-grid.tsx` — classic-mode equivalent; same pattern.
- `.github/workflows/live-scores.yml` — cron cadence `'*/5 * * * *'` → `'* * * * *'`.
- `scripts/seed.ts` — add a mid-match cup game for dev verification.

## Execution order

Tasks are numbered to match the intended sequence. Within each task, steps run top-to-bottom; TDD is used wherever there's pure logic to test.

---

## Part A — Pure types and logic

### Task 1: Shared types module

**Files:**
- Create: `src/lib/live/types.ts`

Shared TypeScript types that frame the client/server contract. Every other file in `src/lib/live/` and `src/components/live/` imports from here.

- [ ] **Step 1: Implement types**

```typescript
// src/lib/live/types.ts
export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'halftime'

export type PickResultState =
	| 'win'
	| 'loss'
	| 'draw'
	| 'saved_by_life'
	| 'hidden'
	| 'restricted'
	| 'pending'

export interface LiveFixture {
	id: string
	kickoff: Date | string | null
	homeScore: number | null
	awayScore: number | null
	status: FixtureStatus
	homeShort: string
	awayShort: string
}

export interface LivePick {
	gamePlayerId: string
	fixtureId: string | null
	teamId: string | null
	confidenceRank: number | null
	predictedResult: 'home_win' | 'away_win' | 'draw' | null
	result: PickResultState | null
}

export interface LivePlayer {
	id: string
	userId: string
	status: 'active' | 'eliminated'
	livesRemaining: number
}

export interface LivePayload {
	gameId: string
	gameMode: 'classic' | 'turbo' | 'cup'
	roundId: string | null
	fixtures: LiveFixture[]
	picks: LivePick[]
	players: LivePlayer[]
	viewerUserId: string
	updatedAt: string
}

export interface GoalEvent {
	id: string
	fixtureId: string
	side: 'home' | 'away'
	newScore: number
	previousScore: number
	observedAt: number
}

export interface PickSettlementEvent {
	id: string
	gamePlayerId: string
	roundId: string
	result: 'settled-win' | 'settled-loss' | 'saved-by-life'
	observedAt: number
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/live/types.ts
git commit -m "feat(live): add shared live-state types"
```

---

### Task 2: `deriveMatchState` + `projectPickOutcome`

**Files:**
- Create: `src/lib/live/derive.ts`
- Create: `src/lib/live/derive.test.ts`

Pure functions that classify a fixture's live state and project a pick's current outcome from the live score.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/live/derive.test.ts
import { describe, expect, it } from 'vitest'
import { deriveMatchState, projectPickOutcome } from './derive'
import type { LiveFixture, LivePick } from './types'

function fx(overrides: Partial<LiveFixture> = {}): LiveFixture {
	return {
		id: 'fx1',
		kickoff: new Date('2026-06-11T19:00:00Z'),
		homeScore: null,
		awayScore: null,
		status: 'scheduled',
		homeShort: 'ENG',
		awayShort: 'FRA',
		...overrides,
	}
}

describe('deriveMatchState', () => {
	it('returns pre when kickoff is more than 10 minutes away', () => {
		const now = new Date('2026-06-11T18:49:00Z')
		expect(deriveMatchState(fx(), now)).toBe('pre')
	})

	it('returns live when kickoff is within 10m before and status is scheduled', () => {
		const now = new Date('2026-06-11T18:55:00Z')
		expect(deriveMatchState(fx(), now)).toBe('live')
	})

	it('returns live when status is live', () => {
		const now = new Date('2026-06-11T19:30:00Z')
		expect(deriveMatchState(fx({ status: 'live' }), now)).toBe('live')
	})

	it('returns ht when status is halftime', () => {
		const now = new Date('2026-06-11T19:45:00Z')
		expect(deriveMatchState(fx({ status: 'halftime' }), now)).toBe('ht')
	})

	it('returns ft when status is finished', () => {
		const now = new Date('2026-06-11T21:30:00Z')
		expect(deriveMatchState(fx({ status: 'finished' }), now)).toBe('ft')
	})

	it('returns ft when kickoff is more than 2.5h ago regardless of status', () => {
		const now = new Date('2026-06-11T22:00:00Z')
		expect(deriveMatchState(fx(), now)).toBe('ft')
	})

	it('returns pre when kickoff is null', () => {
		expect(deriveMatchState(fx({ kickoff: null }), new Date())).toBe('pre')
	})
})

describe('projectPickOutcome', () => {
	const homeWin: LivePick = {
		gamePlayerId: 'gp1',
		fixtureId: 'fx1',
		teamId: 't-home',
		confidenceRank: 1,
		predictedResult: 'home_win',
		result: null,
	}

	it('returns winning when home pick and home leads', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 1, awayScore: 0, status: 'live' }), 'classic'),
		).toBe('winning')
	})

	it('returns losing when home pick and away leads', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 0, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('losing')
	})

	it('returns drawing when scores level during live match', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 1, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('drawing')
	})

	it('returns settled-win when status finished and home wins', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 2, awayScore: 1, status: 'finished' }), 'classic'),
		).toBe('settled-win')
	})

	it('returns settled-loss when status finished and home loses', () => {
		expect(
			projectPickOutcome(homeWin, fx({ homeScore: 0, awayScore: 1, status: 'finished' }), 'classic'),
		).toBe('settled-loss')
	})

	it('returns saved-by-life when pick result is saved_by_life', () => {
		expect(
			projectPickOutcome({ ...homeWin, result: 'saved_by_life' }, fx({ status: 'finished' }), 'cup'),
		).toBe('saved-by-life')
	})

	it('returns winning for away pick when away leads', () => {
		const awayWin: LivePick = { ...homeWin, predictedResult: 'away_win' }
		expect(
			projectPickOutcome(awayWin, fx({ homeScore: 0, awayScore: 1, status: 'live' }), 'classic'),
		).toBe('winning')
	})
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run src/lib/live/derive.test.ts`
Expected: FAIL with "cannot find module ./derive".

- [ ] **Step 3: Implement `derive.ts`**

```typescript
// src/lib/live/derive.ts
import type { LiveFixture, LivePick } from './types'

const LIVE_WINDOW_BEFORE_MS = 10 * 60 * 1000
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000

export function deriveMatchState(
	fixture: LiveFixture,
	now: Date = new Date(),
): 'pre' | 'live' | 'ht' | 'ft' {
	if (fixture.status === 'halftime') return 'ht'
	if (fixture.status === 'finished') return 'ft'

	if (!fixture.kickoff) return 'pre'
	const kickoffMs = typeof fixture.kickoff === 'string' ? Date.parse(fixture.kickoff) : fixture.kickoff.getTime()
	const nowMs = now.getTime()

	if (nowMs < kickoffMs - LIVE_WINDOW_BEFORE_MS) return 'pre'
	if (nowMs > kickoffMs + LIVE_WINDOW_AFTER_MS) return 'ft'
	return 'live'
}

export type PickOutcome =
	| 'winning'
	| 'drawing'
	| 'losing'
	| 'saved-by-life'
	| 'settled-win'
	| 'settled-loss'
	| 'pending'

export function projectPickOutcome(
	pick: LivePick,
	fixture: LiveFixture,
	_mode: 'classic' | 'turbo' | 'cup',
): PickOutcome {
	if (pick.result === 'saved_by_life') return 'saved-by-life'
	if (pick.result === 'win') return 'settled-win'
	if (pick.result === 'loss') return 'settled-loss'

	const { homeScore, awayScore, status } = fixture
	if (homeScore == null || awayScore == null) return 'pending'

	const isFinished = status === 'finished'

	if (pick.predictedResult === 'home_win') {
		if (homeScore > awayScore) return isFinished ? 'settled-win' : 'winning'
		if (homeScore < awayScore) return isFinished ? 'settled-loss' : 'losing'
		return isFinished ? 'settled-loss' : 'drawing'
	}

	if (pick.predictedResult === 'away_win') {
		if (awayScore > homeScore) return isFinished ? 'settled-win' : 'winning'
		if (awayScore < homeScore) return isFinished ? 'settled-loss' : 'losing'
		return isFinished ? 'settled-loss' : 'drawing'
	}

	if (pick.predictedResult === 'draw') {
		if (homeScore === awayScore) return isFinished ? 'settled-win' : 'drawing'
		return isFinished ? 'settled-loss' : 'losing'
	}

	return 'pending'
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec vitest run src/lib/live/derive.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/live/derive.ts src/lib/live/derive.test.ts
git commit -m "feat(live): add deriveMatchState and projectPickOutcome pure functions"
```

---

### Task 3: `detectGoalDeltas` + `detectPickSettlements`

**Files:**
- Create: `src/lib/live/detect.ts`
- Create: `src/lib/live/detect.test.ts`

Pure functions that diff consecutive `LivePayload`s into event streams.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/live/detect.test.ts
import { describe, expect, it } from 'vitest'
import { detectGoalDeltas, detectPickSettlements } from './detect'
import type { LiveFixture, LivePayload, LivePick, LivePlayer } from './types'

function payload(overrides: Partial<LivePayload> = {}): LivePayload {
	return {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures: [],
		picks: [],
		players: [],
		viewerUserId: 'u1',
		updatedAt: new Date().toISOString(),
		...overrides,
	}
}

function fx(overrides: Partial<LiveFixture> = {}): LiveFixture {
	return {
		id: 'fx1',
		kickoff: new Date('2026-06-11T19:00:00Z'),
		homeScore: 0,
		awayScore: 0,
		status: 'live',
		homeShort: 'ENG',
		awayShort: 'FRA',
		...overrides,
	}
}

describe('detectGoalDeltas', () => {
	it('returns empty when no fixtures changed', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('emits one event when home score increments', () => {
		const a = payload({ fixtures: [fx({ homeScore: 0, awayScore: 0 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1, awayScore: 0 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].id).toBe('fx1:home:1')
		expect(events[0].side).toBe('home')
		expect(events[0].newScore).toBe(1)
		expect(events[0].previousScore).toBe(0)
	})

	it('emits one event per increment when score jumps by two', () => {
		const a = payload({ fixtures: [fx({ homeScore: 0 })] })
		const b = payload({ fixtures: [fx({ homeScore: 2 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(2)
		expect(events.map((e) => e.id)).toEqual(['fx1:home:1', 'fx1:home:2'])
	})

	it('never emits events for score decrements', () => {
		const a = payload({ fixtures: [fx({ homeScore: 2 })] })
		const b = payload({ fixtures: [fx({ homeScore: 1 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores transition from null to non-null (treated as initial load)', () => {
		const a = payload({ fixtures: [fx({ homeScore: null, awayScore: null })] })
		const b = payload({ fixtures: [fx({ homeScore: 1, awayScore: 0 })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores non-null to null transition', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [fx({ homeScore: null })] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('ignores fixture removed between polls', () => {
		const a = payload({ fixtures: [fx({ homeScore: 1 })] })
		const b = payload({ fixtures: [] })
		expect(detectGoalDeltas(a, b)).toEqual([])
	})

	it('emits for away-side increments', () => {
		const a = payload({ fixtures: [fx({ awayScore: 0 })] })
		const b = payload({ fixtures: [fx({ awayScore: 1 })] })
		const events = detectGoalDeltas(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].side).toBe('away')
		expect(events[0].id).toBe('fx1:away:1')
	})
})

function pk(overrides: Partial<LivePick> = {}): LivePick {
	return {
		gamePlayerId: 'gp1',
		fixtureId: 'fx1',
		teamId: 't-home',
		confidenceRank: 1,
		predictedResult: 'home_win',
		result: 'pending',
		...overrides,
	}
}

function pl(overrides: Partial<LivePlayer> = {}): LivePlayer {
	return { id: 'gp1', userId: 'u1', status: 'active', livesRemaining: 1, ...overrides }
}

describe('detectPickSettlements', () => {
	it('emits settled-loss when a pending pick transitions to loss', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].id).toBe('gp1:r1:settled-loss')
		expect(events[0].result).toBe('settled-loss')
	})

	it('emits settled-win on pending to win', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'win' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].result).toBe('settled-win')
	})

	it('emits saved-by-life on pending to saved_by_life', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'saved_by_life' })], players: [pl()] })
		const events = detectPickSettlements(a, b)
		expect(events).toHaveLength(1)
		expect(events[0].result).toBe('saved-by-life')
	})

	it('does not re-emit on already-settled pick', () => {
		const a = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'loss' })], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})

	it('does not emit for still-pending pick', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})

	it('ignores pick removed between polls', () => {
		const a = payload({ picks: [pk({ result: 'pending' })], players: [pl()] })
		const b = payload({ picks: [], players: [pl()] })
		expect(detectPickSettlements(a, b)).toEqual([])
	})
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run src/lib/live/detect.test.ts`
Expected: FAIL with "cannot find module ./detect".

- [ ] **Step 3: Implement `detect.ts`**

```typescript
// src/lib/live/detect.ts
import type { GoalEvent, LivePayload, PickSettlementEvent } from './types'

export function detectGoalDeltas(previous: LivePayload, next: LivePayload): GoalEvent[] {
	const events: GoalEvent[] = []
	const observedAt = Date.now()

	for (const nextFx of next.fixtures) {
		const prevFx = previous.fixtures.find((f) => f.id === nextFx.id)
		if (!prevFx) continue

		for (const side of ['home', 'away'] as const) {
			const prevScore = side === 'home' ? prevFx.homeScore : prevFx.awayScore
			const nextScore = side === 'home' ? nextFx.homeScore : nextFx.awayScore
			if (prevScore == null || nextScore == null) continue
			if (nextScore <= prevScore) continue

			for (let s = prevScore + 1; s <= nextScore; s++) {
				events.push({
					id: `${nextFx.id}:${side}:${s}`,
					fixtureId: nextFx.id,
					side,
					newScore: s,
					previousScore: s - 1,
					observedAt,
				})
			}
		}
	}
	return events
}

const SETTLED_RESULTS = new Set(['win', 'loss', 'saved_by_life'])

export function detectPickSettlements(
	previous: LivePayload,
	next: LivePayload,
): PickSettlementEvent[] {
	const events: PickSettlementEvent[] = []
	const observedAt = Date.now()

	for (const nextPk of next.picks) {
		const prevPk = previous.picks.find(
			(p) => p.gamePlayerId === nextPk.gamePlayerId && p.fixtureId === nextPk.fixtureId,
		)
		if (!prevPk) continue
		if (prevPk.result === nextPk.result) continue
		if (SETTLED_RESULTS.has(String(prevPk.result))) continue
		if (!SETTLED_RESULTS.has(String(nextPk.result))) continue
		if (!next.roundId) continue

		const mapped =
			nextPk.result === 'win'
				? 'settled-win'
				: nextPk.result === 'loss'
					? 'settled-loss'
					: 'saved-by-life'

		events.push({
			id: `${nextPk.gamePlayerId}:${next.roundId}:${mapped}`,
			gamePlayerId: nextPk.gamePlayerId,
			roundId: next.roundId,
			result: mapped,
			observedAt,
		})
	}
	return events
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec vitest run src/lib/live/detect.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/live/detect.ts src/lib/live/detect.test.ts
git commit -m "feat(live): add detectGoalDeltas and detectPickSettlements"
```

---

## Part B — Provider and hook

### Task 4: `LiveProvider` skeleton + `useLiveGame` hook

**Files:**
- Create: `src/components/live/live-provider.tsx`
- Create: `src/components/live/use-live-game.ts`

Context provider shell: state shape, context object, hook. No network yet — just the wiring. Keeps this task small and typecheckable; Task 5 adds the fetch loop.

- [ ] **Step 1: Implement `live-provider.tsx`**

```typescript
// src/components/live/live-provider.tsx
'use client'
import { createContext, type ReactNode, useMemo, useState } from 'react'
import type { GoalEvent, LivePayload, PickSettlementEvent } from '@/lib/live/types'

export interface LiveContextValue {
	payload: LivePayload | null
	events: {
		goals: GoalEvent[]
		settlements: PickSettlementEvent[]
	}
	isStale: boolean
	reconnecting: boolean
}

const defaultValue: LiveContextValue = {
	payload: null,
	events: { goals: [], settlements: [] },
	isStale: false,
	reconnecting: false,
}

export const LiveContext = createContext<LiveContextValue>(defaultValue)

interface LiveProviderProps {
	gameId: string
	children: ReactNode
}

export function LiveProvider({ gameId: _gameId, children }: LiveProviderProps) {
	const [payload] = useState<LivePayload | null>(null)
	const value = useMemo<LiveContextValue>(
		() => ({ payload, events: { goals: [], settlements: [] }, isStale: false, reconnecting: false }),
		[payload],
	)
	return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
```

- [ ] **Step 2: Implement `use-live-game.ts`**

```typescript
// src/components/live/use-live-game.ts
'use client'
import { useContext } from 'react'
import { LiveContext, type LiveContextValue } from './live-provider'

export function useLiveGame(): LiveContextValue {
	return useContext(LiveContext)
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/live/live-provider.tsx src/components/live/use-live-game.ts
git commit -m "feat(live): add LiveProvider context skeleton and useLiveGame hook"
```

---

### Task 5: Polling + diffing wired into `LiveProvider`

**Files:**
- Modify: `src/components/live/live-provider.tsx`
- Create: `src/components/live/use-live-game.test.tsx`

Adds the fetch loop, adaptive cadence, visibility listener, diff emission, and error handling. Large task but one coherent addition — the provider's real behaviour.

- [ ] **Step 1: Write the failing hook tests**

```typescript
// src/components/live/use-live-game.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePayload } from '@/lib/live/types'
import { LiveProvider } from './live-provider'
import { useLiveGame } from './use-live-game'

function wrapperFor(gameId: string) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <LiveProvider gameId={gameId}>{children}</LiveProvider>
	}
}

function basePayload(overrides: Partial<LivePayload> = {}): LivePayload {
	return {
		gameId: 'g1',
		gameMode: 'classic',
		roundId: 'r1',
		fixtures: [],
		picks: [],
		players: [],
		viewerUserId: 'u1',
		updatedAt: new Date().toISOString(),
		...overrides,
	}
}

describe('useLiveGame', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal('fetch', vi.fn())
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('fetches immediately on mount and returns payload', async () => {
		const payload = basePayload()
		;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => payload,
		})
		const { result } = renderHook(() => useLiveGame(), { wrapper: wrapperFor('g1') })
		await vi.runOnlyPendingTimersAsync()
		await waitFor(() => expect(result.current.payload).not.toBeNull())
		expect(result.current.payload?.gameId).toBe('g1')
	})

	it('sets isStale on fetch failure', async () => {
		;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))
		const { result } = renderHook(() => useLiveGame(), { wrapper: wrapperFor('g1') })
		await vi.runOnlyPendingTimersAsync()
		await waitFor(() => expect(result.current.isStale).toBe(true))
	})
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run src/components/live/use-live-game.test.tsx`
Expected: FAIL — payload stays null / isStale stays false, because Task 4's skeleton doesn't fetch.

- [ ] **Step 3: Implement real `LiveProvider`**

```typescript
// src/components/live/live-provider.tsx
'use client'
import { createContext, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { detectGoalDeltas, detectPickSettlements } from '@/lib/live/detect'
import type { GoalEvent, LivePayload, PickSettlementEvent } from '@/lib/live/types'

const LIVE_CADENCE_MS = 30_000
const IDLE_CADENCE_MS = 5 * 60_000
const MAX_BACKOFF_MS = 120_000
const LIVE_WINDOW_BEFORE_MS = 10 * 60_000
const LIVE_WINDOW_AFTER_MS = 150 * 60_000
const EVENT_BUFFER_CAP = 20

export interface LiveContextValue {
	payload: LivePayload | null
	events: {
		goals: GoalEvent[]
		settlements: PickSettlementEvent[]
	}
	isStale: boolean
	reconnecting: boolean
}

const defaultValue: LiveContextValue = {
	payload: null,
	events: { goals: [], settlements: [] },
	isStale: false,
	reconnecting: false,
}

export const LiveContext = createContext<LiveContextValue>(defaultValue)

function hasActiveFixture(payload: LivePayload | null, now = Date.now()): boolean {
	if (!payload) return false
	return payload.fixtures.some((f) => {
		if (!f.kickoff) return false
		const t = typeof f.kickoff === 'string' ? Date.parse(f.kickoff) : f.kickoff.getTime()
		return now >= t - LIVE_WINDOW_BEFORE_MS && now <= t + LIVE_WINDOW_AFTER_MS
	})
}

interface LiveProviderProps {
	gameId: string
	children: ReactNode
}

export function LiveProvider({ gameId, children }: LiveProviderProps) {
	const [payload, setPayload] = useState<LivePayload | null>(null)
	const [goals, setGoals] = useState<GoalEvent[]>([])
	const [settlements, setSettlements] = useState<PickSettlementEvent[]>([])
	const [isStale, setIsStale] = useState(false)
	const [reconnecting, setReconnecting] = useState(false)

	const previousRef = useRef<LivePayload | null>(null)
	const backoffRef = useRef(0)

	useEffect(() => {
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null

		async function fetchOnce() {
			try {
				const res = await fetch(`/api/games/${gameId}/live`, { cache: 'no-store' })
				if (cancelled) return
				if (res.status === 401 || res.status === 403 || res.status === 404) {
					setPayload(null)
					setIsStale(true)
					setReconnecting(false)
					return
				}
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const next = (await res.json()) as LivePayload
				const prev = previousRef.current
				if (prev) {
					const newGoals = detectGoalDeltas(prev, next)
					if (newGoals.length) {
						setGoals((g) => [...g, ...newGoals].slice(-EVENT_BUFFER_CAP))
					}
					const newSettlements = detectPickSettlements(prev, next)
					if (newSettlements.length) {
						setSettlements((s) => [...s, ...newSettlements].slice(-EVENT_BUFFER_CAP))
					}
				}
				previousRef.current = next
				setPayload(next)
				setIsStale(false)
				setReconnecting(false)
				backoffRef.current = 0
			} catch {
				if (cancelled) return
				setIsStale(true)
				setReconnecting(true)
				backoffRef.current = Math.min(
					backoffRef.current > 0 ? backoffRef.current * 2 : LIVE_CADENCE_MS,
					MAX_BACKOFF_MS,
				)
			} finally {
				if (cancelled) return
				if (document.visibilityState === 'hidden') return
				const interval =
					backoffRef.current > 0
						? backoffRef.current
						: hasActiveFixture(previousRef.current)
							? LIVE_CADENCE_MS
							: IDLE_CADENCE_MS
				timer = setTimeout(fetchOnce, interval)
			}
		}

		function handleVisibility() {
			if (document.visibilityState === 'visible') {
				if (timer) clearTimeout(timer)
				void fetchOnce()
			} else if (timer) {
				clearTimeout(timer)
				timer = null
			}
		}

		document.addEventListener('visibilitychange', handleVisibility)
		void fetchOnce()

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
			document.removeEventListener('visibilitychange', handleVisibility)
			previousRef.current = null
		}
	}, [gameId])

	const value = useMemo<LiveContextValue>(
		() => ({ payload, events: { goals, settlements }, isStale, reconnecting }),
		[payload, goals, settlements, isStale, reconnecting],
	)

	return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm exec vitest run src/components/live/use-live-game.test.tsx`
Expected: both tests PASS.

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; total test count grew by 2.

- [ ] **Step 6: Commit**

```bash
git add src/components/live/live-provider.tsx src/components/live/use-live-game.test.tsx
git commit -m "feat(live): wire polling, adaptive cadence, diff emission into LiveProvider"
```

---

## Part C — UI components

### Task 6: Shared live-indicator atoms

**Files:**
- Create: `src/components/live/live-indicators.tsx`

Small presentational atoms reused by the ticker and any enrichment UI.

- [ ] **Step 1: Implement**

```typescript
// src/components/live/live-indicators.tsx
import { cn } from '@/lib/utils'

export function LiveDot({ className }: { className?: string }) {
	return (
		<span
			role="img"
			aria-label="live"
			className={cn(
				'inline-block h-1.5 w-1.5 rounded-full bg-current',
				'animate-[pulse_1.4s_ease-in-out_infinite]',
				className,
			)}
		/>
	)
}

export function ReconnectingChip() {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
			<span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-[pulse_1.4s_ease-in-out_infinite]" />
			Reconnecting…
		</span>
	)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/live/live-indicators.tsx
git commit -m "feat(live): add LiveDot and ReconnectingChip atoms"
```

---

### Task 7: `LiveFixtureCard` presentation

**Files:**
- Create: `src/components/live/live-fixture-card.tsx`

Per-fixture card — badges, scores, status pill, My-pick tag. Static visuals only; Task 8 adds celebration animation.

- [ ] **Step 1: Implement**

```typescript
// src/components/live/live-fixture-card.tsx
'use client'
import { deriveMatchState } from '@/lib/live/derive'
import type { LiveFixture } from '@/lib/live/types'
import { cn } from '@/lib/utils'
import { LiveDot } from './live-indicators'

interface LiveFixtureCardProps {
	fixture: LiveFixture
	isMyPick?: boolean
	now?: Date
	className?: string
}

function statusText(
	state: 'pre' | 'live' | 'ht' | 'ft',
	kickoff: Date | string | null,
	now: Date,
): string {
	if (state === 'ht') return 'HALF TIME'
	if (state === 'ft') return 'FULL TIME'
	if (state === 'live') return 'LIVE'
	if (!kickoff) return 'TBC'
	const t = typeof kickoff === 'string' ? Date.parse(kickoff) : kickoff.getTime()
	const mins = Math.max(0, Math.round((t - now.getTime()) / 60_000))
	return mins === 0 ? 'KICKING OFF' : `KICKS OFF IN ${mins}m`
}

export function LiveFixtureCard({
	fixture,
	isMyPick = false,
	now = new Date(),
	className,
}: LiveFixtureCardProps) {
	const state = deriveMatchState(fixture, now)
	const statusClasses =
		state === 'live'
			? 'text-[#ef4444] border-[#ef4444]'
			: state === 'ht'
				? 'text-amber-500 border-amber-500'
				: 'text-muted-foreground border-border'
	return (
		<div
			data-fixture-id={fixture.id}
			data-state={state}
			className={cn(
				'relative flex min-w-[170px] flex-col gap-1 rounded-lg border bg-card px-3 py-2',
				statusClasses,
				state === 'pre' && 'opacity-70',
				className,
			)}
		>
			{isMyPick && (
				<span className="absolute -top-1.5 right-2 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
					My pick
				</span>
			)}
			<div className="flex items-center justify-between text-sm font-semibold">
				<span>{fixture.homeShort}</span>
				<span
					data-score="home"
					className="font-variant-numeric: tabular-nums; font-bold"
				>
					{fixture.homeScore ?? '−'}
				</span>
			</div>
			<div className="flex items-center justify-between text-sm font-semibold">
				<span>{fixture.awayShort}</span>
				<span
					data-score="away"
					className="font-variant-numeric: tabular-nums; font-bold"
				>
					{fixture.awayScore ?? '−'}
				</span>
			</div>
			<div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
				{state === 'live' && <LiveDot className="text-[#ef4444]" />}
				<span className="text-current">{statusText(state, fixture.kickoff, now)}</span>
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
git add src/components/live/live-fixture-card.tsx
git commit -m "feat(live): add LiveFixtureCard presentation"
```

---

### Task 8: `GoalCelebration` wrapper

**Files:**
- Create: `src/components/live/goal-celebration.tsx`

Wraps a `<LiveFixtureCard>` and applies the celebration state (scale pulse, green glow, floating chip) when a matching `GoalEvent` flows through the hook. Uses CSS classes + `setTimeout` cleanup; no animation framework.

- [ ] **Step 1: Implement**

```typescript
// src/components/live/goal-celebration.tsx
'use client'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { GoalEvent, LivePick } from '@/lib/live/types'
import { cn } from '@/lib/utils'
import { useLiveGame } from './use-live-game'

interface GoalCelebrationProps {
	fixtureId: string
	viewerPick?: LivePick | null
	children: ReactNode
}

interface Celebration {
	eventId: string
	side: 'home' | 'away'
	minute: number
	friendly: boolean
}

const HOLD_MS = 2000

export function GoalCelebration({ fixtureId, viewerPick, children }: GoalCelebrationProps) {
	const { events } = useLiveGame()
	const [active, setActive] = useState<Celebration | null>(null)
	const handledIds = useRef<Set<string>>(new Set())

	useEffect(() => {
		for (const ev of events.goals) {
			if (ev.fixtureId !== fixtureId) continue
			if (handledIds.current.has(ev.id)) continue
			handledIds.current.add(ev.id)
			const friendly =
				!!viewerPick &&
				((ev.side === 'home' && viewerPick.predictedResult === 'home_win') ||
					(ev.side === 'away' && viewerPick.predictedResult === 'away_win'))
			setActive({ eventId: ev.id, side: ev.side, minute: 0, friendly })
			const timer = setTimeout(() => {
				setActive((current) => (current?.eventId === ev.id ? null : current))
			}, HOLD_MS)
			return () => clearTimeout(timer)
		}
	}, [events.goals, fixtureId, viewerPick])

	return (
		<div className="relative">
			{active && (
				<span
					className={cn(
						'absolute left-1/2 -top-2.5 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg',
						active.friendly ? 'bg-emerald-500' : 'bg-red-500',
					)}
				>
					GOAL
				</span>
			)}
			<div
				data-celebrating={active ? active.friendly ? 'friendly' : 'opposing' : undefined}
				className={cn(
					'transition-all duration-300',
					active?.friendly &&
						'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-[1.03]',
					active && !active.friendly &&
						'ring-2 ring-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-[1.02]',
				)}
			>
				{children}
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
git add src/components/live/goal-celebration.tsx
git commit -m "feat(live): add GoalCelebration wrapper with friendly/opposing treatments"
```

---

### Task 9: `LiveScoreTicker`

**Files:**
- Create: `src/components/live/live-score-ticker.tsx`

Top-of-page horizontal strip. Reads `payload` + `events` from `useLiveGame()`. Only renders when any fixture is in its live window. Shows `<ReconnectingChip>` when `reconnecting`.

- [ ] **Step 1: Implement**

```typescript
// src/components/live/live-score-ticker.tsx
'use client'
import { deriveMatchState } from '@/lib/live/derive'
import type { LivePick } from '@/lib/live/types'
import { GoalCelebration } from './goal-celebration'
import { LiveFixtureCard } from './live-fixture-card'
import { ReconnectingChip } from './live-indicators'
import { useLiveGame } from './use-live-game'

export function LiveScoreTicker() {
	const { payload, reconnecting } = useLiveGame()
	if (!payload) return null

	const now = new Date()
	const livish = payload.fixtures.filter((f) => {
		const state = deriveMatchState(f, now)
		return state === 'pre' || state === 'live' || state === 'ht'
	})
	if (livish.length === 0) return null

	const viewerPicksByFixture = new Map<string, LivePick>()
	const viewerPlayerIds = new Set(
		payload.players.filter((p) => p.userId === payload.viewerUserId).map((p) => p.id),
	)
	for (const pk of payload.picks) {
		if (viewerPlayerIds.has(pk.gamePlayerId) && pk.fixtureId) {
			viewerPicksByFixture.set(pk.fixtureId, pk)
		}
	}

	return (
		<div className="mb-4 flex items-start gap-2">
			<div className="flex flex-1 gap-2 overflow-x-auto pb-1">
				{livish.map((fixture) => {
					const viewerPick = viewerPicksByFixture.get(fixture.id) ?? null
					return (
						<GoalCelebration
							key={fixture.id}
							fixtureId={fixture.id}
							viewerPick={viewerPick}
						>
							<LiveFixtureCard
								fixture={fixture}
								isMyPick={Boolean(viewerPick)}
								now={now}
							/>
						</GoalCelebration>
					)
				})}
			</div>
			{reconnecting && (
				<div className="shrink-0 pt-1">
					<ReconnectingChip />
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/live/live-score-ticker.tsx
git commit -m "feat(live): add LiveScoreTicker composition"
```

---

## Part D — Integration with existing views

### Task 10: Wire LiveProvider + Ticker into GameDetailView

**Files:**
- Modify: `src/components/game/game-detail-view.tsx`

Wrap the rendered children in `<LiveProvider gameId={gameId}>` and mount `<LiveScoreTicker />` above the existing content.

- [ ] **Step 1: Read the current component**

Run: `cat src/components/game/game-detail-view.tsx | head -80`

- [ ] **Step 2: Import LiveProvider + LiveScoreTicker at the top of the file**

```typescript
import { LiveProvider } from '@/components/live/live-provider'
import { LiveScoreTicker } from '@/components/live/live-score-ticker'
```

- [ ] **Step 3: Wrap the root element in `<LiveProvider gameId={game.id}>` and mount `<LiveScoreTicker />` as the first child inside the existing outer container**

Replace the outer return with:

```tsx
return (
	<LiveProvider gameId={game.id}>
		<div className="flex flex-col gap-6">
			<LiveScoreTicker />
			<GameHeader /* existing props */ />
			{/* rest of existing content unchanged */}
		</div>
	</LiveProvider>
)
```

(Engineer: keep all existing children exactly as they were — this only adds `<LiveProvider>` as outer wrapper and `<LiveScoreTicker />` as first child.)

- [ ] **Step 4: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/game-detail-view.tsx
git commit -m "feat(game): mount LiveProvider and LiveScoreTicker on game detail"
```

---

### Task 11: Enrich `CupGrid` with live state

**Files:**
- Modify: `src/components/standings/cup-grid.tsx`

Add optional `live?: LivePayload` prop. When present:
- Apply blue left-border + "LIVE" pulse on the viewer's row when their pick's fixture is live.
- Show green `+1` / red `-1` score-bump badges on pick cells when a matching `GoalEvent` fires within the last 1.5s.
- Opacity-fade row + "OUT R{n}" badge when `PickSettlementEvent` with `settled-loss` fires for that player AND their livesRemaining in `live.players` is 0.

- [ ] **Step 1: Read the current file**

Run: `cat src/components/standings/cup-grid.tsx`

- [ ] **Step 2: Add live prop, subscribe to events, apply classes**

Add to `CupGridProps`:

```typescript
import type { LivePayload } from '@/lib/live/types'
import { useLiveGame } from '@/components/live/use-live-game'

export interface CupGridProps {
	data: CupStandingsData
	live?: LivePayload
}
```

Inside `CupGrid` body, just before the existing row rendering:

```typescript
const liveCtx = useLiveGame()
const now = Date.now()
const RECENT_MS = 1500
const recentGoalByFixture = new Map<string, { side: 'home' | 'away'; id: string }>()
for (const ev of liveCtx.events.goals) {
	if (now - ev.observedAt <= RECENT_MS) {
		recentGoalByFixture.set(ev.fixtureId, { side: ev.side, id: ev.id })
	}
}
const eliminatedGpIds = new Set<string>()
for (const ev of liveCtx.events.settlements) {
	if (ev.result !== 'settled-loss') continue
	const p = liveCtx.payload?.players.find((pp) => pp.id === ev.gamePlayerId)
	if (p && p.livesRemaining === 0) eliminatedGpIds.add(ev.gamePlayerId)
}
const viewerGp = liveCtx.payload?.players.find((p) => p.userId === liveCtx.payload?.viewerUserId)
const viewerPickFixture = liveCtx.payload?.picks.find(
	(pk) => pk.gamePlayerId === viewerGp?.id && pk.fixtureId,
)?.fixtureId
const viewerFixtureState = viewerPickFixture
	? liveCtx.payload?.fixtures.find((f) => f.id === viewerPickFixture)?.status
	: undefined
const viewerRowIsLive = viewerFixtureState === 'live' || viewerFixtureState === 'halftime'
```

On the row rendering, annotate:

```tsx
<div
	data-gpid={player.gamePlayerId}
	className={cn(
		/* existing classes */,
		player.gamePlayerId === viewerGp?.id && viewerRowIsLive &&
			'border-l-4 border-l-primary bg-gradient-to-r from-primary/10 to-transparent pl-2',
		eliminatedGpIds.has(player.gamePlayerId) &&
			'opacity-45 transition-opacity duration-[400ms]',
	)}
>
	<span className="name">
		{player.name}
		{player.gamePlayerId === viewerGp?.id && viewerRowIsLive && (
			<span className="ml-1.5 rounded-sm bg-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase text-primary animate-[pulse_1.4s_ease-in-out_infinite]">
				LIVE
			</span>
		)}
		{eliminatedGpIds.has(player.gamePlayerId) && (
			<span className="ml-1.5 rounded-sm border border-[#ef4444] px-1 py-0.5 text-[9px] font-extrabold uppercase text-[#ef4444]">
				OUT R{liveCtx.payload?.roundId ? '' : ''}
			</span>
		)}
	</span>
	{/* existing cells — each pick cell wrapped to show score-bump if the pick's fixtureId matches recentGoalByFixture */}
</div>
```

(Engineer: the exact structure of existing cup-grid markup must be preserved; these additions are overlays only.)

- [ ] **Step 3: Typecheck + run tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; tests still pass (no new tests — visual enrichment).

- [ ] **Step 4: Commit**

```bash
git add src/components/standings/cup-grid.tsx
git commit -m "feat(standings): enrich cup-grid with live pick-row state"
```

---

### Task 12: Enrich `CupLadder` with live state

**Files:**
- Modify: `src/components/standings/cup-ladder.tsx`

Same pattern as Task 11. Accept `live?: LivePayload`; for each live fixture card in the ladder, override the stored score with the live score; when a `GoalEvent` matches a ladder fixture, flash the backer group border.

- [ ] **Step 1: Read + add prop**

```typescript
import type { LivePayload } from '@/lib/live/types'
import { useLiveGame } from '@/components/live/use-live-game'

export interface CupLadderProps {
	data: CupLadderData
	live?: LivePayload
}
```

- [ ] **Step 2: Subscribe + override**

Inside the component:

```typescript
const { payload, events } = useLiveGame()
const liveFixtureById = new Map(payload?.fixtures.map((f) => [f.id, f]) ?? [])
const recentGoalByFixture = new Map<string, number>()
const now = Date.now()
for (const ev of events.goals) {
	if (now - ev.observedAt <= 1500) recentGoalByFixture.set(ev.fixtureId, ev.observedAt)
}
```

For each fixture card rendered, if `liveFixtureById.has(fixture.id)`, display live scores instead of stored ones, and if `recentGoalByFixture.has(fixture.id)`, add the flashing border class for ~1.5s.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/standings/cup-ladder.tsx
git commit -m "feat(standings): enrich cup-ladder with live fixture overrides"
```

---

### Task 13: Enrich `CupTimeline` with live state

**Files:**
- Modify: `src/components/standings/cup-timeline.tsx`

Same pattern. Accept `live?: LivePayload`; when a `PickSettlementEvent` fires for a player, the matching timeline slot gets the elimination styling applied for the rest of the render.

- [ ] **Step 1: Add prop + subscribe**

```typescript
import type { LivePayload } from '@/lib/live/types'
import { useLiveGame } from '@/components/live/use-live-game'

export interface CupTimelineProps {
	data: CupLadderData
	live?: LivePayload
}
```

Inside component:

```typescript
const { events } = useLiveGame()
const eliminatedGpIds = new Set(
	events.settlements.filter((ev) => ev.result === 'settled-loss').map((ev) => ev.gamePlayerId),
)
```

Apply `opacity-45` class to eliminated rows.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/standings/cup-timeline.tsx
git commit -m "feat(standings): enrich cup-timeline with live elimination state"
```

---

### Task 14: Thread `live` through `CupStandings` tab wrapper

**Files:**
- Modify: `src/components/standings/cup-standings.tsx`

Add `live?: LivePayload` prop; pass it to whichever tab's component is active.

- [ ] **Step 1: Implement**

```typescript
import type { LivePayload } from '@/lib/live/types'

export interface CupStandingsProps {
	data: CupLadderData
	onShare?: () => void
	live?: LivePayload
}

// in render:
{viewMode === 'ladder' && <CupLadder data={data} live={live} />}
{viewMode === 'grid' && <CupGrid data={data} live={live} />}
{viewMode === 'timeline' && <CupTimeline data={data} live={live} />}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/standings/cup-standings.tsx
git commit -m "feat(standings): thread live prop through cup-standings tabs"
```

---

### Task 15: Enrich `TurboStandings` + `ProgressGrid`

**Files:**
- Modify: `src/components/game/turbo-standings.tsx`
- Modify: `src/components/standings/progress-grid.tsx`

Same live-prop pattern as Tasks 11-13: viewer-row border when pick fixture is live, score-bump badges on pick cells with recent goals, opacity-fade on elimination events.

- [ ] **Step 1: Turbo standings**

```typescript
import type { LivePayload } from '@/lib/live/types'
import { useLiveGame } from '@/components/live/use-live-game'

export interface TurboStandingsProps {
	data: TurboStandingsData
	live?: LivePayload
}
```

Add the same subscriber block as in Task 11; apply the same viewer-row + eliminated classes on each player row.

- [ ] **Step 2: Progress grid**

Same addition: `live?: LivePayload`, subscribe to hook, apply viewer-row enrichment + elimination fade.

- [ ] **Step 3: Typecheck + run tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: tsc clean; tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/turbo-standings.tsx src/components/standings/progress-grid.tsx
git commit -m "feat(standings): enrich turbo-standings and progress-grid with live state"
```

---

### Task 16: Pass `live` through from `GameDetailView`

**Files:**
- Modify: `src/components/game/game-detail-view.tsx`

`LiveProvider` owns the polled state. The child components inside it (cup/turbo/progress standings) need access via either `useLiveGame` directly (which they now do, per Tasks 11-15) OR via `live` prop threaded from `GameDetailView`. Since we're using the hook directly inside each standings component, **no prop threading is needed** — the hook reads from the surrounding `LiveProvider`.

This task confirms that by running the full test + typecheck.

- [ ] **Step 1: Typecheck + run tests + start dev**

Run:
```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

Expected: tsc clean; tests still pass.

- [ ] **Step 2: Commit (empty commit marking integration milestone)**

Skip — no code change. If helpful for branch log readability, `git commit --allow-empty -m "chore: confirm live integration via useLiveGame hook"`; otherwise skip.

---

## Part E — Server and seed

### Task 17: Bump GH Actions cron cadence

**Files:**
- Modify: `.github/workflows/live-scores.yml`

One-line change from 5-minute to 1-minute cadence. Isolated commit so it's easy to revert if it causes noise.

- [ ] **Step 1: Read current file**

Run: `cat .github/workflows/live-scores.yml`

- [ ] **Step 2: Change the cron line**

Edit `.github/workflows/live-scores.yml`:

```yaml
on:
  schedule:
    - cron: '* * * * *'
  workflow_dispatch:
```

(Was `'*/5 * * * *'`, now `'* * * * *'`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/live-scores.yml
git commit -m "chore(ci): bump live-scores cron from 5min to 1min"
```

---

### Task 18: Dev seed — mid-match cup game

**Files:**
- Modify: `scripts/seed.ts`

Add a cup-mode game whose `currentRound.fixtures` have kickoff ~15 minutes ago + status `'live'` + partial scores. Enables dev testing of the ticker, celebrations, and enrichment layers.

- [ ] **Step 1: Read current seed**

Run: `tail -80 scripts/seed.ts`

- [ ] **Step 2: Add mid-match cup block**

Near the existing cup seed block, after the "Cup Tuesday (GW7)" setup, add:

```typescript
// --- Mid-match cup game for live UI verification -------------------------
{
	const now = new Date()
	const kickoff = new Date(now.getTime() - 15 * 60_000)
	// Reuse an existing round (e.g., round 8). Mark two fixtures as live with
	// partial scores so LiveScoreTicker + enrichment can be exercised in dev.
	const liveRoundNumber = 8
	const liveRound = await db.query.round.findFirst({
		where: and(eq(round.competitionId, plCompetitionId), eq(round.number, liveRoundNumber)),
	})
	if (liveRound) {
		const roundFixtures = await db.query.fixture.findMany({
			where: eq(fixture.roundId, liveRound.id),
			limit: 2,
		})
		for (const [idx, fx] of roundFixtures.entries()) {
			await db
				.update(fixture)
				.set({
					kickoff,
					status: 'live',
					homeScore: idx === 0 ? 1 : 2,
					awayScore: idx === 0 ? 0 : 2,
				})
				.where(eq(fixture.id, fx.id))
		}
	}
}
```

(Engineer: use whatever local variable names are already in scope. This block is an additive step, not a replacement.)

- [ ] **Step 3: Run seed to verify**

Run: `just db-reset`
Expected: seed runs without error; two fixtures in round 8 now have `status: 'live'` and partial scores.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): add mid-match cup game for live UI verification"
```

---

## Part F — Verification

### Task 19: Full verification sweep

**Files:**
- None (may produce a `chore: format` commit if Biome re-writes anything)

Final pass before marking the branch ready for PR.

- [ ] **Step 1: Biome**

Run: `pnpm exec biome check --write .`
Expected: clean OR formats some files. If changed, stage and plan a chore commit at end.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 3: Full test suite**

Run: `pnpm exec vitest run`
Expected: all tests pass; count is `baseline + ~15-20` (`detectGoalDeltas` 8 cases, `detectPickSettlements` 6 cases, `deriveMatchState` 7 cases, `projectPickOutcome` 7 cases, `useLiveGame` 2 cases).

- [ ] **Step 4: Next build**

Run: `pnpm exec next build`
Expected: compile + TypeScript phases pass cleanly. "Collect page data" step may fail on missing env vars in sandbox — that's sandbox-only, not a code issue.

- [ ] **Step 5: Cron cadence check**

Run: `gh run list --workflow=live-scores.yml --limit 10`
Expected: once the workflow change lands on main, runs show 1-minute gaps. (Before merge, it's still 5 min — this check is meaningful only after merge.)

- [ ] **Step 6: Manual dev smoke (optional — requires docker)**

```bash
docker compose up -d
just db-reset
just dev
```

Navigate to the mid-match cup game's detail page. Expected:
- `<LiveScoreTicker>` renders above the header with two live cards.
- Manually run `UPDATE fixture SET home_score = home_score + 1 WHERE id = '...' AND status = 'live'` via psql, wait ~30s, observe goal celebration fires.
- Viewer row in cup standings gets blue border + LIVE pulse.

- [ ] **Step 7: Commit any formatting fixes**

If biome made changes:

```bash
git add -A
git commit -m "chore: format and smoke-fix for Phase 4c1"
```

---

## Out-of-scope reminders (tracked elsewhere)

- Scorer names / minute-level events — requires paid football-data.org tier; deferred post-WC.
- Server-side `fixture_event` table — not needed for in-session animations.
- Retroactive animations for goals before page load — users see current score on mount, no replay.
- Vercel Cron or QStash self-scheduling — considered in brainstorm, rejected for friend-group scale.
- GitHub Actions repo secrets (`CRON_SECRET`, `VERCEL_PROD_URL`) — Phase 4.5 (see `project_phase_4_5_must_haves.md`).

## Risk mitigation

- **Payload shape drift.** `src/lib/live/types.ts` is the frozen contract. If `getLivePayload` in `detail-queries.ts` ever changes shape, the consumers must update types here too — compile errors will catch this.
- **Cron log noise.** 1440 GH Actions runs/day will clutter the Actions tab. The runs continue to fail until Phase 4.5 sets secrets, so they'll mostly be red. Mitigation: filter to "failing" or "success" as needed; don't let visual noise drive additional workflow edits.
- **Event ID clash on 2+ rapid goals.** `detectGoalDeltas` emits one event per increment, IDs derived from the final score. A 0→2 jump produces `fx:home:1` and `fx:home:2` — both unique, correctly ordered, animated sequentially via the consumer's `handledIds` set.
- **Focus after 20-min absence emits many stale events.** Mitigated in `GoalCelebration` by only animating when the event is within `HOLD_MS` of the current render; older events still update scores but don't re-celebrate. The event buffer cap of 20 also limits how far back we can look.
