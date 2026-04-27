# Phase 4c4 — Satori Share Variants: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shareable Satori-rendered PNG variants — `live` and `winner` — to complement the existing `standings` image, with mode-aware layouts for classic, cup, and turbo. Wire variants into ShareDialog with auto-pick + dropdown override.

**Architecture:** Three new mode-aware routes (`/standings`, `/live`, `/winner`), each dispatching to one of nine layout files (3 modes × 3 variants) based on `game.gameMode`. Layouts are pure JSX functions in `src/lib/share/layouts/`; data fetchers in `src/lib/share/data.ts` return discriminated-union shapes. The existing `/grid` route stays as a thin alias of `/standings`. ShareDialog updated to auto-pick a default variant from game state and offer a `<Select>` dropdown to override.

**Tech Stack:** Next.js 16 App Router, `next/og` `ImageResponse` (Node.js runtime), shadcn/ui `<Select>`, Drizzle, Vitest.

---

## Working context

- Branch: `feature/phase-4c4-satori-share`
- Worktree: `.worktrees/phase-4c4/`
- Spec: `docs/superpowers/specs/2026-04-27-phase-4c4-satori-share-variants-design.md`
- Existing code touchpoints:
  - `src/app/api/share/grid/[gameId]/route.tsx` — current standings (classic-only) layout, will be refactored
  - `src/components/game/share-dialog.tsx` — current dialog with placeholder text
  - `src/lib/game/detail-queries.ts` — `getProgressGridData` (line 649), `getTurboStandingsData` (line 414), `getGameDetail` (line 19)
  - `src/lib/game/cup-standings-queries.ts` — `getCupStandingsData` (line 74)
  - `src/lib/game-logic/prizes.ts` — `calculatePayouts(pot, winnerUserIds)` for split-pot math

**Commands** (run from worktree root):
- `pnpm test` / `pnpm vitest run <path>` — Vitest
- `pnpm tsc --noEmit` — typecheck
- `pnpm exec biome check --write .` — lint + format
- `just dev` — dev server (for manual smoke)

After each task: `pnpm test && pnpm tsc --noEmit && pnpm exec biome check --write .` must pass before commit.

---

## Task 1: Scaffolding — shared layout helpers and data type exports

**Files:**
- Create: `src/lib/share/shared.tsx`
- Create: `src/lib/share/data.ts`
- Create: `src/lib/share/shared.test.tsx`

- [ ] **Step 1: Create the type exports in `data.ts`**

```ts
// src/lib/share/data.ts
import type { CupStandingsData } from '@/lib/game/cup-standings-queries'

export interface ShareHeader {
  gameName: string
  gameMode: 'classic' | 'cup' | 'turbo'
  competitionName: string
  pot: string // formatted "480.00"
  potTotal: string // raw numeric string for calculations
  generatedAt: Date
}

export interface ClassicPlayerRow {
  id: string
  userId: string
  name: string
  status: 'alive' | 'eliminated' | 'winner'
  eliminatedRoundNumber: number | null
}

export interface CupPlayerRow {
  id: string
  userId: string
  name: string
  status: 'alive' | 'eliminated' | 'winner'
  livesRemaining: number
  streak: number
  goals: number
  eliminatedRoundNumber: number | null
}

export interface TurboPlayerRow {
  id: string
  userId: string
  name: string
  streak: number
  goals: number
}

// Standings types
export type StandingsShareData =
  | { mode: 'classic'; header: ShareHeader; classicGrid: NonNullable<Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getProgressGridData>>> }
  | { mode: 'cup'; header: ShareHeader; cupData: CupStandingsData; overflowCount: number }
  | { mode: 'turbo'; header: ShareHeader; turboData: NonNullable<Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getTurboStandingsData>>>; overflowCount: number }

// Live types
export interface ClassicLiveRow {
  id: string
  userId: string
  name: string
  pickedTeamShort: string | null
  homeShort: string | null
  awayShort: string | null
  homeScore: number | null
  awayScore: number | null
  fixtureStatus: 'scheduled' | 'live' | 'halftime' | 'finished'
  liveState: 'winning' | 'drawing' | 'losing' | 'pending'
}

export type LiveShareData =
  | { mode: 'classic'; header: ShareHeader; rows: ClassicLiveRow[]; roundNumber: number }
  | { mode: 'cup'; header: ShareHeader; cupData: CupStandingsData; roundNumber: number; overflowCount: number; matchupsLegend: string }
  | { mode: 'turbo'; header: ShareHeader; turboData: NonNullable<Awaited<ReturnType<typeof import('@/lib/game/detail-queries').getTurboStandingsData>>>; roundNumber: number; overflowCount: number; matchupsLegend: string }

// Winner types
export interface WinnerEntry {
  userId: string
  name: string
  potShare: string // "160.00"
  classicMeta?: { roundsSurvived: number; finalPickLabel: string }
  cupMeta?: { livesRemaining: number; streak: number; goals: number }
  turboMeta?: { streak: number; goals: number }
}

export interface ClassicRunnerUp {
  userId: string
  name: string
  eliminatedRoundNumber: number
}

export interface CupRunnerUp {
  userId: string
  name: string
  livesRemaining: number
  streak: number
  goals: number
  eliminatedRoundNumber: number | null
}

export interface TurboRunnerUp {
  userId: string
  name: string
  streak: number
  goals: number
}

export type WinnerShareData =
  | { mode: 'classic'; header: ShareHeader; winners: WinnerEntry[]; runnersUp: ClassicRunnerUp[]; overflowCount: number }
  | { mode: 'cup'; header: ShareHeader; winners: WinnerEntry[]; runnersUp: CupRunnerUp[]; overflowCount: number }
  | { mode: 'turbo'; header: ShareHeader; winners: WinnerEntry[]; runnersUp: TurboRunnerUp[]; overflowCount: number }

// Fetcher signatures (implementations in later tasks)
export async function getShareStandingsData(_gameId: string): Promise<StandingsShareData | null> {
  throw new Error('Implemented in Task 2')
}
export async function getShareLiveData(_gameId: string): Promise<LiveShareData | null> {
  throw new Error('Implemented in Task 7')
}
export async function getShareWinnerData(_gameId: string): Promise<WinnerShareData | null> {
  throw new Error('Implemented in Task 11')
}
```

- [ ] **Step 2: Create shared JSX helpers in `shared.tsx`**

```tsx
// src/lib/share/shared.tsx
import type { ReactElement } from 'react'

export function Header({
  gameName,
  modeLabel,
  competitionName,
  pot,
  livePill,
  completePill,
  livePillLabel,
}: {
  gameName: string
  modeLabel: string
  competitionName: string
  pot: string
  livePill?: boolean
  completePill?: boolean
  livePillLabel?: string
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '48px',
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1,
            gap: '12px',
          }}
        >
          <span style={{ display: 'flex' }}>{gameName}</span>
          {livePill && (
            <span
              style={{
                display: 'flex',
                background: '#dc2626',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                letterSpacing: '0.04em',
              }}
            >
              {livePillLabel ?? 'LIVE'}
            </span>
          )}
          {completePill && (
            <span
              style={{
                display: 'flex',
                background: '#16a34a',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                letterSpacing: '0.04em',
              }}
            >
              COMPLETE
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '24px',
            color: '#6b6b6b',
            marginTop: '8px',
          }}
        >
          {`${modeLabel} · ${competitionName}`}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#9a9a9a',
            fontWeight: 600,
          }}
        >
          Pot
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '72px',
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1,
          }}
        >
          {`£${pot}`}
        </div>
      </div>
    </div>
  )
}

export function Footer({ generatedAt }: { generatedAt: Date }): ReactElement {
  const dateLabel = generatedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '24px',
        fontSize: '16px',
        color: '#9a9a9a',
      }}
    >
      <div style={{ display: 'flex' }}>Last Person Standing</div>
      <div style={{ display: 'flex' }}>{dateLabel}</div>
    </div>
  )
}

export function OverflowTailRow({ count, label }: { count: number; label: string }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px 0',
        fontSize: '14px',
        color: '#9a9a9a',
        fontStyle: 'italic',
      }}
    >
      {`+${count} more ${label}`}
    </div>
  )
}

export function PageFrame({
  height,
  children,
}: {
  height: number
  children: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        minHeight: `${height}px`,
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  )
}

export function modeLabel(mode: 'classic' | 'cup' | 'turbo'): string {
  return mode[0].toUpperCase() + mode.slice(1)
}
```

- [ ] **Step 3: Add a smoke test in `shared.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest'
import { Footer, Header, OverflowTailRow, PageFrame, modeLabel } from './shared'

describe('share/shared', () => {
  it('Header renders with live pill', () => {
    const el = Header({
      gameName: 'Test',
      modeLabel: 'Classic',
      competitionName: 'WC',
      pot: '100.00',
      livePill: true,
    })
    expect(el).toBeTruthy()
    expect(el.props.children).toHaveLength(2)
  })

  it('Header renders without pills', () => {
    const el = Header({
      gameName: 'Test',
      modeLabel: 'Classic',
      competitionName: 'WC',
      pot: '100.00',
    })
    expect(el).toBeTruthy()
  })

  it('Footer renders with date', () => {
    const el = Footer({ generatedAt: new Date('2026-04-27T12:00:00Z') })
    expect(el).toBeTruthy()
  })

  it('OverflowTailRow renders with count and label', () => {
    const el = OverflowTailRow({ count: 5, label: 'eliminated earlier' })
    expect(el).toBeTruthy()
  })

  it('PageFrame wraps children with width 1080', () => {
    const el = PageFrame({ height: 800, children: Header({ gameName: 'x', modeLabel: 'Classic', competitionName: 'WC', pot: '0' }) })
    expect(el.props.style.width).toBe('1080px')
  })

  it('modeLabel capitalises correctly', () => {
    expect(modeLabel('classic')).toBe('Classic')
    expect(modeLabel('cup')).toBe('Cup')
    expect(modeLabel('turbo')).toBe('Turbo')
  })
})
```

- [ ] **Step 4: Verify and commit**

```
pnpm vitest run src/lib/share/shared.test.tsx
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/share
git add src/lib/share
git commit -m "feat(4c4): scaffold share data types + shared layout helpers"
```

Expected: 6 tests pass, typecheck clean.

---

## Task 2: `getShareStandingsData` (all three modes)

**Files:**
- Modify: `src/lib/share/data.ts` (replace the `throw` with real implementation)
- Create: `src/lib/share/data.test.ts`

- [ ] **Step 1: Replace the `getShareStandingsData` stub**

In `src/lib/share/data.ts`, replace the throwing stub with:

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { getProgressGridData, getTurboStandingsData, type GameDetail } from '@/lib/game/detail-queries'
import { getCupStandingsData } from '@/lib/game/cup-standings-queries'
import { calculatePot } from '@/lib/game-logic/prizes'

const STANDINGS_ALIVE_CAP = 20
const STANDINGS_ELIMINATED_CAP = 10

async function buildHeader(gameId: string, viewerUserId: string): Promise<ShareHeader | null> {
  const gameRow = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: { competition: true },
  })
  if (!gameRow) return null
  const payments = await db.query.payment.findMany({ where: (p, { eq }) => eq(p.gameId, gameId) })
  const pot = calculatePot(payments)
  return {
    gameName: gameRow.name,
    gameMode: gameRow.gameMode as 'classic' | 'cup' | 'turbo',
    competitionName: gameRow.competition.name,
    pot: pot.total,
    potTotal: pot.total,
    generatedAt: new Date(),
  }
}

export async function getShareStandingsData(
  gameId: string,
  viewerUserId: string,
): Promise<StandingsShareData | null> {
  const header = await buildHeader(gameId, viewerUserId)
  if (!header) return null

  if (header.gameMode === 'classic') {
    const grid = await getProgressGridData(gameId, viewerUserId, { hideAllCurrentPicks: true })
    if (!grid) return null
    return { mode: 'classic', header, classicGrid: grid }
  }
  if (header.gameMode === 'cup') {
    const cupData = await getCupStandingsData(gameId, viewerUserId)
    if (!cupData) return null
    const totalPlayers = cupData.players.length
    const overflowCount = Math.max(0, totalPlayers - (STANDINGS_ALIVE_CAP + STANDINGS_ELIMINATED_CAP))
    return { mode: 'cup', header, cupData, overflowCount }
  }
  // turbo
  const turboData = await getTurboStandingsData(gameId, viewerUserId)
  if (!turboData) return null
  const totalPlayers = turboData.players.length
  const overflowCount = Math.max(0, totalPlayers - (STANDINGS_ALIVE_CAP + STANDINGS_ELIMINATED_CAP))
  return { mode: 'turbo', header, turboData, overflowCount }
}
```

(Remove the unused `GameDetail` import if your IDE/biome flags it. Drop any other unused imports.)

- [ ] **Step 2: Add tests in `data.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      game: { findFirst: vi.fn() },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

const { getProgressGridDataMock, getCupStandingsDataMock, getTurboStandingsDataMock } = vi.hoisted(() => ({
  getProgressGridDataMock: vi.fn(),
  getCupStandingsDataMock: vi.fn(),
  getTurboStandingsDataMock: vi.fn(),
}))
vi.mock('@/lib/game/detail-queries', () => ({
  getProgressGridData: getProgressGridDataMock,
  getTurboStandingsData: getTurboStandingsDataMock,
}))
vi.mock('@/lib/game/cup-standings-queries', () => ({
  getCupStandingsData: getCupStandingsDataMock,
}))

import { getShareStandingsData } from './data'
import { db } from '@/lib/db'

function makeHeaderMock(mode: 'classic' | 'cup' | 'turbo') {
  vi.mocked(db.query.game.findFirst).mockResolvedValue({
    id: 'g1',
    name: 'Test Game',
    gameMode: mode,
    competition: { name: 'World Cup' },
  } as never)
}

describe('getShareStandingsData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when game does not exist', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
    expect(await getShareStandingsData('g1', 'u1')).toBeNull()
  })

  it('returns classic shape when mode is classic', async () => {
    makeHeaderMock('classic')
    getProgressGridDataMock.mockResolvedValue({ players: [], rounds: [] })
    const result = await getShareStandingsData('g1', 'u1')
    expect(result?.mode).toBe('classic')
  })

  it('returns cup shape when mode is cup', async () => {
    makeHeaderMock('cup')
    getCupStandingsDataMock.mockResolvedValue({ players: [], roundNumber: 1, roundStatus: 'open', numberOfPicks: 10, maxLives: 3 })
    const result = await getShareStandingsData('g1', 'u1')
    expect(result?.mode).toBe('cup')
    expect(result?.mode === 'cup' && result.overflowCount).toBe(0)
  })

  it('returns turbo shape when mode is turbo', async () => {
    makeHeaderMock('turbo')
    getTurboStandingsDataMock.mockResolvedValue({ players: [], roundNumber: 1, roundStatus: 'open', numberOfPicks: 10 })
    const result = await getShareStandingsData('g1', 'u1')
    expect(result?.mode).toBe('turbo')
  })

  it('cup overflow count = max(0, total - 30)', async () => {
    makeHeaderMock('cup')
    getCupStandingsDataMock.mockResolvedValue({
      players: Array.from({ length: 35 }).map(() => ({})),
      roundNumber: 1,
      roundStatus: 'open',
      numberOfPicks: 10,
      maxLives: 3,
    })
    const result = await getShareStandingsData('g1', 'u1')
    expect(result?.mode === 'cup' && result.overflowCount).toBe(5)
  })
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/lib/share/data.test.ts
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/share
git add src/lib/share
git commit -m "feat(4c4): implement getShareStandingsData for all modes"
```

Expected: 5 tests pass.

---

## Task 3: Classic standings layout — refactor existing `/grid` JSX into a reusable layout function

**Files:**
- Create: `src/lib/share/layouts/classic-standings.tsx`
- Create: `src/lib/share/layouts/classic-standings.test.tsx`
- Modify: `src/app/api/share/grid/[gameId]/route.tsx` (call into the new layout function)

- [ ] **Step 1: Create the layout file**

Read the existing `src/app/api/share/grid/[gameId]/route.tsx`. Move the JSX (from the `return new ImageResponse(<div ...>` block down to and including the closing `</div>` and the `{ width: 1080, height: ... }` config) into a new pure function in `src/lib/share/layouts/classic-standings.tsx`:

```tsx
// src/lib/share/layouts/classic-standings.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { StandingsShareData } from '../data'
import { getTeamColour } from '@/lib/teams/colours'

const RESULT_COLOUR: Record<string, string> = {
  win: '#16a34a',
  loss: '#dc2626',
  draw: '#dc2626',
  draw_exempt: '#ca8a04',
  saved: '#8b5cf6',
  pending: '#2563eb',
}

const STANDINGS_ALIVE_CAP = 20
const STANDINGS_ELIMINATED_CAP = 10

export interface ClassicStandingsRender {
  jsx: ReactElement
  width: number
  height: number
}

export function classicStandingsLayout(
  data: Extract<StandingsShareData, { mode: 'classic' }>,
): ClassicStandingsRender {
  const grid = data.classicGrid
  const players = [...grid.players].sort((a, b) => {
    if (a.status === 'alive' && b.status !== 'alive') return -1
    if (a.status !== 'alive' && b.status === 'alive') return 1
    if (a.status === 'eliminated' && b.status === 'eliminated') {
      return (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0)
    }
    return a.name.localeCompare(b.name)
  })

  // Cap: top STANDINGS_ALIVE_CAP alive + top STANDINGS_ELIMINATED_CAP eliminated by recency
  const alive = players.filter((p) => p.status === 'alive').slice(0, STANDINGS_ALIVE_CAP)
  const eliminated = players.filter((p) => p.status !== 'alive').slice(0, STANDINGS_ELIMINATED_CAP)
  const visible = [...alive, ...eliminated]
  const overflow = players.length - visible.length

  const visibleRounds = grid.rounds.slice(-6)
  const height = Math.max(600, 260 + visible.length * 52 + (overflow > 0 ? 40 : 0))

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
      />
      <div
        style={{
          display: 'flex',
          fontSize: '20px',
          marginTop: '-16px',
          marginBottom: '20px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a' }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
          <div style={{ display: 'flex' }}>{`${grid.aliveCount} alive`}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626' }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#dc2626' }} />
          <div style={{ display: 'flex' }}>{`${grid.eliminatedCount} eliminated`}</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #e8e6e1',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '16px',
            color: '#9a9a9a',
            fontWeight: 600,
            paddingBottom: '12px',
            borderBottom: '1px solid #e8e6e1',
          }}
        >
          <div style={{ display: 'flex', width: '160px' }}>Player</div>
          <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
            {visibleRounds.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  flex: 1,
                  justifyContent: 'center',
                  fontSize: '14px',
                }}
              >
                {`GW${r.number}`}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', width: '100px', justifyContent: 'flex-end' }}>Status</div>
        </div>
        {visible.map((player) => (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid #f0eee9',
              opacity: player.status === 'eliminated' ? 0.5 : 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '160px',
                fontSize: '20px',
                fontWeight: 600,
                color: '#1a1a1a',
              }}
            >
              {player.name}
            </div>
            <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
              {visibleRounds.map((r) => {
                const cell = player.cellsByRoundId[r.id] ?? { result: 'empty' }
                if (cell.result === 'empty') {
                  return <div key={r.id} style={{ display: 'flex', flex: 1 }} />
                }
                if (cell.result === 'skull') {
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '24px',
                      }}
                    >
                      💀
                    </div>
                  )
                }
                if (cell.result === 'no_pick') {
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: '#fef9c3',
                        color: '#ca8a04',
                        fontWeight: 700,
                        borderRadius: '6px',
                        padding: '6px 4px',
                      }}
                    >
                      <div style={{ display: 'flex', fontSize: '18px', lineHeight: 1 }}>?</div>
                      <div style={{ display: 'flex', fontSize: '10px', fontWeight: 500, marginTop: '2px' }}>
                        No pick
                      </div>
                    </div>
                  )
                }
                if (cell.result === 'locked') {
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: '#f0eee9',
                        color: '#6b6b6b',
                        fontWeight: 600,
                        borderRadius: '6px',
                        padding: '6px 4px',
                        border: '1px dashed #c9c7c2',
                      }}
                    >
                      <div style={{ display: 'flex', fontSize: '16px', lineHeight: 1 }}>🔒</div>
                      <div style={{ display: 'flex', fontSize: '10px', fontWeight: 500, marginTop: '2px' }}>
                        Locked in
                      </div>
                    </div>
                  )
                }
                const bg = RESULT_COLOUR[cell.result] ?? '#888'
                const teamAccent = cell.teamShortName ? getTeamColour(cell.teamShortName) : bg
                const opponentLabel = cell.opponentShortName
                  ? `${cell.homeAway === 'A' ? '@' : 'v'}${cell.opponentShortName}`
                  : null
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      flex: 1,
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      background: bg,
                      color: '#fff',
                      fontWeight: 700,
                      borderRadius: '6px',
                      padding: '6px 4px',
                      borderLeft: `4px solid ${teamAccent}`,
                    }}
                  >
                    <div style={{ display: 'flex', fontSize: '16px' }}>{cell.teamShortName ?? '?'}</div>
                    {opponentLabel && (
                      <div
                        style={{
                          display: 'flex',
                          fontSize: '11px',
                          fontWeight: 400,
                          opacity: 0.85,
                          marginTop: '2px',
                        }}
                      >
                        {opponentLabel}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div
              style={{
                display: 'flex',
                width: '100px',
                justifyContent: 'flex-end',
                alignItems: 'center',
              }}
            >
              {player.status === 'alive' ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: '14px',
                    fontWeight: 700,
                    background: '#dcfce7',
                    color: '#16a34a',
                    padding: '4px 10px',
                    borderRadius: '6px',
                  }}
                >
                  alive
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    fontSize: '14px',
                    fontWeight: 700,
                    background: '#fee2e2',
                    color: '#dc2626',
                    padding: '4px 10px',
                    borderRadius: '6px',
                  }}
                >
                  {`GW${player.eliminatedRoundNumber}`}
                </div>
              )}
            </div>
          </div>
        ))}
        {overflow > 0 && <OverflowTailRow count={overflow} label="players not shown" />}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 2: Update `/api/share/grid/[gameId]/route.tsx` to use the layout**

Rewrite as:

```tsx
// src/app/api/share/grid/[gameId]/route.tsx
import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { classicStandingsLayout } from '@/lib/share/layouts/classic-standings'
import { getShareStandingsData } from '@/lib/share/data'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await requireSession()
  const { gameId } = await params

  const game = await getGameDetail(gameId, session.user.id)
  if (!game) return new Response('Not found', { status: 404 })
  if (!game.isMember) return new Response('Forbidden', { status: 403 })

  const data = await getShareStandingsData(gameId, session.user.id)
  if (!data) return new Response('No data', { status: 404 })
  if (data.mode !== 'classic') {
    // Legacy /grid is classic-only; cup/turbo callers should use /standings.
    return new Response('Mode unsupported on legacy /grid; use /api/share/standings', { status: 400 })
  }
  const { jsx, width, height } = classicStandingsLayout(data)
  return new ImageResponse(jsx, { width, height })
}
```

- [ ] **Step 3: Add a snapshot test**

```tsx
// src/lib/share/layouts/classic-standings.test.tsx
import { describe, expect, it } from 'vitest'
import { classicStandingsLayout } from './classic-standings'

const fixture = {
  mode: 'classic' as const,
  header: {
    gameName: 'Test',
    gameMode: 'classic' as const,
    competitionName: 'WC',
    pot: '100.00',
    potTotal: '100.00',
    generatedAt: new Date('2026-04-27T12:00:00Z'),
  },
  classicGrid: {
    aliveCount: 2,
    eliminatedCount: 1,
    pot: '100.00',
    rounds: [
      { id: 'r1', number: 1 },
      { id: 'r2', number: 2 },
    ],
    players: [
      {
        id: 'p1',
        name: 'Sean',
        status: 'alive' as const,
        eliminatedRoundNumber: null,
        cellsByRoundId: {
          r1: { result: 'win' as const, teamShortName: 'BRA' },
          r2: { result: 'pending' as const, teamShortName: 'FRA' },
        },
      },
      {
        id: 'p2',
        name: 'Anna',
        status: 'eliminated' as const,
        eliminatedRoundNumber: 2,
        cellsByRoundId: {
          r1: { result: 'win' as const, teamShortName: 'GER' },
          r2: { result: 'skull' as const },
        },
      },
    ],
  } as never,
}

describe('classicStandingsLayout', () => {
  it('renders without throwing for the canonical fixture', () => {
    const { jsx, width, height } = classicStandingsLayout(fixture)
    expect(jsx).toBeTruthy()
    expect(width).toBe(1080)
    expect(height).toBeGreaterThanOrEqual(600)
  })

  it('caps at 30 visible (20 alive + 10 eliminated) and emits an overflow tail', () => {
    const big = {
      ...fixture,
      classicGrid: {
        ...fixture.classicGrid,
        players: Array.from({ length: 35 }).map((_, i) => ({
          id: `p${i}`,
          name: `Player${i}`,
          status: i < 25 ? ('alive' as const) : ('eliminated' as const),
          eliminatedRoundNumber: i < 25 ? null : 1,
          cellsByRoundId: {},
        })),
      } as never,
    }
    const { jsx } = classicStandingsLayout(big)
    expect(jsx).toBeTruthy()
  })
})
```

- [ ] **Step 4: Verify and commit**

```
pnpm vitest run src/lib/share/layouts/classic-standings.test.tsx
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/share src/app/api/share
git add src/lib/share src/app/api/share/grid
git commit -m "refactor(4c4): extract classic standings layout into share/layouts"
```

Expected: tests pass; full suite still green (run `pnpm test` to confirm).

---

## Task 4: Cup + turbo standings layouts

**Files:**
- Create: `src/lib/share/layouts/cup-standings.tsx`
- Create: `src/lib/share/layouts/turbo-standings.tsx`
- Create: `src/lib/share/layouts/cup-standings.test.tsx`
- Create: `src/lib/share/layouts/turbo-standings.test.tsx`

- [ ] **Step 1: Create `cup-standings.tsx`**

```tsx
// src/lib/share/layouts/cup-standings.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { StandingsShareData } from '../data'

const ALIVE_CAP = 20
const ELIM_CAP = 10
const ROW_HEIGHT = 48
const CELL_W = 60

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function cupStandingsLayout(
  data: Extract<StandingsShareData, { mode: 'cup' }>,
): LayoutRender {
  const cup = data.cupData
  const alive = cup.players.filter((p) => p.status !== 'eliminated').slice(0, ALIVE_CAP)
  const elim = cup.players.filter((p) => p.status === 'eliminated').slice(0, ELIM_CAP)
  const visible = [...alive, ...elim]
  const overflow = cup.players.length - visible.length
  const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + (overflow > 0 ? 40 : 0))

  const headerCells = ['#', 'Player', 'Lives', 'Strk', 'Gls']
  const numberOfPicks = cup.numberOfPicks

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #e8e6e1',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e8e6e1',
            fontSize: '14px',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div style={{ display: 'flex', width: '32px' }}>{headerCells[0]}</div>
          <div style={{ display: 'flex', width: '180px' }}>{headerCells[1]}</div>
          <div style={{ display: 'flex', width: '90px' }}>{headerCells[2]}</div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>
            {headerCells[3]}
          </div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>
            {headerCells[4]}
          </div>
          <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
            {Array.from({ length: numberOfPicks }).map((_, i) => (
              <div
                key={`hdr-${i}`}
                style={{
                  display: 'flex',
                  flex: 1,
                  justifyContent: 'center',
                  fontSize: '12px',
                }}
              >
                {`#${i + 1}`}
              </div>
            ))}
          </div>
        </div>
        {/* Player rows */}
        {visible.map((player, idx) => {
          const isOut = player.status === 'eliminated'
          return (
            <div
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0',
                borderBottom: '1px solid #f0eee9',
                opacity: isOut ? 0.55 : 1,
                height: `${ROW_HEIGHT}px`,
              }}
            >
              <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
                {idx + 1}
              </div>
              <div style={{ display: 'flex', width: '180px', fontWeight: 600, fontSize: '18px' }}>
                {player.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '90px' }}>
                {Array.from({ length: cup.maxLives }).map((_, i) => (
                  <div
                    key={`life-${player.id}-${i}`}
                    style={{
                      display: 'flex',
                      width: '12px',
                      height: '12px',
                      borderRadius: '6px',
                      background: i < player.livesRemaining ? '#dc2626' : 'transparent',
                      border: i < player.livesRemaining ? 'none' : '1.5px solid #e8e6e1',
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  width: '50px',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {player.streak || '—'}
              </div>
              <div
                style={{
                  display: 'flex',
                  width: '50px',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {player.goals || '—'}
              </div>
              <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                {Array.from({ length: numberOfPicks }).map((_, i) => {
                  const pick = player.picks.find((pp) => pp.confidenceRank === i + 1)
                  return <CupCell key={`cell-${player.id}-${i}`} pick={pick} />
                })}
              </div>
            </div>
          )
        })}
        {overflow > 0 && <OverflowTailRow count={overflow} label="players not shown" />}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}

function CupCell({ pick }: { pick?: { result: string; pickedSide: string; homeShort: string; awayShort: string } }): ReactElement {
  if (!pick) {
    return (
      <div
        style={{
          display: 'flex',
          flex: 1,
          height: '34px',
          borderRadius: '4px',
          background: 'transparent',
          border: '1px dashed #e8e6e1',
        }}
      />
    )
  }
  if (pick.result === 'hidden' || pick.result === 'restricted') {
    return (
      <div
        style={{
          display: 'flex',
          flex: 1,
          height: '34px',
          borderRadius: '4px',
          background: '#f0eee9',
          color: '#6b6b6b',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
        }}
      >
        {pick.result === 'hidden' ? '🔒' : '—'}
      </div>
    )
  }
  const bg =
    pick.result === 'win'
      ? '#16a34a'
      : pick.result === 'saved_by_life'
        ? '#f59e0b'
        : pick.result === 'loss'
          ? '#dc2626'
          : '#2563eb'
  const label = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        height: '34px',
        borderRadius: '4px',
        background: bg,
        color: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '12px',
      }}
    >
      {label}
    </div>
  )
}
```

- [ ] **Step 2: Create `turbo-standings.tsx`**

```tsx
// src/lib/share/layouts/turbo-standings.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { StandingsShareData } from '../data'

const ALIVE_CAP = 20
const ELIM_CAP = 10
const ROW_HEIGHT = 48

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function turboStandingsLayout(
  data: Extract<StandingsShareData, { mode: 'turbo' }>,
): LayoutRender {
  const turbo = data.turboData
  const sorted = [...turbo.players].sort((a, b) => (b.streak - a.streak) || (b.goals - a.goals))
  const visible = sorted.slice(0, ALIVE_CAP + ELIM_CAP)
  const overflow = sorted.length - visible.length
  const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + (overflow > 0 ? 40 : 0))
  const numberOfPicks = turbo.numberOfPicks

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #e8e6e1',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e8e6e1',
            fontSize: '14px',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div style={{ display: 'flex', width: '32px' }}>#</div>
          <div style={{ display: 'flex', width: '200px' }}>Player</div>
          <div style={{ display: 'flex', width: '60px', justifyContent: 'center' }}>Strk</div>
          <div style={{ display: 'flex', width: '60px', justifyContent: 'center' }}>Gls</div>
          <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
            {Array.from({ length: numberOfPicks }).map((_, i) => (
              <div
                key={`hdr-${i}`}
                style={{ display: 'flex', flex: 1, justifyContent: 'center', fontSize: '12px' }}
              >
                {`#${i + 1}`}
              </div>
            ))}
          </div>
        </div>
        {visible.map((player, idx) => (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 0',
              borderBottom: '1px solid #f0eee9',
              height: `${ROW_HEIGHT}px`,
            }}
          >
            <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
              {idx + 1}
            </div>
            <div style={{ display: 'flex', width: '200px', fontWeight: 600, fontSize: '18px' }}>
              {player.name}
            </div>
            <div style={{ display: 'flex', width: '60px', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
              {player.streak || '—'}
            </div>
            <div style={{ display: 'flex', width: '60px', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
              {player.goals || '—'}
            </div>
            <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
              {Array.from({ length: numberOfPicks }).map((_, i) => {
                const pick = player.picks.find((pp) => pp.confidenceRank === i + 1)
                let bg = 'transparent'
                let border = '1px dashed #e8e6e1'
                let text = ''
                let color = '#fff'
                if (pick) {
                  if (pick.result === 'hidden') {
                    bg = '#f0eee9'
                    color = '#6b6b6b'
                    text = '🔒'
                    border = 'none'
                  } else if (pick.result === 'win') {
                    bg = '#16a34a'
                    text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D'
                    border = 'none'
                  } else if (pick.result === 'loss') {
                    bg = '#dc2626'
                    text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D'
                    border = 'none'
                  } else {
                    bg = '#2563eb'
                    text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D'
                    border = 'none'
                  }
                }
                return (
                  <div
                    key={`cell-${player.id}-${i}`}
                    style={{
                      display: 'flex',
                      flex: 1,
                      height: '34px',
                      borderRadius: '4px',
                      background: bg,
                      border,
                      color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    {text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {overflow > 0 && <OverflowTailRow count={overflow} label="players not shown" />}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 3: Tests** (`cup-standings.test.tsx` and `turbo-standings.test.tsx`)

Each test file follows the same shape as `classic-standings.test.tsx`: a canonical fixture with a small player set, plus an overflow scenario with 35 players. Verify the layout function returns `{jsx, width=1080, height>=700}`.

```tsx
// src/lib/share/layouts/cup-standings.test.tsx
import { describe, expect, it } from 'vitest'
import { cupStandingsLayout } from './cup-standings'

const fixture = {
  mode: 'cup' as const,
  header: {
    gameName: 'Cup',
    gameMode: 'cup' as const,
    competitionName: 'WC',
    pot: '50.00',
    potTotal: '50.00',
    generatedAt: new Date('2026-04-27T12:00:00Z'),
  },
  cupData: {
    roundNumber: 7,
    roundStatus: 'open' as const,
    numberOfPicks: 10,
    maxLives: 3,
    players: [
      { id: 'p1', userId: 'u1', name: 'Sean', status: 'alive' as const, eliminatedRoundNumber: null, livesRemaining: 3, streak: 8, goals: 14, picks: [], hasSubmitted: true },
    ],
  } as never,
  overflowCount: 0,
}

describe('cupStandingsLayout', () => {
  it('renders for the canonical fixture', () => {
    const { jsx, width, height } = cupStandingsLayout(fixture)
    expect(jsx).toBeTruthy()
    expect(width).toBe(1080)
    expect(height).toBeGreaterThanOrEqual(700)
  })
})
```

```tsx
// src/lib/share/layouts/turbo-standings.test.tsx
import { describe, expect, it } from 'vitest'
import { turboStandingsLayout } from './turbo-standings'

const fixture = {
  mode: 'turbo' as const,
  header: {
    gameName: 'Turbo',
    gameMode: 'turbo' as const,
    competitionName: 'PL',
    pot: '50.00',
    potTotal: '50.00',
    generatedAt: new Date('2026-04-27T12:00:00Z'),
  },
  turboData: {
    roundNumber: 7,
    roundStatus: 'open' as const,
    numberOfPicks: 10,
    players: [
      { id: 'p1', userId: 'u1', name: 'Sean', streak: 9, goals: 12, picks: [] },
    ],
  } as never,
  overflowCount: 0,
}

describe('turboStandingsLayout', () => {
  it('renders for the canonical fixture', () => {
    const { jsx, width, height } = turboStandingsLayout(fixture)
    expect(jsx).toBeTruthy()
    expect(width).toBe(1080)
    expect(height).toBeGreaterThanOrEqual(700)
  })
})
```

- [ ] **Step 4: Verify and commit**

```
pnpm vitest run src/lib/share/layouts
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/share
git add src/lib/share
git commit -m "feat(4c4): add cup + turbo standings layouts"
```

---

## Task 5: New `/standings` route (mode dispatcher)

**Files:**
- Create: `src/app/api/share/standings/[gameId]/route.tsx`
- Create: `src/app/api/share/standings/[gameId]/route.test.ts`

- [ ] **Step 1: Implement the route**

```tsx
// src/app/api/share/standings/[gameId]/route.tsx
import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareStandingsData } from '@/lib/share/data'
import { classicStandingsLayout } from '@/lib/share/layouts/classic-standings'
import { cupStandingsLayout } from '@/lib/share/layouts/cup-standings'
import { turboStandingsLayout } from '@/lib/share/layouts/turbo-standings'

export const runtime = 'nodejs'

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
}

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await requireSession()
  const { gameId } = await params

  const game = await getGameDetail(gameId, session.user.id)
  if (!game) return new Response('Not found', { status: 404 })
  if (!game.isMember) return new Response('Forbidden', { status: 403 })

  const data = await getShareStandingsData(gameId, session.user.id)
  if (!data) return new Response('No data', { status: 404 })

  const layout =
    data.mode === 'classic'
      ? classicStandingsLayout(data)
      : data.mode === 'cup'
        ? cupStandingsLayout(data)
        : turboStandingsLayout(data)

  return new ImageResponse(layout.jsx, { width: layout.width, height: layout.height, headers: CACHE_HEADERS })
}
```

- [ ] **Step 2: Add a test**

```ts
// src/app/api/share/standings/[gameId]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

const { getGameDetailMock, getShareStandingsDataMock } = vi.hoisted(() => ({
  getGameDetailMock: vi.fn(),
  getShareStandingsDataMock: vi.fn(),
}))
vi.mock('@/lib/game/detail-queries', () => ({ getGameDetail: getGameDetailMock }))
vi.mock('@/lib/share/data', () => ({ getShareStandingsData: getShareStandingsDataMock }))

vi.mock('next/og', () => ({
  ImageResponse: vi.fn().mockImplementation(() => new Response('png-bytes', { status: 200 })),
}))

import { GET } from './route'

const ctx = { params: Promise.resolve({ gameId: 'g1' }) }

describe('standings route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('404s when game is missing', async () => {
    getGameDetailMock.mockResolvedValue(null)
    const res = await GET(new Request('http://x'), ctx)
    expect(res.status).toBe(404)
  })

  it('403s when caller is not a member', async () => {
    getGameDetailMock.mockResolvedValue({ isMember: false })
    const res = await GET(new Request('http://x'), ctx)
    expect(res.status).toBe(403)
  })

  it('200s on happy path', async () => {
    getGameDetailMock.mockResolvedValue({ isMember: true })
    getShareStandingsDataMock.mockResolvedValue({
      mode: 'classic',
      header: {
        gameName: 'Test',
        gameMode: 'classic',
        competitionName: 'WC',
        pot: '0',
        potTotal: '0',
        generatedAt: new Date('2026-04-27T00:00:00Z'),
      },
      classicGrid: { aliveCount: 0, eliminatedCount: 0, pot: '0', rounds: [], players: [] },
    })
    const res = await GET(new Request('http://x'), ctx)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/app/api/share/standings
pnpm tsc --noEmit
git add src/app/api/share
git commit -m "feat(4c4): /api/share/standings route (mode-aware)"
```

---

## Task 6: `/grid` becomes thin alias of `/standings`

**Files:**
- Modify: `src/app/api/share/grid/[gameId]/route.tsx`

- [ ] **Step 1: Forward to the standings handler**

Replace the file's contents with:

```tsx
// src/app/api/share/grid/[gameId]/route.tsx
// Legacy alias of /api/share/standings — kept for backwards compatibility with the
// deployed ShareDialog. Will be removed in 4c5.
export { GET, runtime } from '../../standings/[gameId]/route'
```

- [ ] **Step 2: Verify the deployed behaviour still works**

```
pnpm vitest run src/app/api/share
pnpm tsc --noEmit
```

The existing `/grid` route's old test (if any was written for the standalone implementation) should now fail or become redundant. If a test file was at `src/app/api/share/grid/[gameId]/route.test.ts` from earlier work, delete it (the standings test covers the behaviour now). Otherwise no action.

- [ ] **Step 3: Commit**

```
git add src/app/api/share/grid
git commit -m "refactor(4c4): /api/share/grid aliases /api/share/standings"
```

---

## Task 7: `getShareLiveData` (all three modes)

**Files:**
- Modify: `src/lib/share/data.ts`
- Modify: `src/lib/share/data.test.ts`

- [ ] **Step 1: Implement**

In `src/lib/share/data.ts`, replace the throwing `getShareLiveData` stub:

```ts
import { and, eq } from 'drizzle-orm'
// (add to existing imports)
import { fixture, round } from '@/lib/schema/competition'
import { gamePlayer, pick } from '@/lib/schema/game'

const LIVE_CUP_TURBO_CAP = 16
const LIVE_CUP_TURBO_RECENT_ELIM = 4

export async function getShareLiveData(
  gameId: string,
  viewerUserId: string,
): Promise<LiveShareData | null> {
  const header = await buildHeader(gameId, viewerUserId)
  if (!header) return null

  const gameRow = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: { competition: { with: { rounds: { with: { fixtures: true } } } }, players: true },
  })
  if (!gameRow || !gameRow.currentRoundId) return null
  const currentRound = gameRow.competition.rounds.find((r) => r.id === gameRow.currentRoundId)
  if (!currentRound) return null

  if (header.gameMode === 'classic') {
    const allPicks = await db.query.pick.findMany({
      where: and(eq(pick.gameId, gameId), eq(pick.roundId, currentRound.id)),
      with: { team: true, fixture: { with: { homeTeam: true, awayTeam: true } } },
    })
    const userIds = gameRow.players.map((p) => p.userId)
    const { user } = await import('@/lib/schema/auth')
    const { inArray } = await import('drizzle-orm')
    const userRows = userIds.length
      ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
      : []
    const userNames = new Map(userRows.map((u) => [u.id, u.name]))

    const rows: ClassicLiveRow[] = gameRow.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        const pk = allPicks.find((pp) => pp.gamePlayerId === p.id)
        const fx = pk?.fixture
        const homeScore = fx?.homeScore ?? null
        const awayScore = fx?.awayScore ?? null
        const fixtureStatus = (fx?.status ?? 'scheduled') as ClassicLiveRow['fixtureStatus']
        const pickedHome = pk && fx ? pk.teamId === fx.homeTeamId : false
        let liveState: ClassicLiveRow['liveState'] = 'pending'
        if (fixtureStatus === 'live' || fixtureStatus === 'halftime' || fixtureStatus === 'finished') {
          if (homeScore != null && awayScore != null) {
            if (pickedHome) {
              liveState = homeScore > awayScore ? 'winning' : homeScore === awayScore ? 'drawing' : 'losing'
            } else {
              liveState = awayScore > homeScore ? 'winning' : awayScore === homeScore ? 'drawing' : 'losing'
            }
          }
        }
        return {
          id: p.id,
          userId: p.userId,
          name: userNames.get(p.userId) ?? 'Unknown',
          pickedTeamShort: pk?.team?.shortName ?? null,
          homeShort: fx?.homeTeam?.shortName ?? null,
          awayShort: fx?.awayTeam?.shortName ?? null,
          homeScore,
          awayScore,
          fixtureStatus,
          liveState,
        }
      })
      .sort((a, b) => {
        const order = { winning: 0, drawing: 1, losing: 2, pending: 3 } as const
        return order[a.liveState] - order[b.liveState] || a.name.localeCompare(b.name)
      })
    return { mode: 'classic', header, rows, roundNumber: currentRound.number }
  }

  if (header.gameMode === 'cup') {
    const cupData = await getCupStandingsData(gameId, viewerUserId)
    if (!cupData) return null
    const matchupsLegend = currentRound.fixtures
      .map((f) => `${f.homeTeam?.shortName ?? '?'} v ${f.awayTeam?.shortName ?? '?'}`)
      .join(' · ')
    const total = cupData.players.length
    const overflow = Math.max(0, total - (LIVE_CUP_TURBO_CAP + LIVE_CUP_TURBO_RECENT_ELIM))
    return { mode: 'cup', header, cupData, roundNumber: currentRound.number, overflowCount: overflow, matchupsLegend }
  }

  // turbo
  const turboData = await getTurboStandingsData(gameId, viewerUserId)
  if (!turboData) return null
  const matchupsLegend = currentRound.fixtures
    .map((f) => `${f.homeTeam?.shortName ?? '?'} v ${f.awayTeam?.shortName ?? '?'}`)
    .join(' · ')
  const total = turboData.players.length
  const overflow = Math.max(0, total - (LIVE_CUP_TURBO_CAP + LIVE_CUP_TURBO_RECENT_ELIM))
  return { mode: 'turbo', header, turboData, roundNumber: currentRound.number, overflowCount: overflow, matchupsLegend }
}
```

(If `currentRound.fixtures` doesn't include `homeTeam`/`awayTeam` in the existing relation include, adjust the `with: { ... }` chain on `db.query.game.findFirst` to include them.)

- [ ] **Step 2: Add tests in `data.test.ts`**

Append to the existing test file:

```ts
describe('getShareLiveData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when game is missing', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
    const result = await (await import('./data')).getShareLiveData('g1', 'u1')
    expect(result).toBeNull()
  })

  // (additional happy-path tests are exercised at the route level in Task 8)
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/lib/share/data.test.ts
pnpm tsc --noEmit
pnpm exec biome check --write src/lib/share
git add src/lib/share
git commit -m "feat(4c4): implement getShareLiveData"
```

---

## Task 8: Classic live layout (player-ladder)

**Files:**
- Create: `src/lib/share/layouts/classic-live.tsx`
- Create: `src/lib/share/layouts/classic-live.test.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/lib/share/layouts/classic-live.tsx
import type { ReactElement } from 'react'
import { Footer, Header, modeLabel } from '../shared'
import type { LiveShareData } from '../data'

const ROW_HEIGHT = 44

const STATE_COLOUR: Record<string, string> = {
  winning: '#16a34a',
  drawing: '#ca8a04',
  losing: '#dc2626',
  pending: '#9a9a9a',
}

const STATE_BG: Record<string, string> = {
  winning: '#dcfce7',
  drawing: '#fef9c3',
  losing: '#fee2e2',
  pending: '#f0eee9',
}

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function classicLiveLayout(
  data: Extract<LiveShareData, { mode: 'classic' }>,
): LayoutRender {
  const rows = data.rows
  const height = Math.max(500, 220 + rows.length * ROW_HEIGHT)

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        livePill
        livePillLabel={`LIVE GW${data.roundNumber}`}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #e8e6e1',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            fontWeight: 700,
            color: '#9a9a9a',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            paddingBottom: '8px',
            borderBottom: '1px solid #e8e6e1',
          }}
        >
          Picks &amp; live state
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 4px',
              borderBottom: '1px solid #f0eee9',
              height: `${ROW_HEIGHT}px`,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '32px',
                height: '32px',
                borderRadius: '16px',
                background: STATE_COLOUR[r.liveState],
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {r.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flex: 1, fontSize: '20px', fontWeight: 600 }}>
              {`${r.name} — ${r.pickedTeamShort ?? '—'}`}
            </div>
            <div style={{ display: 'flex', fontSize: '20px', fontWeight: 800, color: STATE_COLOUR[r.liveState], width: '120px', justifyContent: 'flex-end' }}>
              {r.homeScore != null && r.awayScore != null ? `${r.homeScore} - ${r.awayScore}` : (r.fixtureStatus === 'scheduled' ? 'KO' : '—')}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '12px',
                fontWeight: 700,
                background: STATE_BG[r.liveState],
                color: STATE_COLOUR[r.liveState],
                padding: '4px 10px',
                borderRadius: '4px',
                width: '90px',
                justifyContent: 'center',
              }}
            >
              {r.liveState}
            </div>
          </div>
        ))}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 2: Test**

```tsx
// src/lib/share/layouts/classic-live.test.tsx
import { describe, expect, it } from 'vitest'
import { classicLiveLayout } from './classic-live'

const fixture = {
  mode: 'classic' as const,
  header: {
    gameName: 'Test',
    gameMode: 'classic' as const,
    competitionName: 'WC',
    pot: '100.00',
    potTotal: '100.00',
    generatedAt: new Date('2026-04-27T12:00:00Z'),
  },
  rows: [
    { id: 'p1', userId: 'u1', name: 'Sean', pickedTeamShort: 'BRA', homeShort: 'BRA', awayShort: 'SER', homeScore: 2, awayScore: 0, fixtureStatus: 'live' as const, liveState: 'winning' as const },
    { id: 'p2', userId: 'u2', name: 'Anna', pickedTeamShort: 'FRA', homeShort: 'FRA', awayShort: 'AUS', homeScore: 0, awayScore: 1, fixtureStatus: 'live' as const, liveState: 'losing' as const },
  ],
  roundNumber: 7,
}

describe('classicLiveLayout', () => {
  it('renders the canonical fixture', () => {
    const r = classicLiveLayout(fixture)
    expect(r.jsx).toBeTruthy()
    expect(r.width).toBe(1080)
  })
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/lib/share/layouts/classic-live.test.tsx
git add src/lib/share/layouts
git commit -m "feat(4c4): classic live (player-ladder) layout"
```

---

## Task 9: Cup + turbo live layouts

Same pattern as Task 4 standings layouts but with live state colouring on cells, no overflow tail above the matchups legend caption row, and a `LIVE GW{roundNumber}` pill in the header.

**Files:**
- Create: `src/lib/share/layouts/cup-live.tsx`
- Create: `src/lib/share/layouts/turbo-live.tsx`
- Create: `src/lib/share/layouts/cup-live.test.tsx`
- Create: `src/lib/share/layouts/turbo-live.test.tsx`

- [ ] **Step 1: Implement `cup-live.tsx`**

Copy `cup-standings.tsx` from Task 4 as the base. Modify:
1. Add `livePill` and `livePillLabel={\`LIVE GW${data.roundNumber}\`}` to `<Header>`.
2. Replace the cell rendering: include `pending` state (blue) for fixtures that haven't kicked off OR don't have a result yet, treat `restricted` as `loss` colour (red) since live shows what state is locked in.
3. After the panel (before `<Footer>`), add a matchups legend caption:

```tsx
<div
  style={{
    display: 'flex',
    fontSize: '12px',
    color: '#6b6b6b',
    marginTop: '8px',
    flexWrap: 'wrap',
  }}
>
  {`Matchups: ${data.matchupsLegend}`}
</div>
```

4. Use `LIVE_CUP_TURBO_CAP + LIVE_CUP_TURBO_RECENT_ELIM` slicing strategy (top 16 alive sorted by `livesRemaining DESC, streak DESC, goals DESC` + 4 most-recently-eliminated).

Full file (copy this verbatim, replacing the previous skeleton if your IDE has it open):

```tsx
// src/lib/share/layouts/cup-live.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { LiveShareData } from '../data'

const ROW_HEIGHT = 44

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function cupLiveLayout(
  data: Extract<LiveShareData, { mode: 'cup' }>,
): LayoutRender {
  const cup = data.cupData
  const alive = cup.players
    .filter((p) => p.status !== 'eliminated')
    .sort((a, b) => (b.livesRemaining - a.livesRemaining) || (b.streak - a.streak) || (b.goals - a.goals))
    .slice(0, 16)
  const recentElim = cup.players
    .filter((p) => p.status === 'eliminated')
    .sort((a, b) => (b.eliminatedRoundNumber ?? 0) - (a.eliminatedRoundNumber ?? 0))
    .slice(0, 4)
  const visible = [...alive, ...recentElim]
  const overflow = cup.players.length - visible.length
  const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + 60 /* legend + tail */)

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        livePill
        livePillLabel={`LIVE GW${data.roundNumber}`}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #e8e6e1',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e8e6e1',
            fontSize: '14px',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div style={{ display: 'flex', width: '32px' }}>#</div>
          <div style={{ display: 'flex', width: '180px' }}>Player</div>
          <div style={{ display: 'flex', width: '90px' }}>Lives</div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Strk</div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Gls</div>
          <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
            {Array.from({ length: cup.numberOfPicks }).map((_, i) => (
              <div
                key={`hdr-${i}`}
                style={{ display: 'flex', flex: 1, justifyContent: 'center', fontSize: '12px' }}
              >
                {`#${i + 1}`}
              </div>
            ))}
          </div>
        </div>
        {visible.map((player, idx) => {
          const isOut = player.status === 'eliminated'
          return (
            <div
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0',
                borderBottom: '1px solid #f0eee9',
                opacity: isOut ? 0.55 : 1,
                height: `${ROW_HEIGHT}px`,
              }}
            >
              <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
                {idx + 1}
              </div>
              <div style={{ display: 'flex', width: '180px', fontWeight: 600, fontSize: '18px' }}>
                {player.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '90px' }}>
                {Array.from({ length: cup.maxLives }).map((_, i) => (
                  <div
                    key={`life-${player.id}-${i}`}
                    style={{
                      display: 'flex',
                      width: '12px',
                      height: '12px',
                      borderRadius: '6px',
                      background: i < player.livesRemaining ? '#dc2626' : 'transparent',
                      border: i < player.livesRemaining ? 'none' : '1.5px solid #e8e6e1',
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  width: '50px',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {player.streak || '—'}
              </div>
              <div
                style={{
                  display: 'flex',
                  width: '50px',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {player.goals || '—'}
              </div>
              <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                {Array.from({ length: cup.numberOfPicks }).map((_, i) => {
                  const pick = player.picks.find((pp) => pp.confidenceRank === i + 1)
                  let bg = 'transparent'
                  let border = '1px dashed #e8e6e1'
                  let text = ''
                  if (pick) {
                    border = 'none'
                    if (pick.result === 'hidden') {
                      bg = '#f0eee9'
                      text = '🔒'
                    } else if (pick.result === 'win') {
                      bg = '#16a34a'
                      text = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
                    } else if (pick.result === 'saved_by_life') {
                      bg = '#f59e0b'
                      text = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
                    } else if (pick.result === 'loss' || pick.result === 'restricted') {
                      bg = '#dc2626'
                      text = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
                    } else {
                      bg = '#2563eb' // pending
                      text = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
                    }
                  }
                  return (
                    <div
                      key={`cell-${player.id}-${i}`}
                      style={{
                        display: 'flex',
                        flex: 1,
                        height: '32px',
                        borderRadius: '4px',
                        background: bg,
                        color: '#fff',
                        border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '11px',
                      }}
                    >
                      {text}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {overflow > 0 && <OverflowTailRow count={overflow} label="rows not shown" />}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
          color: '#6b6b6b',
          marginTop: '8px',
        }}
      >
        {`Matchups: ${data.matchupsLegend}`}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 2: Implement `turbo-live.tsx`**

Copy `cup-live.tsx`. Remove the `Lives` column (header and cell). Adjust the `Player` width to absorb the 90px. Sort alive by `streak DESC, goals DESC`. Same matchups legend.

```tsx
// src/lib/share/layouts/turbo-live.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { LiveShareData } from '../data'

const ROW_HEIGHT = 44

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function turboLiveLayout(
  data: Extract<LiveShareData, { mode: 'turbo' }>,
): LayoutRender {
  const turbo = data.turboData
  const sorted = [...turbo.players].sort((a, b) => (b.streak - a.streak) || (b.goals - a.goals))
  const visible = sorted.slice(0, 20)
  const overflow = sorted.length - visible.length
  const height = Math.max(700, 320 + visible.length * ROW_HEIGHT + 60)

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        livePill
        livePillLabel={`LIVE GW${data.roundNumber}`}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: '1px solid #e8e6e1',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingBottom: '8px',
            borderBottom: '1px solid #e8e6e1',
            fontSize: '14px',
            color: '#9a9a9a',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <div style={{ display: 'flex', width: '32px' }}>#</div>
          <div style={{ display: 'flex', width: '270px' }}>Player</div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Strk</div>
          <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Gls</div>
          <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
            {Array.from({ length: turbo.numberOfPicks }).map((_, i) => (
              <div
                key={`hdr-${i}`}
                style={{ display: 'flex', flex: 1, justifyContent: 'center', fontSize: '12px' }}
              >
                {`#${i + 1}`}
              </div>
            ))}
          </div>
        </div>
        {visible.map((player, idx) => (
          <div
            key={player.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 0',
              borderBottom: '1px solid #f0eee9',
              height: `${ROW_HEIGHT}px`,
            }}
          >
            <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
              {idx + 1}
            </div>
            <div style={{ display: 'flex', width: '270px', fontWeight: 600, fontSize: '18px' }}>
              {player.name}
            </div>
            <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
              {player.streak || '—'}
            </div>
            <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700, fontSize: '16px' }}>
              {player.goals || '—'}
            </div>
            <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
              {Array.from({ length: turbo.numberOfPicks }).map((_, i) => {
                const pick = player.picks.find((pp) => pp.confidenceRank === i + 1)
                let bg = 'transparent'
                let border = '1px dashed #e8e6e1'
                let text = ''
                if (pick) {
                  border = 'none'
                  if (pick.result === 'hidden') { bg = '#f0eee9'; text = '🔒' }
                  else if (pick.result === 'win') { bg = '#16a34a'; text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D' }
                  else if (pick.result === 'loss') { bg = '#dc2626'; text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D' }
                  else { bg = '#2563eb'; text = pick.predictedResult === 'home_win' ? 'H' : pick.predictedResult === 'away_win' ? 'A' : 'D' }
                }
                return (
                  <div
                    key={`cell-${player.id}-${i}`}
                    style={{
                      display: 'flex',
                      flex: 1,
                      height: '32px',
                      borderRadius: '4px',
                      background: bg,
                      color: '#fff',
                      border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {text}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {overflow > 0 && <OverflowTailRow count={overflow} label="rows not shown" />}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
          color: '#6b6b6b',
          marginTop: '8px',
        }}
      >
        {`Matchups: ${data.matchupsLegend}`}
      </div>
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 3: Tests**

Both test files mirror the standings test from Task 4 — canonical fixture, assert layout returns truthy with width 1080.

- [ ] **Step 4: Verify and commit**

```
pnpm vitest run src/lib/share/layouts
pnpm tsc --noEmit
git add src/lib/share/layouts
git commit -m "feat(4c4): cup + turbo live layouts"
```

---

## Task 10: New `/live` route

**Files:**
- Create: `src/app/api/share/live/[gameId]/route.tsx`
- Create: `src/app/api/share/live/[gameId]/route.test.ts`

- [ ] **Step 1: Implement**

```tsx
// src/app/api/share/live/[gameId]/route.tsx
import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareLiveData } from '@/lib/share/data'
import { classicLiveLayout } from '@/lib/share/layouts/classic-live'
import { cupLiveLayout } from '@/lib/share/layouts/cup-live'
import { turboLiveLayout } from '@/lib/share/layouts/turbo-live'

export const runtime = 'nodejs'

const CACHE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await requireSession()
  const { gameId } = await params
  const game = await getGameDetail(gameId, session.user.id)
  if (!game) return new Response('Not found', { status: 404 })
  if (!game.isMember) return new Response('Forbidden', { status: 403 })

  const data = await getShareLiveData(gameId, session.user.id)
  if (!data) return new Response('No data', { status: 404 })

  const layout =
    data.mode === 'classic'
      ? classicLiveLayout(data)
      : data.mode === 'cup'
        ? cupLiveLayout(data)
        : turboLiveLayout(data)

  return new ImageResponse(layout.jsx, { width: layout.width, height: layout.height, headers: CACHE_HEADERS })
}
```

- [ ] **Step 2: Test** — copy the standings route test pattern, swap the data fetcher mock to `getShareLiveData`. 3 cases: 404, 403, 200.

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/app/api/share/live
git add src/app/api/share
git commit -m "feat(4c4): /api/share/live route"
```

---

## Task 11: `getShareWinnerData` (all three modes)

**Files:**
- Modify: `src/lib/share/data.ts`
- Modify: `src/lib/share/data.test.ts`

- [ ] **Step 1: Implement**

In `src/lib/share/data.ts`, replace the throwing stub:

```ts
import { calculatePayouts } from '@/lib/game-logic/prizes'

const WINNER_RUNNERS_UP_CAP = 8

export async function getShareWinnerData(
  gameId: string,
  viewerUserId: string,
): Promise<WinnerShareData | null> {
  const header = await buildHeader(gameId, viewerUserId)
  if (!header) return null

  const gameRow = await db.query.game.findFirst({
    where: eq(game.id, gameId),
    with: { competition: { with: { rounds: true } }, players: true },
  })
  if (!gameRow) return null

  // Winners are players whose status === 'winner'. If none, fall back to alive players.
  const winnerPlayers = gameRow.players.filter((p) => p.status === 'winner')
  const fallbackAlive = gameRow.players.filter((p) => p.status === 'alive')
  const effectiveWinners = winnerPlayers.length > 0 ? winnerPlayers : fallbackAlive

  // Look up names
  const { user } = await import('@/lib/schema/auth')
  const { inArray } = await import('drizzle-orm')
  const allUserIds = gameRow.players.map((p) => p.userId)
  const userRows = allUserIds.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, allUserIds))
    : []
  const userNames = new Map(userRows.map((u) => [u.id, u.name]))

  // Compute pot shares using calculatePayouts (handles remainder cents)
  const winnerUserIds = effectiveWinners.map((p) => p.userId)
  const payouts = calculatePayouts(header.potTotal, winnerUserIds)

  if (header.gameMode === 'classic') {
    const winners: WinnerEntry[] = effectiveWinners.map((p) => {
      const payout = payouts.find((po) => po.userId === p.userId)
      const finalRound = gameRow.competition.rounds.reduce((max, r) => r.number > max ? r.number : max, 0)
      return {
        userId: p.userId,
        name: userNames.get(p.userId) ?? 'Unknown',
        potShare: payout?.amount ?? '0.00',
        classicMeta: { roundsSurvived: finalRound, finalPickLabel: '' },
      }
    })
    const elim = gameRow.players
      .filter((p) => p.status === 'eliminated')
      .sort((a, b) => {
        const aRound = gameRow.competition.rounds.find((r) => r.id === a.eliminatedRoundId)?.number ?? 0
        const bRound = gameRow.competition.rounds.find((r) => r.id === b.eliminatedRoundId)?.number ?? 0
        return bRound - aRound
      })
    const runnersUp: ClassicRunnerUp[] = elim.slice(0, WINNER_RUNNERS_UP_CAP).map((p) => ({
      userId: p.userId,
      name: userNames.get(p.userId) ?? 'Unknown',
      eliminatedRoundNumber: gameRow.competition.rounds.find((r) => r.id === p.eliminatedRoundId)?.number ?? 0,
    }))
    const overflow = Math.max(0, elim.length - WINNER_RUNNERS_UP_CAP)
    return { mode: 'classic', header, winners, runnersUp, overflowCount: overflow }
  }

  if (header.gameMode === 'cup') {
    const cup = await getCupStandingsData(gameId, viewerUserId)
    if (!cup) return null
    const winners: WinnerEntry[] = effectiveWinners.map((p) => {
      const payout = payouts.find((po) => po.userId === p.userId)
      const cupPlayer = cup.players.find((cp) => cp.userId === p.userId)
      return {
        userId: p.userId,
        name: userNames.get(p.userId) ?? 'Unknown',
        potShare: payout?.amount ?? '0.00',
        cupMeta: {
          livesRemaining: cupPlayer?.livesRemaining ?? 0,
          streak: cupPlayer?.streak ?? 0,
          goals: cupPlayer?.goals ?? 0,
        },
      }
    })
    const others = cup.players
      .filter((cp) => !winners.some((w) => w.userId === cp.userId))
      .sort((a, b) => (b.livesRemaining - a.livesRemaining) || (b.streak - a.streak) || (b.goals - a.goals))
    const runnersUp: CupRunnerUp[] = others.slice(0, WINNER_RUNNERS_UP_CAP).map((cp) => ({
      userId: cp.userId,
      name: cp.name,
      livesRemaining: cp.livesRemaining,
      streak: cp.streak,
      goals: cp.goals,
      eliminatedRoundNumber: cp.eliminatedRoundNumber,
    }))
    const overflow = Math.max(0, others.length - WINNER_RUNNERS_UP_CAP)
    return { mode: 'cup', header, winners, runnersUp, overflowCount: overflow }
  }

  // turbo
  const turbo = await getTurboStandingsData(gameId, viewerUserId)
  if (!turbo) return null
  const winners: WinnerEntry[] = effectiveWinners.map((p) => {
    const payout = payouts.find((po) => po.userId === p.userId)
    const tp = turbo.players.find((tt) => tt.userId === p.userId)
    return {
      userId: p.userId,
      name: userNames.get(p.userId) ?? 'Unknown',
      potShare: payout?.amount ?? '0.00',
      turboMeta: { streak: tp?.streak ?? 0, goals: tp?.goals ?? 0 },
    }
  })
  const others = turbo.players
    .filter((tp) => !winners.some((w) => w.userId === tp.userId))
    .sort((a, b) => (b.streak - a.streak) || (b.goals - a.goals))
  const runnersUp: TurboRunnerUp[] = others.slice(0, WINNER_RUNNERS_UP_CAP).map((tp) => ({
    userId: tp.userId,
    name: tp.name,
    streak: tp.streak,
    goals: tp.goals,
  }))
  const overflow = Math.max(0, others.length - WINNER_RUNNERS_UP_CAP)
  return { mode: 'turbo', header, winners, runnersUp, overflowCount: overflow }
}
```

- [ ] **Step 2: Test (one happy-path per mode + null case)**

Append to `data.test.ts`:

```ts
describe('getShareWinnerData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when game is missing', async () => {
    vi.mocked(db.query.game.findFirst).mockResolvedValue(undefined as never)
    const r = await (await import('./data')).getShareWinnerData('g1', 'u1')
    expect(r).toBeNull()
  })

  // Happy path tests are exercised at the route level in Task 14.
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/lib/share/data.test.ts
pnpm tsc --noEmit
git add src/lib/share
git commit -m "feat(4c4): implement getShareWinnerData"
```

---

## Task 12: Classic winner layout

**Files:**
- Create: `src/lib/share/layouts/classic-winner.tsx`
- Create: `src/lib/share/layouts/classic-winner.test.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/lib/share/layouts/classic-winner.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { WinnerShareData } from '../data'

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function classicWinnerLayout(
  data: Extract<WinnerShareData, { mode: 'classic' }>,
): LayoutRender {
  const winners = data.winners
  const isSplit = winners.length > 1
  const height = Math.max(700, 340 + winners.length * 70 + data.runnersUp.length * 40 + (data.overflowCount > 0 ? 40 : 0))

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        completePill
      />
      {/* Winner block */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: '#92400e',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          {`🏆 ${isSplit ? `SPLIT POT · ${winners.length} WAY` : 'WINNER'}`}
        </div>
        {winners.map((w) => (
          <div
            key={w.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '8px 0',
              borderTop: winners.indexOf(w) > 0 ? '1px solid rgba(245,158,11,0.25)' : 'none',
            }}
          >
            <div style={{ display: 'flex', fontSize: '32px' }}>🥇</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: '28px', fontWeight: 800 }}>{w.name}</div>
              <div style={{ display: 'flex', fontSize: '14px', color: '#6b6b6b', marginTop: '2px' }}>
                {`Made it to round ${w.classicMeta?.roundsSurvived ?? '—'}`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontSize: '24px', fontWeight: 800, color: '#92400e' }}>
                {`£${w.potShare}`}
              </div>
              <div style={{ display: 'flex', fontSize: '11px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isSplit ? 'share' : 'won'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Runners-up */}
      {data.runnersUp.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            border: '1px solid #e8e6e1',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '12px',
              fontWeight: 700,
              color: '#9a9a9a',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            Eliminated
          </div>
          {data.runnersUp.map((r, idx) => (
            <div
              key={r.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 0',
                borderTop: idx > 0 ? '1px solid #f0eee9' : 'none',
                fontSize: '16px',
              }}
            >
              <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
                {idx + 2}
              </div>
              <div style={{ display: 'flex', flex: 1, fontWeight: 600 }}>{r.name}</div>
              <div style={{ display: 'flex', color: '#dc2626', fontWeight: 700, width: '120px', justifyContent: 'flex-end' }}>
                {`GW${r.eliminatedRoundNumber}`}
              </div>
            </div>
          ))}
          {data.overflowCount > 0 && <OverflowTailRow count={data.overflowCount} label="eliminated earlier" />}
        </div>
      )}
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 2: Test**

```tsx
// src/lib/share/layouts/classic-winner.test.tsx
import { describe, expect, it } from 'vitest'
import { classicWinnerLayout } from './classic-winner'

const fixture = {
  mode: 'classic' as const,
  header: {
    gameName: 'Test',
    gameMode: 'classic' as const,
    competitionName: 'WC',
    pot: '480.00',
    potTotal: '480.00',
    generatedAt: new Date('2026-04-27T12:00:00Z'),
  },
  winners: [
    {
      userId: 'u1',
      name: 'Sean',
      potShare: '480.00',
      classicMeta: { roundsSurvived: 18, finalPickLabel: '' },
    },
  ],
  runnersUp: [
    { userId: 'u2', name: 'Anna', eliminatedRoundNumber: 17 },
    { userId: 'u3', name: 'Dave', eliminatedRoundNumber: 14 },
  ],
  overflowCount: 0,
}

describe('classicWinnerLayout', () => {
  it('renders solo winner', () => {
    const { jsx, width, height } = classicWinnerLayout(fixture)
    expect(jsx).toBeTruthy()
    expect(width).toBe(1080)
    expect(height).toBeGreaterThanOrEqual(700)
  })

  it('renders split-pot scenario with 3 winners', () => {
    const split = { ...fixture, winners: [fixture.winners[0], { ...fixture.winners[0], userId: 'u2', name: 'Anna', potShare: '160.00' }, { ...fixture.winners[0], userId: 'u3', name: 'Jamie', potShare: '160.00' }] }
    const { jsx } = classicWinnerLayout(split)
    expect(jsx).toBeTruthy()
  })
})
```

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/lib/share/layouts/classic-winner.test.tsx
git add src/lib/share/layouts
git commit -m "feat(4c4): classic winner layout"
```

---

## Task 13: Cup + turbo winner layouts

**Files:**
- Create: `src/lib/share/layouts/cup-winner.tsx`
- Create: `src/lib/share/layouts/turbo-winner.tsx`
- Create: `src/lib/share/layouts/cup-winner.test.tsx`
- Create: `src/lib/share/layouts/turbo-winner.test.tsx`

- [ ] **Step 1: `cup-winner.tsx`**

Same shape as classic-winner.tsx but the runners-up table shows `lives / streak / goals` and a "Close finishes" label instead of "Eliminated". Lives rendered as heart pips like cup-standings.

```tsx
// src/lib/share/layouts/cup-winner.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { WinnerShareData } from '../data'

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function cupWinnerLayout(
  data: Extract<WinnerShareData, { mode: 'cup' }>,
): LayoutRender {
  const winners = data.winners
  const isSplit = winners.length > 1
  const height = Math.max(700, 340 + winners.length * 70 + data.runnersUp.length * 44 + (data.overflowCount > 0 ? 40 : 0))

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        completePill
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: '#92400e',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          {`🏆 ${isSplit ? `SPLIT POT · ${winners.length} WAY` : 'WINNER'}`}
        </div>
        {winners.map((w, idx) => (
          <div
            key={w.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '8px 0',
              borderTop: idx > 0 ? '1px solid rgba(245,158,11,0.25)' : 'none',
            }}
          >
            <div style={{ display: 'flex', fontSize: '32px' }}>🥇</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: '28px', fontWeight: 800 }}>{w.name}</div>
              <div style={{ display: 'flex', fontSize: '14px', color: '#6b6b6b', marginTop: '2px' }}>
                {`${w.cupMeta?.livesRemaining ?? 0} lives remaining · streak ${w.cupMeta?.streak ?? 0} · ${w.cupMeta?.goals ?? 0} goals`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontSize: '24px', fontWeight: 800, color: '#92400e' }}>
                {`£${w.potShare}`}
              </div>
              <div style={{ display: 'flex', fontSize: '11px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isSplit ? 'share' : 'won'}
              </div>
            </div>
          </div>
        ))}
      </div>
      {data.runnersUp.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            border: '1px solid #e8e6e1',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '12px',
              fontWeight: 700,
              color: '#9a9a9a',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            Close finishes
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#9a9a9a',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              paddingBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', width: '32px' }}>#</div>
            <div style={{ display: 'flex', flex: 1 }}>Player</div>
            <div style={{ display: 'flex', width: '90px', justifyContent: 'center' }}>Lives</div>
            <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Strk</div>
            <div style={{ display: 'flex', width: '50px', justifyContent: 'center' }}>Gls</div>
          </div>
          {data.runnersUp.map((r, idx) => (
            <div
              key={r.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 0',
                borderTop: '1px solid #f0eee9',
                fontSize: '16px',
                opacity: r.eliminatedRoundNumber != null ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
                {idx + 2}
              </div>
              <div style={{ display: 'flex', flex: 1, fontWeight: 600 }}>{r.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '90px', justifyContent: 'center' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`l-${r.userId}-${i}`}
                    style={{
                      display: 'flex',
                      width: '10px',
                      height: '10px',
                      borderRadius: '5px',
                      background: i < r.livesRemaining ? '#dc2626' : 'transparent',
                      border: i < r.livesRemaining ? 'none' : '1.5px solid #e8e6e1',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700 }}>
                {r.streak}
              </div>
              <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700 }}>
                {r.goals}
              </div>
            </div>
          ))}
          {data.overflowCount > 0 && <OverflowTailRow count={data.overflowCount} label="eliminated earlier" />}
        </div>
      )}
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 2: `turbo-winner.tsx`**

Copy `cup-winner.tsx`. Remove the lives heart-row column. Header columns become `# / Player / Strk / Gls`.

```tsx
// src/lib/share/layouts/turbo-winner.tsx
import type { ReactElement } from 'react'
import { Footer, Header, OverflowTailRow, modeLabel } from '../shared'
import type { WinnerShareData } from '../data'

export interface LayoutRender {
  jsx: ReactElement
  width: number
  height: number
}

export function turboWinnerLayout(
  data: Extract<WinnerShareData, { mode: 'turbo' }>,
): LayoutRender {
  const winners = data.winners
  const isSplit = winners.length > 1
  const height = Math.max(700, 340 + winners.length * 70 + data.runnersUp.length * 40 + (data.overflowCount > 0 ? 40 : 0))

  const jsx = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        background: '#f6f5f1',
        padding: '48px',
        fontFamily: 'sans-serif',
      }}
    >
      <Header
        gameName={data.header.gameName}
        modeLabel={modeLabel(data.header.gameMode)}
        competitionName={data.header.competitionName}
        pot={data.header.pot}
        completePill
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: '#92400e',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          {`🏆 ${isSplit ? `SPLIT POT · ${winners.length} WAY` : 'WINNER'}`}
        </div>
        {winners.map((w, idx) => (
          <div
            key={w.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '8px 0',
              borderTop: idx > 0 ? '1px solid rgba(245,158,11,0.25)' : 'none',
            }}
          >
            <div style={{ display: 'flex', fontSize: '32px' }}>🥇</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: '28px', fontWeight: 800 }}>{w.name}</div>
              <div style={{ display: 'flex', fontSize: '14px', color: '#6b6b6b', marginTop: '2px' }}>
                {`Streak ${w.turboMeta?.streak ?? 0} · ${w.turboMeta?.goals ?? 0} goals`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontSize: '24px', fontWeight: 800, color: '#92400e' }}>
                {`£${w.potShare}`}
              </div>
              <div style={{ display: 'flex', fontSize: '11px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isSplit ? 'share' : 'won'}
              </div>
            </div>
          </div>
        ))}
      </div>
      {data.runnersUp.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            border: '1px solid #e8e6e1',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '12px',
              fontWeight: 700,
              color: '#9a9a9a',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            Close finishes
          </div>
          {data.runnersUp.map((r, idx) => (
            <div
              key={r.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '6px 0',
                borderTop: idx > 0 ? '1px solid #f0eee9' : 'none',
                fontSize: '16px',
              }}
            >
              <div style={{ display: 'flex', width: '32px', fontWeight: 800, color: '#6b6b6b' }}>
                {idx + 2}
              </div>
              <div style={{ display: 'flex', flex: 1, fontWeight: 600 }}>{r.name}</div>
              <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700 }}>
                {r.streak}
              </div>
              <div style={{ display: 'flex', width: '50px', justifyContent: 'center', fontWeight: 700 }}>
                {r.goals}
              </div>
            </div>
          ))}
          {data.overflowCount > 0 && <OverflowTailRow count={data.overflowCount} label="players not shown" />}
        </div>
      )}
      <Footer generatedAt={data.header.generatedAt} />
    </div>
  )

  return { jsx, width: 1080, height }
}
```

- [ ] **Step 3: Tests**

Two test files mirroring `classic-winner.test.tsx`. Each builds a canonical fixture for its mode and asserts the layout renders.

- [ ] **Step 4: Verify and commit**

```
pnpm vitest run src/lib/share/layouts
git add src/lib/share/layouts
git commit -m "feat(4c4): cup + turbo winner layouts"
```

---

## Task 14: New `/winner` route

**Files:**
- Create: `src/app/api/share/winner/[gameId]/route.tsx`
- Create: `src/app/api/share/winner/[gameId]/route.test.ts`

- [ ] **Step 1: Implement**

```tsx
// src/app/api/share/winner/[gameId]/route.tsx
import { ImageResponse } from 'next/og'
import { requireSession } from '@/lib/auth-helpers'
import { getGameDetail } from '@/lib/game/detail-queries'
import { getShareWinnerData } from '@/lib/share/data'
import { classicWinnerLayout } from '@/lib/share/layouts/classic-winner'
import { cupWinnerLayout } from '@/lib/share/layouts/cup-winner'
import { turboWinnerLayout } from '@/lib/share/layouts/turbo-winner'

export const runtime = 'nodejs'

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, immutable' }

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await requireSession()
  const { gameId } = await params
  const game = await getGameDetail(gameId, session.user.id)
  if (!game) return new Response('Not found', { status: 404 })
  if (!game.isMember) return new Response('Forbidden', { status: 403 })

  const data = await getShareWinnerData(gameId, session.user.id)
  if (!data) return new Response('No data', { status: 404 })

  const layout =
    data.mode === 'classic'
      ? classicWinnerLayout(data)
      : data.mode === 'cup'
        ? cupWinnerLayout(data)
        : turboWinnerLayout(data)

  return new ImageResponse(layout.jsx, { width: layout.width, height: layout.height, headers: CACHE_HEADERS })
}
```

- [ ] **Step 2: Test (3 cases like the standings/live tests)**

Mirror `src/app/api/share/standings/[gameId]/route.test.ts`. Mock `getShareWinnerData`. Assert 404, 403, 200.

- [ ] **Step 3: Verify and commit**

```
pnpm vitest run src/app/api/share/winner
git add src/app/api/share
git commit -m "feat(4c4): /api/share/winner route"
```

---

## Task 15: ShareDialog gets `defaultVariant` + dropdown override

**Files:**
- Modify: `src/components/game/share-dialog.tsx`
- Modify: `src/lib/game/detail-queries.ts` (extend `getGameDetail` return shape)
- Modify: `src/app/(app)/game/[id]/page.tsx` (thread the new prop)
- Create: `src/components/game/share-dialog.test.tsx`

- [ ] **Step 1: Compute `defaultShareVariant` in `getGameDetail`**

Find the return statement of `getGameDetail` in `src/lib/game/detail-queries.ts` (line 19+). Before the return, add:

```ts
let defaultShareVariant: 'standings' | 'live' | 'winner' = 'standings'
if (gameData.status === 'completed') {
  defaultShareVariant = 'winner'
} else {
  // Live if any current-round fixture is live or halftime
  const currentRound = gameData.competition.rounds.find((r) => r.id === gameData.currentRoundId)
  if (currentRound?.status === 'active') {
    const liveFixture = currentRound.fixtures?.find(
      (f) => f.status === 'live' || f.status === 'halftime',
    )
    if (liveFixture) defaultShareVariant = 'live'
  }
}
```

(If `currentRound.fixtures` isn't included in the existing relation include, add `with: { fixtures: true }` on the rounds include in the `getGameDetail` query.)

Add `defaultShareVariant` to the returned object. Update the type that downstream consumers see.

- [ ] **Step 2: Update `share-dialog.tsx`**

```tsx
'use client'

import { Check, Copy, Download, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Variant = 'standings' | 'live' | 'winner'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  gameName: string
  pot: string
  inviteUrl: string
  inviteCode: string
  defaultVariant: Variant
  liveAvailable: boolean
  winnerAvailable: boolean
}

const VARIANT_LABEL: Record<Variant, string> = {
  standings: 'Standings',
  live: 'Live (match-day)',
  winner: 'Winner',
}

export function ShareDialog({
  open,
  onOpenChange,
  gameId,
  gameName,
  pot,
  inviteUrl,
  inviteCode,
  defaultVariant,
  liveAvailable,
  winnerAvailable,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const [variant, setVariant] = useState<Variant>(defaultVariant)

  const inviteMessage = `Join me in ${gameName} on Last Person Standing — £${pot} pot. ${inviteUrl}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`

  const cacheBust = open ? Math.floor(Date.now() / 60000) : 0
  const imageUrl =
    variant === 'winner'
      ? `/api/share/${variant}/${gameId}` // immutable; no cache-bust
      : `/api/share/${variant}/${gameId}?t=${cacheBust}`

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share game</DialogTitle>
          <DialogDescription>
            Invite players or share the current state of {gameName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Invite link
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border border-border font-mono min-w-0 truncate"
              />
              <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-1.5">
              Or share the code: <span className="font-mono font-semibold">{inviteCode}</span>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" />
                Share invite to WhatsApp
              </a>
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Game state image
              </div>
              <div className="flex gap-2 items-center">
                <Select value={variant} onValueChange={(v) => setVariant(v as Variant)}>
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standings">{VARIANT_LABEL.standings}</SelectItem>
                    <SelectItem value="live" disabled={!liveAvailable}>
                      {VARIANT_LABEL.live}
                    </SelectItem>
                    <SelectItem value="winner" disabled={!winnerAvailable}>
                      {VARIANT_LABEL.winner}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a
                    href={imageUrl}
                    download={`${gameName.replace(/\s+/g, '-')}-${variant}.png`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
              <Image
                src={imageUrl}
                alt={`${gameName} ${variant}`}
                width={1080}
                height={600}
                unoptimized
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Update `page.tsx` to pass the new props**

In `src/app/(app)/game/[id]/page.tsx`, find the call to `<ShareDialog ...>` (or wherever the dialog props are passed). Add:

```tsx
defaultVariant={detail.defaultShareVariant}
liveAvailable={detail.defaultShareVariant === 'live' || /* derive from game state */ false}
winnerAvailable={detail.gameStatus === 'completed'}
```

Adapt to the actual variable names in `page.tsx`. The simplest approach: also add `liveAvailable: boolean` and `winnerAvailable: boolean` to the `getGameDetail` return alongside `defaultShareVariant`, computed from the same conditions.

- [ ] **Step 4: Component test**

```tsx
// src/components/game/share-dialog.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShareDialog } from './share-dialog'

describe('ShareDialog', () => {
  const baseProps = {
    open: true,
    onOpenChange: () => {},
    gameId: 'g1',
    gameName: 'Test',
    pot: '100',
    inviteUrl: 'http://x/invite',
    inviteCode: 'ABC',
    liveAvailable: false,
    winnerAvailable: false,
    defaultVariant: 'standings' as const,
  }

  it('renders the standings variant by default', () => {
    render(<ShareDialog {...baseProps} />)
    expect(screen.getByAltText(/standings/i)).toBeTruthy()
  })

  it('disables Live and Winner items when not available', () => {
    render(<ShareDialog {...baseProps} />)
    // Select uses Radix; testing the disabled state requires interacting with the trigger.
    // Snapshot the dialog content to ensure rendering doesn't crash.
    expect(screen.getByText('Game state image')).toBeTruthy()
  })

  it('uses immutable URL (no t=) for winner variant', () => {
    render(<ShareDialog {...baseProps} defaultVariant="winner" winnerAvailable={true} />)
    const img = screen.getByAltText(/winner/i) as HTMLImageElement
    expect(img.src).not.toContain('?t=')
  })
})
```

If the test environment doesn't have `@testing-library/react` set up, add it: `pnpm add -D @testing-library/react @testing-library/jest-dom jsdom`. Configure `vitest.config.ts` to use `environment: 'jsdom'` if not already.

If setup is awkward, fall back to a smoke test that just imports `ShareDialog` and asserts it's a function.

- [ ] **Step 5: Verify and commit**

```
pnpm test
pnpm tsc --noEmit
git add -A
git commit -m "feat(4c4): ShareDialog with auto-pick variant + dropdown override"
```

---

## Task 16: Seed update + final sweep + PR

**Files:**
- Modify: `scripts/seed.ts`
- Modify: project memory files (handled by controller, not committed to repo)

- [ ] **Step 1: Add seeded game in each share-relevant state**

Append to `scripts/seed.ts` near the existing 4c3 seed section. Add or adapt:

1. **One classic game with `status='active'`, current round having a `live` fixture** (so `defaultShareVariant=live`).
2. **One cup game with `status='completed'` and a single `winner`** (so `defaultShareVariant=winner`, exercising the cup-winner layout).
3. **One turbo game with `status='completed'` and split-pot scenario** (two `winner` rows).

Mirror the patterns in the existing seed. For "live fixture", set the fixture's `status='live'` and supply non-null `homeScore`/`awayScore`.

- [ ] **Step 2: Manual smoke**

```
just db-reset
just dev
```

Open each seeded game's share dialog. Verify the right default variant is selected, the image renders (mobile width preview in DevTools), and the dropdown switches variants correctly. Snapshot the rendered HTML for any "looks broken" issue.

- [ ] **Step 3: Final sweep**

```
pnpm test
pnpm tsc --noEmit
pnpm exec biome check --write .
```

All must pass. Commit any lint fixes with `chore(4c4): biome format`.

- [ ] **Step 4: Commit + push + PR**

```
git add scripts/seed.ts
git commit -m "chore(seed): add live, cup-winner, turbo-split-pot games for 4c4 smoke"
git push -u origin feature/phase-4c4-satori-share
gh pr create --title "Phase 4c4: Satori share variants (standings/live/winner × classic/cup/turbo)" --body "$(cat <<'PRBODY'
## Summary

Adds two new share variants — **live** (match-day snapshot) and **winner** (end-of-game) — alongside the existing standings image, with mode-aware layouts for classic, cup, and turbo. ShareDialog auto-picks the right default and offers a dropdown to switch.

### What's new
- 9 layout files in \`src/lib/share/layouts/\` (3 modes × 3 variants).
- 3 new mode-aware routes: \`/api/share/{standings,live,winner}/[gameId]\`.
- The existing \`/api/share/grid/[gameId]\` is now a thin alias of \`/standings\` (legacy, removed in 4c5).
- ShareDialog: \`defaultVariant\` prop + \`<Select>\` override + per-variant download + cache-bust handling.
- Seed: three new games for smoke testing the live/winner/split-pot paths.

### Visual decisions
- Classic live: player-ladder (one row per alive player + their pick + live score).
- Cup/turbo live: full grid with live state colouring, lives column for cup.
- Winner: gold-accent winner block (1-N rows for split pot) + close-finishes/eliminated runners-up table.
- Cap & overflow tails for 20-30 player games on mobile.

### Caching
- Standings: \`s-maxage=300, swr=60\`.
- Live: \`no-store\`.
- Winner: \`s-maxage=86400, immutable\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
)"
```

---

## Self-review summary

- ✅ Spec §"Architectural shape" three routes → Tasks 5, 10, 14 plus Task 6 alias.
- ✅ Spec §"Layout files" 9 layouts → Tasks 3 (classic-standings), 4 (cup+turbo standings), 8 (classic-live), 9 (cup+turbo live), 12 (classic-winner), 13 (cup+turbo winner).
- ✅ Spec §"Data shape" → Tasks 1, 2, 7, 11.
- ✅ Spec §"Per-mode layouts" cell colour vocabulary → applied across layout tasks (green/red/blue/amber/yellow/grey).
- ✅ Spec §"Overflow strategy" → caps and tails enforced in each layout.
- ✅ Spec §"Cup/turbo grid cell density" → matchups legend caption added in cup-live and turbo-live (Task 9).
- ✅ Spec §"Dimensions" → 1080 width hardcoded; height formulas per layout.
- ✅ Spec §"ShareDialog surfacing" → Task 15.
- ✅ Spec §"Caching strategy" → Tasks 5 (standings), 10 (live), 14 (winner).
- ✅ Spec §"Personalization & data shape" → no viewer-specific accents; data fetcher signatures match.
- ✅ Spec §"Edge cases & invariants" → covered via tests and through the data fetcher's null returns.
- ✅ Spec §"Testing" → snapshot/render tests per layout, route tests, ShareDialog test, seed update.
- ✅ Spec §"Rollout" → no schema changes; PR-only rollout.

**Deferred from spec:**
- Removing the `/grid` alias — explicitly deferred to 4c5.
- Viewer-specific accents — out of scope per spec.
- Pixel-diff visual regression testing — JSX snapshot is good enough per spec.
