# Phase 4b: Cup Mode UI + Classic Pick Planner + Payment Claim Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the player-facing surfaces needed for cup mode, classic-mode strategy play, and payment tracking — unlocking the friend-group WC 2026 run once Phase 4.5 launches the pipeline.

**Architecture:** Three internally-ordered sub-phases (4b1 → 4b2 → 4b3) on a single feature branch. 4b1 builds cup pick + cup standings by extending the turbo layout/standings patterns. 4b2 adds a chain ribbon + collapsible future-round planner on top of classic-pick, plus QStash-backed auto-submit. 4b3 ships a schema migration and player-claim/admin-confirm payment workflow with updated pot calculation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Drizzle ORM + postgres.js, Vitest, Tailwind v4, shadcn/ui, lucide-react, Upstash QStash, football-data.org + FPL adapters.

**Design spec:** `docs/superpowers/specs/2026-04-22-phase-4b-design.md`

---

## Scope

One branch, three sub-phases, no prod deploy — Phase 4.5 handles that later. Everything merges dormant onto `main`.

## File structure

### Created in 4b1 — Cup mode UI

| Path | Responsibility |
|---|---|
| `src/components/picks/tier-pips.tsx` | 3-pip visual atom; renders `●●○` style tier indicator |
| `src/components/picks/heart-icon.tsx` | Red `❤` sized atom |
| `src/components/picks/plus-n-badge.tsx` | Amber-for-life-earner / grey-for-safe `+N` pill |
| `src/components/picks/lives-summary.tsx` | Top strip: hearts + "If all correct" projection |
| `src/components/picks/cup-pick.tsx` | Main cup pick interface (two-zone: fixtures + ranked) |
| `src/lib/game/cup-standings-queries.ts` | `getCupLadderData`, `getCupStandingsData` DB queries |
| `src/components/standings/cup-ladder.tsx` | Fixture-centric standings with backer groupings |
| `src/components/standings/cup-grid.tsx` | Player × rank leaderboard with lives column |
| `src/components/standings/cup-timeline.tsx` | Kickoff-slot × player with life-change bars |
| `src/components/standings/cup-standings.tsx` | Tab wrapper (Ladder / Grid / Timeline) |

### Created in 4b2 — Classic pick planner

| Path | Responsibility |
|---|---|
| `src/components/picks/chain-ribbon.tsx` | Horizontal gameweek strip showing the full pick chain |
| `src/components/picks/planner-round.tsx` | Single future-round card with both-sides fixtures + auto-submit toggle |
| `src/lib/game/planned-picks.ts` | Pure validation: cascade check, planned-conflict detection |
| `src/app/api/games/[id]/planned-picks/route.ts` | GET (fetch) + POST (upsert) planned picks |
| `src/app/api/games/[id]/planned-picks/[roundId]/route.ts` | DELETE a plan |

### Created in 4b3 — Payment claim flow

| Path | Responsibility |
|---|---|
| `drizzle/NNNN_<name>.sql` | Generated migration: extends `payment_status` enum, adds `claimed_at` column |
| `src/app/api/games/[id]/payments/claim/route.ts` | Player self-claim |
| `src/app/api/games/[id]/payments/[userId]/confirm/route.ts` | Admin confirms a claim |
| `src/app/api/games/[id]/payments/[userId]/reject/route.ts` | Admin rejects a claim |
| `src/app/api/games/[id]/payments/[userId]/override/route.ts` | Admin force-sets status |
| `src/components/game/my-payment-strip.tsx` | Player's own payment status + "Mark as paid" CTA |
| `src/components/game/other-players-payments.tsx` | Compact list of everyone's payment chips |
| `src/components/game/payments-panel.tsx` | Admin-only panel: needs-attention + all-payments |
| `src/components/game/payment-reminder.tsx` | WhatsApp share-link builder |

### Modified

- `src/components/picks/fixture-row.tsx` — adds per-side `state` prop supporting `restricted | used | planned-elsewhere | current | tentative | auto-locked`, and tier/heart/+N annotations at fixture level.
- `src/components/picks/classic-pick.tsx` — renders chain ribbon above, planner section below.
- `src/components/game/game-header.tsx` — splits pot display into `confirmed` primary + annotation.
- `src/components/game/game-detail-view.tsx` — dispatches cup standings for cup mode; hosts payments panel for admin.
- `src/app/(app)/game/[id]/page.tsx` — adds cup-mode page branch.
- `src/lib/schema/payment.ts` — enum + column additions (Drizzle schema side of the migration).
- `src/lib/game-logic/prizes.ts` — rewrites `calculatePot` signature (breaking change).
- `src/lib/game-logic/prizes.test.ts` — new test cases for mixed payment states.
- `src/lib/game/queries.ts` — loads payment rows for dashboard pot totals.
- `src/lib/game/detail-queries.ts` — `getGameDetail` returns the new `{ confirmed, pending, total }` pot shape.
- `src/app/api/picks/[gameId]/[roundId]/route.ts` — exposes typed cup `restricted` error.
- `src/lib/data/qstash.ts` — adds `enqueueAutoSubmit`.
- `src/app/api/cron/qstash-handler/route.ts` — adds `auto_submit` case.
- `src/app/api/cron/daily-sync/route.ts` — detects round transitions into `open` and schedules planned auto-submits.

## Execution order

Tasks are numbered to match the intended sequence. Within each task, steps run top-to-bottom (TDD where it fits).

---

## Part A — 4b1: Cup mode UI

### Task 1: Tier-pips atom

**Files:**
- Create: `src/components/picks/tier-pips.tsx`

Pure visual component. Takes `value: 1 | 2 | 3` and `max: 3 | 5` (WC = 3, future domestic cup = 5). Renders fixed-size 8×8 px circles, filled up to `value`, hollow for the rest.

- [ ] **Step 1: Implement the component**

```typescript
// src/components/picks/tier-pips.tsx
import { cn } from '@/lib/utils'

interface TierPipsProps {
	value: 0 | 1 | 2 | 3 | 4 | 5
	max?: 3 | 5
	className?: string
}

export function TierPips({ value, max = 3, className }: TierPipsProps) {
	return (
		<span className={cn('inline-flex items-center gap-[2px]', className)} aria-label={`${value} of ${max} tier`}>
			{Array.from({ length: max }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable index
					key={i}
					className={cn(
						'inline-block h-2 w-2 rounded-full',
						i < value ? 'bg-foreground' : 'bg-transparent ring-1 ring-inset ring-border',
					)}
				/>
			))}
		</span>
	)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/picks/tier-pips.tsx
git commit -m "feat(picks): add tier-pips atom for cup mode"
```

---

### Task 2: Heart icon + +N badge atoms

**Files:**
- Create: `src/components/picks/heart-icon.tsx`
- Create: `src/components/picks/plus-n-badge.tsx`

Two tiny atoms. Heart uses lucide's `Heart` filled with red (`#dc2626`). Badge is an inline pill with amber variant for `value >= 2` and grey for `value == 1`.

- [ ] **Step 1: Heart icon**

```typescript
// src/components/picks/heart-icon.tsx
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeartIconProps {
	className?: string
	size?: number
}

export function HeartIcon({ className, size = 14 }: HeartIconProps) {
	return (
		<Heart
			className={cn('fill-[#dc2626] text-[#dc2626] shrink-0', className)}
			size={size}
			aria-label="life-earning fixture"
		/>
	)
}
```

- [ ] **Step 2: +N badge**

```typescript
// src/components/picks/plus-n-badge.tsx
import { cn } from '@/lib/utils'

interface PlusNBadgeProps {
	value: number
	className?: string
}

export function PlusNBadge({ value, className }: PlusNBadgeProps) {
	const strong = value >= 2
	return (
		<span
			className={cn(
				'inline-flex items-center rounded px-1.5 py-[1px] text-[10px] font-bold leading-none',
				strong ? 'bg-amber-100 text-amber-900' : 'bg-muted text-foreground/70',
				className,
			)}
		>
			+{value}
		</span>
	)
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/picks/heart-icon.tsx src/components/picks/plus-n-badge.tsx
git commit -m "feat(picks): add heart-icon and plus-n-badge atoms"
```

---

### Task 3: Lives summary strip

**Files:**
- Create: `src/components/picks/lives-summary.tsx`

Displays current lives as hearts, max-lives ghost hearts, and "If all correct: +N → M" projection text on the right.

- [ ] **Step 1: Implement**

```typescript
// src/components/picks/lives-summary.tsx
import { cn } from '@/lib/utils'

interface LivesSummaryProps {
	livesRemaining: number
	maxLives: number
	projectedGain: number
	className?: string
}

export function LivesSummary({
	livesRemaining,
	maxLives,
	projectedGain,
	className,
}: LivesSummaryProps) {
	const total = livesRemaining + projectedGain
	return (
		<div
			className={cn(
				'flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3',
				className,
			)}
		>
			<div>
				<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
					Lives
				</div>
				<div className="flex items-center gap-1 mt-1">
					{Array.from({ length: maxLives }, (_, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: stable index
							key={i}
							className={cn(
								'inline-block h-3.5 w-3.5 rounded-full',
								i < livesRemaining
									? 'bg-[#dc2626]'
									: 'bg-transparent ring-1 ring-inset ring-border',
							)}
						/>
					))}
					<span className="ml-2 text-xs text-muted-foreground">
						{livesRemaining} of {maxLives}
					</span>
				</div>
			</div>
			{projectedGain > 0 && (
				<div className="text-right">
					<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						If all correct
					</div>
					<div className="text-sm font-bold text-[var(--alive)]">
						+{projectedGain} → {total} lives
					</div>
				</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/components/picks/lives-summary.tsx
git commit -m "feat(picks): add lives-summary strip"
```

---

### Task 4: Extend fixture-row with tier annotations + per-side state

**Files:**
- Modify: `src/components/picks/fixture-row.tsx`

Add two new capabilities shared by cup pick and classic planner:

1. Optional tier strip (pips + +N + heart) rendered above the two-side buttons.
2. Optional per-side `state` prop — `'current' | 'tentative' | 'auto-locked' | 'restricted' | 'used' | 'planned-elsewhere'` — with corresponding visual treatment and chip label.

- [ ] **Step 1: Read the current file**

Run: `cat src/components/picks/fixture-row.tsx`

Understand the existing props and structure. The component today takes home/away teams and a click handler.

- [ ] **Step 2: Extend the props**

Add to the `FixtureRowProps` interface:
```typescript
tierValue?: number               // 0-5, tier advantage for underdog
tierMax?: 3 | 5
plusN?: number                   // +N badge value, undefined = no badge
showHeart?: boolean              // life-earning fixture
homeState?: SideState
awayState?: SideState

export type SideState =
	| { kind: 'current' }
	| { kind: 'tentative' }
	| { kind: 'auto-locked' }
	| { kind: 'restricted'; reason?: string }
	| { kind: 'used'; label: string }          // e.g. "USED GW3" / "PLANNED GW27"
	| { kind: 'planned-elsewhere'; label: string }
```

- [ ] **Step 3: Render the tier strip**

Above the two side buttons, if any of `tierValue`, `plusN`, `showHeart` are set:

```tsx
{(tierValue != null || plusN != null || showHeart) && (
	<div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground">
		{showHeart && <HeartIcon size={13} />}
		{tierValue != null && <TierPips value={tierValue as 0|1|2|3|4|5} max={tierMax} />}
		{plusN != null && <PlusNBadge value={plusN} />}
		{kickoff && <span className="ml-auto">{formatKickoff(kickoff)}</span>}
	</div>
)}
```

Import `HeartIcon`, `TierPips`, `PlusNBadge` from sibling files.

- [ ] **Step 4: Apply per-side state styling**

In the team-side buttons, branch on `homeState`/`awayState`:

```tsx
function sideClass(state?: SideState): string {
	if (!state) return ''
	switch (state.kind) {
		case 'current': return 'border-[var(--alive)] bg-[var(--alive-bg)]'
		case 'tentative': return 'border-2 border-dashed border-[#7c3aed] bg-[#f5f3ff]'
		case 'auto-locked': return 'border-2 border-[#7c3aed] bg-[#ede9fe]'
		case 'restricted': return 'opacity-40 cursor-not-allowed'
		case 'used':
		case 'planned-elsewhere': return 'opacity-40 cursor-not-allowed line-through'
	}
}

function sideChip(state?: SideState): React.ReactNode {
	if (!state) return null
	switch (state.kind) {
		case 'current': return <span className="text-[9px] bg-[var(--alive-bg)] text-[var(--alive)] px-1.5 py-0.5 rounded font-bold">CURRENT</span>
		case 'tentative': return <span className="text-[9px] bg-[#ddd6fe] text-[#5b21b6] px-1.5 py-0.5 rounded font-bold">TENTATIVE</span>
		case 'auto-locked': return <span className="text-[9px] bg-[#7c3aed] text-white px-1.5 py-0.5 rounded font-bold">🔒 AUTO</span>
		case 'restricted': return <span className="text-[9px] text-muted-foreground">{state.reason ?? 'Restricted'}</span>
		case 'used':
		case 'planned-elsewhere': return <span className="text-[9px] bg-muted text-foreground/70 px-1.5 py-0.5 rounded font-bold">{state.label}</span>
	}
}
```

Disable click on `restricted`, `used`, `planned-elsewhere` sides.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean. If existing callers now fail due to strict props, default all new props to `undefined`.

- [ ] **Step 6: Commit**

```bash
git add src/components/picks/fixture-row.tsx
git commit -m "feat(picks): extend fixture-row with tier + per-side state"
```

---

### Task 5: Cup-pick main interface

**Files:**
- Create: `src/components/picks/cup-pick.tsx`

Two-zone layout reusing turbo patterns: fixture list on the left (desktop) / top (mobile), ranked list on the right / bottom. Uses `fixture-row` (with tier props), `ranked-item`, and `lives-summary`.

- [ ] **Step 1: Sketch the component signature**

```typescript
// src/components/picks/cup-pick.tsx
'use client'

import { useState, useMemo } from 'react'
import { FixtureRow } from './fixture-row'
import { LivesSummary } from './lives-summary'
import { RankedItem } from './ranked-item'

export interface CupPickFixture {
	id: string
	homeTeamId: string
	awayTeamId: string
	homeShort: string
	homeName: string
	homeColor: string | null
	homeBadgeUrl: string | null
	awayShort: string
	awayName: string
	awayColor: string | null
	awayBadgeUrl: string | null
	kickoff: Date | null
	tierDifference: number       // from home perspective, positive = home higher tier
}

export interface CupPickSlot {
	confidenceRank: number
	fixtureId: string
	pickedSide: 'home' | 'away'
}

interface CupPickProps {
	fixtures: CupPickFixture[]
	numberOfPicks: number              // 6 for WC, up to 10 for domestic cup
	livesRemaining: number
	maxLives: number
	initialSlots: CupPickSlot[]
	onSubmit: (slots: CupPickSlot[]) => Promise<void>
	readonly?: boolean
}
```

- [ ] **Step 2: Implement**

Render the lives-summary at the top. Calculate `projectedGain` from current slots (sum of `abs(tierDifference)` for `pickedSide` = underdog). Dispatch tier annotations onto each fixture-row using the fixture's `tierDifference`:

```typescript
function tierForDisplay(
	fixture: CupPickFixture,
): { value: number; plusN: number; heart: boolean } {
	const abs = Math.abs(fixture.tierDifference)
	return { value: abs, plusN: abs, heart: abs >= 2 }
}

function sideRestricted(
	fixture: CupPickFixture,
	side: 'home' | 'away',
): { kind: 'restricted'; reason: string } | undefined {
	// Cup rule: can't pick a side more than 1 tier higher than opponent.
	const tierFromPicked = side === 'home' ? fixture.tierDifference : -fixture.tierDifference
	if (tierFromPicked > 1) {
		return { kind: 'restricted', reason: `Restricted — opponent is ${tierFromPicked} tiers lower` }
	}
	return undefined
}
```

Manage `slots` with `useState`. Handlers:
- `handlePickTeam(fixtureId, side)` — if this fixture already has a slot, do nothing (fixture can only appear once); otherwise append at rank `slots.length + 1`.
- `handleRemoveSlot(confidenceRank)` — remove and renumber.
- `handleReorder(fromRank, toRank)` — swap ranks (desktop drag) / increment-decrement (mobile arrows).

Use the existing `RankedItem` for each ranked slot, passing a cup-specific description builder (`"Morocco to beat Spain"`) and meta row (heart + pips + +N + life-outcome hint).

Submit button reads `Submit ${slots.length} of ${numberOfPicks} picks`; disabled unless `slots.length >= minPicks` (configurable, default = `Math.ceil(numberOfPicks * 0.6)` — tune later).

Rendering (desktop; Tailwind handles the responsive stack):

```tsx
<div className="space-y-3">
	<LivesSummary
		livesRemaining={livesRemaining}
		maxLives={maxLives}
		projectedGain={computeProjectedGain(slots, fixtures)}
	/>
	<div className="rounded-lg bg-foreground text-background px-3 py-2 text-xs">
		Deadline … · rank {numberOfPicks} picks
	</div>
	<div className="grid gap-3 md:grid-cols-[1fr_320px]">
		<div>
			<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				Available fixtures
			</div>
			{fixtures.map(f => {
				const tier = tierForDisplay(f)
				const slot = slots.find(s => s.fixtureId === f.id)
				return (
					<FixtureRow
						key={f.id}
						/* ... existing props ... */
						tierValue={tier.value}
						plusN={tier.plusN}
						showHeart={tier.heart}
						homeState={slot?.pickedSide === 'home' ? { kind: 'current' } : sideRestricted(f, 'home')}
						awayState={slot?.pickedSide === 'away' ? { kind: 'current' } : sideRestricted(f, 'away')}
						onPickHome={() => handlePickTeam(f.id, 'home')}
						onPickAway={() => handlePickTeam(f.id, 'away')}
					/>
				)
			})}
		</div>
		<div>
			<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				Your picks, ranked
			</div>
			{Array.from({ length: numberOfPicks }, (_, i) => i + 1).map(rank => {
				const slot = slots.find(s => s.confidenceRank === rank)
				if (!slot) return <EmptySlot key={rank} rank={rank} />
				return <CupRankedRow key={rank} slot={slot} fixtures={fixtures} />
			})}
			<button
				type="button"
				className="mt-3 w-full rounded bg-foreground text-background py-3 font-semibold"
				disabled={readonly || slots.length < minPicks}
				onClick={() => onSubmit(slots)}
			>
				Submit {slots.length} of {numberOfPicks} picks
			</button>
		</div>
	</div>
</div>
```

(`EmptySlot`, `CupRankedRow`, `computeProjectedGain`, `minPicks` as local helpers/constants in the file.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/picks/cup-pick.tsx
git commit -m "feat(picks): add cup-pick interface"
```

---

### Task 6: Wire cup pick into the game page

**Files:**
- Modify: `src/app/(app)/game/[id]/page.tsx`

Today the page branches on `gameMode` to render `ClassicPick` or `TurboPick`. Add the `cup` branch.

- [ ] **Step 1: Read the current page**

Run: `cat src/app/\(app\)/game/\[id\]/page.tsx`

Understand where the mode dispatch happens and what data shape existing queries return.

- [ ] **Step 2: Add cup branch**

Inside the mode switch:

```typescript
if (gameData.gameMode === 'cup') {
	const cupFixtures = gameData.currentRound?.fixtures.map(f => ({
		id: f.id,
		homeTeamId: f.homeTeamId,
		awayTeamId: f.awayTeamId,
		homeShort: f.homeTeam.shortName,
		homeName: f.homeTeam.name,
		homeColor: f.homeTeam.primaryColor,
		homeBadgeUrl: f.homeTeam.badgeUrl,
		awayShort: f.awayTeam.shortName,
		awayName: f.awayTeam.name,
		awayColor: f.awayTeam.primaryColor,
		awayBadgeUrl: f.awayTeam.badgeUrl,
		kickoff: f.kickoff,
		tierDifference: computeTierDifference(f.homeTeam, f.awayTeam, gameData.competition.type),
	})) ?? []

	const initialSlots = /* load existing picks from gameData.picks for this round */

	return <CupPick
		fixtures={cupFixtures}
		numberOfPicks={gameData.modeConfig?.numberOfPicks ?? 6}
		livesRemaining={myMembership.livesRemaining}
		maxLives={gameData.modeConfig?.startingLives ?? 3}
		initialSlots={initialSlots}
		onSubmit={submitPicks}
		readonly={gameData.status !== 'open'}
	/>
}
```

Extract `computeTierDifference` locally (or promote to `src/lib/game-logic/cup-tier.ts` if there's a natural callsite sharing it — see Task 7's approach). For WC `group_knockout`, look up `team.externalIds.fifa_pot` on both teams and return `homePot - awayPot`.

- [ ] **Step 3: Submit handler**

`submitPicks(slots)` should call the existing pick-submission API with cup-mode payload shape (ranked picks with picked team ID per slot). The existing route already handles turbo's ranked picks; cup's payload is identical shape with different server-side validation.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/game/ 
git commit -m "feat(game): dispatch cup-pick for cup mode"
```

---

### Task 7: Cup tier-difference helper

**Files:**
- Create: `src/lib/game-logic/cup-tier.ts`
- Create: `src/lib/game-logic/cup-tier.test.ts`

Pure function computing `tierDifference` for a fixture. For WC (`group_knockout`), uses `externalIds.fifa_pot`. For other competition types, returns 0 (no tier mechanic).

- [ ] **Step 1: Write the test**

```typescript
// src/lib/game-logic/cup-tier.test.ts
import { describe, expect, it } from 'vitest'
import { computeTierDifference } from './cup-tier'

describe('computeTierDifference', () => {
	const pot1 = { externalIds: { fifa_pot: 1 } }
	const pot4 = { externalIds: { fifa_pot: 4 } }
	const pot2 = { externalIds: { fifa_pot: 2 } }
	const noPot = { externalIds: {} }

	it('returns homePot - awayPot for group_knockout', () => {
		expect(computeTierDifference(pot1, pot4, 'group_knockout')).toBe(-3)
		expect(computeTierDifference(pot4, pot1, 'group_knockout')).toBe(3)
		expect(computeTierDifference(pot1, pot2, 'group_knockout')).toBe(-1)
	})

	it('returns 0 when a pot is missing', () => {
		expect(computeTierDifference(pot1, noPot, 'group_knockout')).toBe(0)
	})

	it('returns 0 for non-cup competition types', () => {
		expect(computeTierDifference(pot1, pot4, 'league')).toBe(0)
		expect(computeTierDifference(pot1, pot4, 'knockout')).toBe(0)
	})
})
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/game-logic/cup-tier.ts
type TeamWithExternalIds = {
	externalIds: Record<string, string | number> | null | undefined
}

export function computeTierDifference(
	home: TeamWithExternalIds,
	away: TeamWithExternalIds,
	competitionType: 'league' | 'knockout' | 'group_knockout',
): number {
	if (competitionType !== 'group_knockout') return 0
	const homePot = Number(home.externalIds?.fifa_pot)
	const awayPot = Number(away.externalIds?.fifa_pot)
	if (!Number.isFinite(homePot) || !Number.isFinite(awayPot)) return 0
	return homePot - awayPot
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run src/lib/game-logic/cup-tier.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-logic/cup-tier.ts src/lib/game-logic/cup-tier.test.ts
git commit -m "feat(game-logic): add cup tier-difference helper"
```

Now refactor Task 6 to use this helper (import `computeTierDifference` in the page file, remove local duplicate if any).

---

### Task 8: Expose cup restricted-pick error in the pick API

**Files:**
- Modify: `src/app/api/picks/[gameId]/[roundId]/route.ts`

`evaluateCupPicks` in game-logic already identifies `restricted` picks. The pick route should reject a submission that includes any restricted pick with a typed 400 response so the UI can surface a helpful message.

- [ ] **Step 1: Read the route**

Run: `cat src/app/api/picks/\[gameId\]/\[roundId\]/route.ts`

Find the cup-mode branch.

- [ ] **Step 2: Validate restricted picks**

Before writing any picks to the DB, simulate the cup pick outcomes and check for restriction:

```typescript
import { computeTierDifference } from '@/lib/game-logic/cup-tier'
// ...

if (gameData.gameMode === 'cup') {
	for (const entry of body.picks) {
		const fx = roundFixtures.find(f => f.id === entry.fixtureId)
		if (!fx) continue
		const tierDiff = computeTierDifference(fx.homeTeam, fx.awayTeam, gameData.competition.type)
		const tierFromPicked = entry.pickedSide === 'home' ? tierDiff : -tierDiff
		if (tierFromPicked > 1) {
			return NextResponse.json(
				{ error: 'restricted', fixtureId: entry.fixtureId, side: entry.pickedSide },
				{ status: 400 },
			)
		}
	}
}
```

Verify you don't duplicate tier-diff computation elsewhere in the branch.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/api/picks/
git commit -m "feat(api): reject restricted cup picks with typed error"
```

---

### Task 9: Cup standings data query

**Files:**
- Create: `src/lib/game/cup-standings-queries.ts`
- Create: `src/lib/game/cup-standings-queries.test.ts`

Returns the payload the cup-grid and cup-ladder components consume. One round at a time (cup games are per-round like turbo in this project's model).

- [ ] **Step 1: Define the payload shape**

```typescript
// src/lib/game/cup-standings-queries.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture, round } from '@/lib/schema/competition'
import { game, gamePlayer, pick } from '@/lib/schema/game'
import { computeTierDifference } from '@/lib/game-logic/cup-tier'

export interface CupStandingsPick {
	gamePlayerId: string
	confidenceRank: number
	fixtureId: string
	homeShort: string
	awayShort: string
	pickedTeamId: string
	pickedSide: 'home' | 'away'
	tierDifference: number               // from picked side
	result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'restricted'
	livesGained: number
	livesSpent: number
	goalsCounted: number
}

export interface CupStandingsPlayer {
	id: string
	userId: string
	name: string
	status: 'alive' | 'eliminated' | 'winner'
	livesRemaining: number
	streak: number
	goals: number
	hasSubmitted: boolean
	eliminatedRoundNumber: number | null
	picks: CupStandingsPick[]
}

export interface CupStandingsData {
	gameId: string
	roundId: string
	roundNumber: number
	roundStatus: 'open' | 'active' | 'completed'
	maxLives: number
	numberOfPicks: number
	players: CupStandingsPlayer[]
}

export async function getCupStandingsData(
	gameId: string,
	viewerUserId: string,
): Promise<CupStandingsData | null> {
	const g = await db.query.game.findFirst({
		where: eq(game.id, gameId),
		with: {
			competition: true,
			currentRound: { with: { fixtures: { with: { homeTeam: true, awayTeam: true } } } },
			players: true,
		},
	})
	if (!g || !g.currentRound) return null

	const allPicks = await db.query.pick.findMany({
		where: and(eq(pick.gameId, gameId), eq(pick.roundId, g.currentRound.id)),
	})

	const hideOpenPicks = g.currentRound.status === 'open'

	const players: CupStandingsPlayer[] = g.players.map(p => {
		const isViewer = p.userId === viewerUserId
		const myPicks = allPicks.filter(pk => pk.gamePlayerId === p.id)
		const picks: CupStandingsPick[] = myPicks.map(pk => {
			const fx = g.currentRound!.fixtures.find(f => f.id === pk.fixtureId)!
			const pickedSide: 'home' | 'away' = pk.teamId === fx.homeTeamId ? 'home' : 'away'
			const tierFromHome = computeTierDifference(fx.homeTeam, fx.awayTeam, g.competition.type)
			const tierFromPicked = pickedSide === 'home' ? tierFromHome : -tierFromHome
			const hidden = hideOpenPicks && !isViewer
			const result = hidden ? 'hidden' : mapPickResult(pk.result)
			return {
				gamePlayerId: p.id,
				confidenceRank: pk.confidenceRank ?? 0,
				fixtureId: fx.id,
				homeShort: fx.homeTeam.shortName,
				awayShort: fx.awayTeam.shortName,
				pickedTeamId: pk.teamId,
				pickedSide,
				tierDifference: tierFromPicked,
				result: hidden ? 'hidden' : result,
				livesGained: hidden ? 0 : computeLivesGained(pk, tierFromPicked),
				livesSpent: hidden ? 0 : computeLivesSpent(pk),
				goalsCounted: pk.goalsScored ?? 0,
			}
		})
		const streak = computeStreak(picks)
		return {
			id: p.id,
			userId: p.userId,
			name: /* look up display name from user table — see existing pattern in getTurboStandingsData */ '',
			status: p.status,
			livesRemaining: p.livesRemaining,
			streak,
			goals: picks.reduce((sum, pk) => sum + pk.goalsCounted, 0),
			hasSubmitted: myPicks.length > 0,
			eliminatedRoundNumber: null,
			picks,
		}
	})

	return {
		gameId: g.id,
		roundId: g.currentRound.id,
		roundNumber: g.currentRound.number,
		roundStatus: g.currentRound.status as 'open' | 'active' | 'completed',
		maxLives: (g.modeConfig as { startingLives?: number } | null)?.startingLives ?? 3,
		numberOfPicks: (g.modeConfig as { numberOfPicks?: number } | null)?.numberOfPicks ?? 6,
		players,
	}
}

function mapPickResult(r: string): 'win' | 'saved_by_life' | 'loss' | 'pending' {
	switch (r) {
		case 'win':
		case 'draw':
			return 'win'
		case 'saved_by_life':
			return 'saved_by_life'
		case 'loss':
			return 'loss'
		default:
			return 'pending'
	}
}

function computeLivesGained(_pk: unknown, tierFromPicked: number): number {
	// Already encoded in the pick's goalsScored path in the game-logic; derive
	// here from tier + result if we need to surface at query time.
	// For now: only a 'win' pick with tierFromPicked < -1 earns lives.
	// Simpler: cup pick result 'win' with tierFromPicked <= -2 → |tierFromPicked|.
	// TODO(4c): promote to game-logic.cup — acceptable here as local derivation.
	return 0 // placeholder; populated in Task 10 once rendering confirms what the UI needs.
}

function computeLivesSpent(_pk: unknown): number {
	return 0 // placeholder; populated in Task 10.
}

function computeStreak(picks: CupStandingsPick[]): number {
	let streak = 0
	for (const p of picks.sort((a, b) => a.confidenceRank - b.confidenceRank)) {
		if (p.result === 'win' || p.result === 'saved_by_life') streak++
		else break
	}
	return streak
}
```

Note the `computeLivesGained` / `computeLivesSpent` placeholders — they get implemented in Task 10 once the grid renders and shows what's needed. Pattern used in Phase 4a's detail-queries: derive display-facing fields where they live.

Actually — don't ship placeholders. Fill them now:

```typescript
function computeLivesGained(pk: { result: string }, tierFromPicked: number): number {
	if (pk.result !== 'win') return 0
	if (tierFromPicked <= -2) return Math.abs(tierFromPicked)
	return 0
}

function computeLivesSpent(pk: { result: string }): number {
	return pk.result === 'saved_by_life' ? 1 : 0
}
```

- [ ] **Step 2: Add user-name lookup**

Follow the pattern already in `src/lib/game/detail-queries.ts` for joining `user` → `gamePlayer.userId`. Copy the helper if needed.

- [ ] **Step 3: Write a basic test**

```typescript
// src/lib/game/cup-standings-queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const findFirstMock = vi.fn()
const findManyMock = vi.fn()

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			game: { findFirst: findFirstMock },
			pick: { findMany: findManyMock },
			user: { findMany: vi.fn().mockResolvedValue([]) },
		},
	},
}))

import { getCupStandingsData } from './cup-standings-queries'

describe('getCupStandingsData', () => {
	it('returns null when game is missing', async () => {
		findFirstMock.mockResolvedValue(undefined)
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})

	it('returns null when there is no current round', async () => {
		findFirstMock.mockResolvedValue({ id: 'g', currentRound: null, players: [], competition: { type: 'group_knockout' }, modeConfig: {} })
		expect(await getCupStandingsData('g1', 'u1')).toBeNull()
	})
})
```

Hitting the full happy-path here becomes an integration test — that's fine for 4b's scope. Deeper coverage via manual dev-server verification in Task 14.

- [ ] **Step 4: Run tests + commit**

Run: `pnpm exec vitest run src/lib/game/cup-standings-queries.test.ts`

```bash
git add src/lib/game/cup-standings-queries.ts src/lib/game/cup-standings-queries.test.ts
git commit -m "feat(queries): add getCupStandingsData for cup mode standings"
```

---

### Task 10: Cup grid component

**Files:**
- Create: `src/components/standings/cup-grid.tsx`

Player × rank leaderboard with lives column + life-gain/spend bubbles. Renders the payload from `getCupStandingsData`.

- [ ] **Step 1: Component signature**

```typescript
// src/components/standings/cup-grid.tsx
'use client'

import type { CupStandingsData } from '@/lib/game/cup-standings-queries'
import { cn } from '@/lib/utils'

interface CupGridProps {
	data: CupStandingsData
}

export function CupGrid({ data }: CupGridProps) {
	const alive = data.players
		.filter(p => p.status !== 'eliminated')
		.sort((a, b) => (b.streak - a.streak) || (b.goals - a.goals))
	const out = data.players
		.filter(p => p.status === 'eliminated')
		.sort((a, b) => (a.eliminatedRoundNumber ?? 0) - (b.eliminatedRoundNumber ?? 0))
	// render header row + alive rows + divider + eliminated rows
	return (/* ... */)
}
```

- [ ] **Step 2: Implement the rows**

```tsx
function PlayerRow({
	player,
	numberOfPicks,
	maxLives,
	position,
	isOut,
}: {
	player: CupStandingsData['players'][number]
	numberOfPicks: number
	maxLives: number
	position: number
	isOut?: boolean
}) {
	return (
		<div className={cn('grid grid-cols-[24px_140px_80px_48px_48px_repeat(var(--picks),62px)] gap-1.5 px-1 py-1.5 items-center border-t border-border', isOut && 'opacity-55')}
			style={{ ['--picks' as string]: numberOfPicks }}>
			<div className="font-display font-bold text-muted-foreground">{position}</div>
			<div className="flex items-center gap-2">
				<Avatar name={player.name} />
				<span className="text-sm font-semibold">{player.name}</span>
				{!player.hasSubmitted && <Badge tone="warn">NO PICKS</Badge>}
				{isOut && <Badge tone="danger">OUT GW{player.eliminatedRoundNumber ?? '?'}</Badge>}
			</div>
			<LivesCell remaining={player.livesRemaining} max={maxLives} />
			<div className="text-center font-bold">{player.streak || '—'}</div>
			<div className="text-center">{player.goals || '—'}</div>
			{Array.from({ length: numberOfPicks }, (_, i) => {
				const rank = i + 1
				const pick = player.picks.find(p => p.confidenceRank === rank)
				return <GridCell key={rank} pick={pick} />
			})}
		</div>
	)
}

function LivesCell({ remaining, max }: { remaining: number; max: number }) {
	return (
		<div className="flex items-center gap-0.5">
			{Array.from({ length: max }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable index
					key={i}
					className={cn(
						'inline-block h-2.5 w-2.5 rounded-full',
						i < remaining ? 'bg-[#dc2626]' : 'ring-1 ring-inset ring-border',
					)}
				/>
			))}
			<span className={cn('ml-1 text-[10px]', remaining === 0 ? 'text-red-600 font-bold' : 'text-muted-foreground')}>
				{remaining}/{max}{remaining === 0 ? ' ⚠' : ''}
			</span>
		</div>
	)
}

function GridCell({ pick }: { pick?: CupStandingsData['players'][number]['picks'][number] }) {
	if (!pick) {
		return <div className="h-9 w-14 rounded border border-dashed border-border bg-muted/40" />
	}
	if (pick.result === 'hidden') {
		return <div className="h-9 w-14 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">🔒</div>
	}
	const bg = pick.result === 'win' ? 'bg-[var(--alive)]' :
		pick.result === 'saved_by_life' ? 'bg-amber-500' :
		pick.result === 'loss' ? 'bg-[var(--eliminated)]' :
		'bg-muted'
	const fg = pick.result === 'pending' ? 'text-foreground/70' : 'text-white'
	const label = pick.pickedSide === 'home' ? pick.homeShort : pick.awayShort
	return (
		<div className={cn('relative h-9 w-14 rounded flex flex-col items-center justify-center text-[10px] font-bold', bg, fg)}>
			<span>{label}</span>
			<span className="text-[8px] opacity-90">{pick.tierDifference <= -1 ? `+${Math.abs(pick.tierDifference)}` : ''}</span>
			{pick.livesGained > 0 && (
				<span className="absolute -top-1.5 -right-1.5 bg-emerald-700 text-white text-[8px] px-1 rounded-full font-bold">
					+{pick.livesGained}
				</span>
			)}
			{pick.livesSpent > 0 && (
				<span className="absolute -top-1.5 -right-1.5 bg-amber-800 text-white text-[8px] px-1 rounded-full font-bold">
					-{pick.livesSpent}
				</span>
			)}
		</div>
	)
}
```

(`Avatar`, `Badge` local helpers; keep the file self-contained.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/standings/cup-grid.tsx
git commit -m "feat(standings): add cup-grid leaderboard with lives column"
```

---

### Task 11: Cup ladder data + component

**Files:**
- Add to: `src/lib/game/cup-standings-queries.ts`
- Create: `src/components/standings/cup-ladder.tsx`

Fixture-centric view. Extends `getCupStandingsData` with `fixtures: CupLadderFixture[]` and `crucialFixtureIds: string[]` (cup's extended definition: splits the table OR has a no-lives player's pick on it).

- [ ] **Step 1: Extend the query**

Add to `cup-standings-queries.ts`:

```typescript
export interface CupLadderBacker {
	playerId: string
	playerName: string
	confidenceRank: number
	result: 'win' | 'saved_by_life' | 'loss' | 'pending' | 'hidden' | 'upset-pending' | 'last-life'
	livesGained: number
	livesSpent: number
}

export interface CupLadderFixture {
	id: string
	homeTeam: { shortName: string; name: string; badgeUrl: string | null; color: string | null }
	awayTeam: { shortName: string; name: string; badgeUrl: string | null; color: string | null }
	kickoff: Date | null
	homeScore: number | null
	awayScore: number | null
	tierDifference: number
	plusN: number
	heart: boolean
	actualOutcome: 'home_win' | 'draw' | 'away_win' | null
	homeBackers: CupLadderBacker[]
	awayBackers: CupLadderBacker[]
	crucial: boolean
}

export interface CupLadderData extends CupStandingsData {
	fixtures: CupLadderFixture[]
}

export async function getCupLadderData(
	gameId: string,
	viewerUserId: string,
): Promise<CupLadderData | null> {
	const base = await getCupStandingsData(gameId, viewerUserId)
	if (!base) return null
	// Build per-fixture backer lists from base.players[*].picks
	// Apply crucial-fixture heuristic (see spec)
	// ...
}
```

Crucial heuristic:

```typescript
function isCrucial(
	fixture: { id: string; actualOutcome: string | null },
	backers: { homeBackers: CupLadderBacker[]; awayBackers: CupLadderBacker[] },
	players: CupStandingsPlayer[],
): boolean {
	if (fixture.actualOutcome != null) return false
	const homeCount = backers.homeBackers.length
	const awayCount = backers.awayBackers.length
	if (homeCount >= 1 && awayCount >= 1) return true
	const allBackers = [...backers.homeBackers, ...backers.awayBackers]
	for (const b of allBackers) {
		const player = players.find(p => p.id === b.playerId)
		if (player && player.livesRemaining === 0) return true
	}
	return false
}
```

- [ ] **Step 2: Build the component**

```typescript
// src/components/standings/cup-ladder.tsx
'use client'

import { AlertTriangle, CheckCircle2, Zap } from 'lucide-react'
import type { CupLadderData, CupLadderFixture } from '@/lib/game/cup-standings-queries'
import { HeartIcon } from '@/components/picks/heart-icon'
import { TierPips } from '@/components/picks/tier-pips'
import { PlusNBadge } from '@/components/picks/plus-n-badge'

interface CupLadderProps {
	data: CupLadderData
}

export function CupLadder({ data }: CupLadderProps) {
	const played = data.fixtures.filter(f => f.actualOutcome != null)
	const unplayed = data.fixtures.filter(f => f.actualOutcome == null)
	const top3 = [...data.players]
		.filter(p => p.status !== 'eliminated')
		.sort((a, b) => (b.streak - a.streak) || (b.goals - a.goals))
		.slice(0, 3)
	return (
		<div className="space-y-6">
			<Podium players={top3} maxLives={data.maxLives} />
			{unplayed.length > 0 && (
				<section>
					<h3 className="flex items-center gap-2 font-display text-lg font-semibold mb-3">
						<Zap className="h-4 w-4" /> Still to play
					</h3>
					{unplayed.map(f => <CupFixtureCard key={f.id} fixture={f} />)}
				</section>
			)}
			{played.length > 0 && (
				<section>
					<h3 className="flex items-center gap-2 font-display text-lg font-semibold mb-3">
						<CheckCircle2 className="h-4 w-4 text-[var(--alive)]" /> Played
					</h3>
					{played.map(f => <CupFixtureCard key={f.id} fixture={f} />)}
				</section>
			)}
		</div>
	)
}
```

`Podium`, `CupFixtureCard`, and result-badge helpers live in the same file (small, scoped).

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/lib/game/cup-standings-queries.ts src/components/standings/cup-ladder.tsx
git commit -m "feat(standings): add cup-ladder fixture-centric view"
```

---

### Task 12: Cup timeline component

**Files:**
- Create: `src/components/standings/cup-timeline.tsx`

Adapt turbo-timeline to colour-code life changes: each cell gets a small coloured bar on its right edge (green for gained, amber for spent). Players at 0 lives show a red dot next to their name.

- [ ] **Step 1: Read turbo-timeline**

Run: `cat src/components/standings/turbo-timeline.tsx`

- [ ] **Step 2: Copy structure into cup-timeline**

Same kickoff-slot × player grid; consume `CupStandingsData` instead. Per-cell decoration:

```tsx
<div className={cn('relative h-8 w-14 rounded-sm flex items-center justify-center text-[10px]', cellBgColour)}>
	{label}
	{pick.livesGained > 0 && (
		<span className="absolute right-0 top-0 bottom-0 w-1 bg-emerald-700 rounded-r-sm" />
	)}
	{pick.livesSpent > 0 && (
		<span className="absolute right-0 top-0 bottom-0 w-1 bg-amber-700 rounded-r-sm" />
	)}
</div>
```

Name column:

```tsx
<span className="flex items-center gap-2">
	{player.name}
	{player.livesRemaining === 0 && <span className="h-2 w-2 rounded-full bg-red-600" />}
</span>
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/standings/cup-timeline.tsx
git commit -m "feat(standings): add cup-timeline with life-change bars"
```

---

### Task 13: Cup standings tab wrapper

**Files:**
- Create: `src/components/standings/cup-standings.tsx`

Tab switcher (Ladder / Grid / Timeline) mirroring `turbo-standings.tsx` structure.

- [ ] **Step 1: Read turbo-standings**

Run: `cat src/components/standings/turbo-standings.tsx`

Note the props shape and tab state management.

- [ ] **Step 2: Implement**

```typescript
'use client'

import { useState } from 'react'
import { Clock, LayoutGrid, ListTree } from 'lucide-react'
import type { CupLadderData } from '@/lib/game/cup-standings-queries'
import { CupGrid } from './cup-grid'
import { CupLadder } from './cup-ladder'
import { CupTimeline } from './cup-timeline'
import { cn } from '@/lib/utils'

type ViewMode = 'ladder' | 'grid' | 'timeline'

interface CupStandingsProps {
	data: CupLadderData
	onShare?: () => void
}

export function CupStandings({ data, onShare }: CupStandingsProps) {
	const [view, setView] = useState<ViewMode>('ladder')
	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div className="p-4 md:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-border">
				<div>
					<h2 className="font-display text-2xl font-semibold">Standings</h2>
					<p className="text-sm text-muted-foreground mt-1">
						{data.roundStatus === 'completed'
							? 'Round complete.'
							: data.roundStatus === 'open'
								? 'Round open — picks hidden until the deadline passes.'
								: 'Round in play.'}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex gap-1 border border-border rounded-md p-0.5">
						{(['ladder', 'timeline', 'grid'] as const).map(m => (
							<button
								key={m}
								type="button"
								onClick={() => setView(m)}
								className={cn(
									'text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1',
									view === m
										? 'bg-foreground text-background'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{m === 'ladder' && <ListTree className="h-3 w-3" />}
								{m === 'timeline' && <Clock className="h-3 w-3" />}
								{m === 'grid' && <LayoutGrid className="h-3 w-3" />}
								{m[0].toUpperCase() + m.slice(1)}
							</button>
						))}
					</div>
					{onShare && (
						<button
							type="button"
							onClick={onShare}
							className="text-xs font-semibold px-3 py-1 rounded border border-border"
						>
							Share
						</button>
					)}
				</div>
			</div>
			<div className="p-4 md:p-5">
				{view === 'ladder' && <CupLadder data={data} />}
				{view === 'grid' && <CupGrid data={data} />}
				{view === 'timeline' && <CupTimeline data={data} />}
			</div>
		</div>
	)
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/standings/cup-standings.tsx
git commit -m "feat(standings): add cup-standings tab wrapper"
```

---

### Task 14: Hook cup standings into game detail

**Files:**
- Modify: `src/components/game/game-detail-view.tsx`
- Modify: `src/app/(app)/game/[id]/page.tsx`

- [ ] **Step 1: Extend game-detail-view props**

Add a `cupStandings?: CupLadderData` prop. In the body, render the `CupStandings` component when provided:

```tsx
{cupStandings && <CupStandings data={cupStandings} />}
```

- [ ] **Step 2: Wire from the page**

In the cup branch of the page file, call `getCupLadderData(gameId, session.user.id)` and pass to `GameDetailView`.

- [ ] **Step 3: Manual verification**

Run: `just db-reset && just dev`

(If you don't have a cup game seeded, add one to `scripts/seed.ts` — a turbo game re-badged as cup mode with startingLives=3 is a quick hack for dev.) Actually: add it explicitly — see Task 14b.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/game-detail-view.tsx src/app/\(app\)/game/
git commit -m "feat(game): render cup standings for cup-mode games"
```

---

### Task 14b: Dev seed data for cup mode

**Files:**
- Modify: `scripts/seed.ts`

Add a cup-mode game to the dev seed so the cup pick interface and standings can be exercised locally.

- [ ] **Step 1: Add a cup game seed**

```typescript
{
	name: 'Cup Tuesday (GW7)',
	mode: 'cup',
	creatorEmail: 'dev@example.com',
	players: [
		'dev@example.com', 'dave@example.com', 'mike@example.com', 'rich@example.com',
	],
	entryFee: '10.00',
	turboRoundNumber: 7, // reuse the turbo seed's single-round model
	turboState: 'live',
},
```

And in the seed loop, when `mode === 'cup'`, seed `startingLives: 3, numberOfPicks: 6` in `modeConfig` and set `gamePlayer.livesRemaining = 3` on insert.

Because dev runs against PL (not WC), tier differences will all be zero — cup mode will functionally behave like turbo. That's OK for dev: it exercises the layout and wiring. Full tier-mechanic verification happens when WC data is bootstrapped in a live env post-Phase 4.5.

- [ ] **Step 2: Run and verify**

Run: `just db-reset && just dev`

Visit the cup game, confirm the cup pick interface renders, make picks, view standings.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): add a cup-mode game for local dev"
```

---

## Part B — 4b2: Classic pick planner

### Task 15: Chain ribbon component

**Files:**
- Create: `src/components/picks/chain-ribbon.tsx`

Horizontal scrollable strip. Each gameweek slot has a state: `win | loss | draw | current | planned | planned-locked | empty | tbc`.

- [ ] **Step 1: Implement**

```typescript
// src/components/picks/chain-ribbon.tsx
'use client'

import { cn } from '@/lib/utils'

export type ChainSlotState =
	| { kind: 'win'; teamShort: string; teamColour: string | null }
	| { kind: 'loss'; teamShort: string; teamColour: string | null }
	| { kind: 'draw'; teamShort: string; teamColour: string | null }
	| { kind: 'current'; teamShort: string | null; teamColour: string | null }
	| { kind: 'planned'; teamShort: string; teamColour: string | null }
	| { kind: 'planned-locked'; teamShort: string; teamColour: string | null }
	| { kind: 'empty' }
	| { kind: 'tbc' }

export interface ChainSlot {
	roundId: string
	roundNumber: number
	state: ChainSlotState
}

interface ChainRibbonProps {
	slots: ChainSlot[]
	summary: { played: number; planned: number; availableTeams: number; totalTeams: number }
}

export function ChainRibbon({ slots, summary }: ChainRibbonProps) {
	return (
		<div className="rounded-xl border border-border bg-card px-3 py-2.5">
			<div className="flex justify-between items-center mb-2">
				<div>
					<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Your pick chain
					</div>
					<div className="text-xs text-muted-foreground">
						{summary.played} played · {summary.planned} planned · {summary.availableTeams} of {summary.totalTeams} teams available
					</div>
				</div>
				<div className="flex gap-3 text-[10px] text-muted-foreground">
					<Legend colour="bg-[var(--alive)]" label="Win" />
					<Legend colour="bg-[var(--eliminated)]" label="Loss" />
					<Legend colour="bg-[#7c3aed]" label="Planned" />
				</div>
			</div>
			<div className="flex gap-1 overflow-x-auto py-1">
				{slots.map(s => (
					<Slot key={s.roundId} slot={s} />
				))}
			</div>
		</div>
	)
}

function Legend({ colour, label }: { colour: string; label: string }) {
	return (
		<span className="flex items-center gap-1">
			<span className={cn('h-2 w-2 rounded-full', colour)} />
			{label}
		</span>
	)
}

function Slot({ slot }: { slot: ChainSlot }) {
	const s = slot.state
	const wrapperClass = cn(
		'flex-none w-[54px] text-center px-1 py-1.5 rounded-md border bg-card',
		s.kind === 'win' && 'bg-[var(--alive-bg)] border-[var(--alive)]',
		s.kind === 'loss' && 'bg-[var(--eliminated-bg)] border-[var(--eliminated)]',
		s.kind === 'draw' && 'bg-[var(--draw-bg)] border-[var(--draw)]',
		s.kind === 'current' && 'border-2 border-[var(--alive)] shadow-[inset_0_0_0_1px_var(--alive)]',
		s.kind === 'planned' && 'border-2 border-dashed border-[#7c3aed] bg-[#f5f3ff]',
		s.kind === 'planned-locked' && 'border-2 border-[#7c3aed] bg-[#ede9fe]',
		s.kind === 'empty' && 'border-dashed text-muted-foreground',
		s.kind === 'tbc' && 'border-dashed opacity-55',
	)
	return (
		<div className={wrapperClass}>
			<div className="text-[9px] uppercase text-muted-foreground">GW{slot.roundNumber}</div>
			{('teamShort' in s) && s.teamShort ? (
				<div
					className="mx-auto mt-1 h-7 w-7 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
					style={{ backgroundColor: s.teamColour ?? '#888' }}
				>
					{s.teamShort}
				</div>
			) : (
				<div className="mt-1 text-base opacity-50">?</div>
			)}
			{s.kind === 'planned-locked' && (
				<div className="text-[7px] font-bold text-[#7c3aed] mt-0.5">AUTO</div>
			)}
		</div>
	)
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/picks/chain-ribbon.tsx
git commit -m "feat(picks): add chain-ribbon for pick-chain visualisation"
```

---

### Task 16: Planned-picks pure validation

**Files:**
- Create: `src/lib/game/planned-picks.ts`
- Create: `src/lib/game/planned-picks.test.ts`

Pure functions for planner cascade validation.

- [ ] **Step 1: Write the tests**

```typescript
// src/lib/game/planned-picks.test.ts
import { describe, expect, it } from 'vitest'
import { validatePlannedPick, computeUsedTeamIds } from './planned-picks'

describe('computeUsedTeamIds', () => {
	it('returns teams used in completed past rounds', () => {
		const used = computeUsedTeamIds({
			pastPicks: [{ roundNumber: 1, teamId: 't-ars' }, { roundNumber: 2, teamId: 't-liv' }],
			plannedPicks: [],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual(['t-ars', 't-liv'])
	})

	it('includes planned picks from other rounds', () => {
		const used = computeUsedTeamIds({
			pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
			plannedPicks: [{ roundNumber: 4, teamId: 't-che' }, { roundNumber: 5, teamId: 't-mci' }],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual(['t-ars', 't-che'])
	})

	it('excludes the target round so the user can change their own plan', () => {
		const used = computeUsedTeamIds({
			pastPicks: [],
			plannedPicks: [{ roundNumber: 5, teamId: 't-ars' }],
			excludeRoundNumber: 5,
		})
		expect([...used]).toEqual([])
	})
})

describe('validatePlannedPick', () => {
	it('allows a pick of an unused team', () => {
		expect(validatePlannedPick({
			teamId: 't-che',
			roundNumber: 5,
			pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
			plannedPicks: [{ roundNumber: 4, teamId: 't-liv' }],
		})).toEqual({ valid: true })
	})

	it('rejects when team was used in a past round', () => {
		expect(validatePlannedPick({
			teamId: 't-ars',
			roundNumber: 5,
			pastPicks: [{ roundNumber: 1, teamId: 't-ars' }],
			plannedPicks: [],
		})).toEqual({ valid: false, reason: 'team-already-used', roundNumber: 1 })
	})

	it('rejects when team is already planned for another round', () => {
		expect(validatePlannedPick({
			teamId: 't-che',
			roundNumber: 5,
			pastPicks: [],
			plannedPicks: [{ roundNumber: 3, teamId: 't-che' }],
		})).toEqual({ valid: false, reason: 'team-already-planned', roundNumber: 3 })
	})

	it('allows replacing the target round’s own plan', () => {
		expect(validatePlannedPick({
			teamId: 't-che',
			roundNumber: 5,
			pastPicks: [],
			plannedPicks: [{ roundNumber: 5, teamId: 't-che' }],
		})).toEqual({ valid: true })
	})
})
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/game/planned-picks.ts
export interface PastPick {
	roundNumber: number
	teamId: string
}

export interface PlannedPick {
	roundNumber: number
	teamId: string
}

export function computeUsedTeamIds(input: {
	pastPicks: PastPick[]
	plannedPicks: PlannedPick[]
	excludeRoundNumber: number
}): Set<string> {
	const used = new Set<string>()
	for (const p of input.pastPicks) used.add(p.teamId)
	for (const p of input.plannedPicks) {
		if (p.roundNumber === input.excludeRoundNumber) continue
		used.add(p.teamId)
	}
	return used
}

export type ValidationResult =
	| { valid: true }
	| { valid: false; reason: 'team-already-used' | 'team-already-planned'; roundNumber: number }

export function validatePlannedPick(input: {
	teamId: string
	roundNumber: number
	pastPicks: PastPick[]
	plannedPicks: PlannedPick[]
}): ValidationResult {
	const pastHit = input.pastPicks.find(p => p.teamId === input.teamId)
	if (pastHit) return { valid: false, reason: 'team-already-used', roundNumber: pastHit.roundNumber }
	const planHit = input.plannedPicks.find(p => p.teamId === input.teamId && p.roundNumber !== input.roundNumber)
	if (planHit) return { valid: false, reason: 'team-already-planned', roundNumber: planHit.roundNumber }
	return { valid: true }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run src/lib/game/planned-picks.test.ts`
Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/planned-picks.ts src/lib/game/planned-picks.test.ts
git commit -m "feat(game): add planned-picks pure validation helpers"
```

---

### Task 17: GET + POST /api/games/[id]/planned-picks

**Files:**
- Create: `src/app/api/games/[id]/planned-picks/route.ts`
- Create: `src/app/api/games/[id]/planned-picks/route.test.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/games/[id]/planned-picks/route.ts
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { validatePlannedPick, type PastPick, type PlannedPick as PPick } from '@/lib/game/planned-picks'
import { round } from '@/lib/schema/competition'
import { game, gamePlayer, pick, plannedPick } from '@/lib/schema/game'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const membership = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})
	if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

	const plans = await db.query.plannedPick.findMany({
		where: eq(plannedPick.gamePlayerId, membership.id),
	})
	return NextResponse.json({ plans })
}

interface PostBody {
	roundId: string
	teamId: string
	autoSubmit: boolean
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params
	const body = (await request.json()) as PostBody

	const [membership, g, r] = await Promise.all([
		db.query.gamePlayer.findFirst({
			where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
		}),
		db.query.game.findFirst({ where: eq(game.id, gameId) }),
		db.query.round.findFirst({ where: eq(round.id, body.roundId) }),
	])
	if (!membership || !g || !r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (g.gameMode !== 'classic') {
		return NextResponse.json({ error: 'planner is classic-only' }, { status: 400 })
	}
	if (r.status !== 'upcoming') {
		return NextResponse.json({ error: 'cannot plan for a started round' }, { status: 400 })
	}

	// Load this player's past picks and existing plans with their round numbers
	const [pastPickRows, planRows] = await Promise.all([
		db.query.pick.findMany({
			where: eq(pick.gamePlayerId, membership.id),
			with: { round: true },
		}),
		db.query.plannedPick.findMany({
			where: eq(plannedPick.gamePlayerId, membership.id),
			with: { round: true },
		}),
	])
	const pastPicks: PastPick[] = pastPickRows.map(p => ({ roundNumber: p.round.number, teamId: p.teamId }))
	const plannedPicks: PPick[] = planRows.map(p => ({ roundNumber: p.round.number, teamId: p.teamId }))

	const result = validatePlannedPick({
		teamId: body.teamId,
		roundNumber: r.number,
		pastPicks,
		plannedPicks,
	})
	if (!result.valid) {
		return NextResponse.json({ error: result.reason, roundNumber: result.roundNumber }, { status: 400 })
	}

	// Upsert: delete existing plan for this (player, round) and insert new
	await db.delete(plannedPick).where(and(
		eq(plannedPick.gamePlayerId, membership.id),
		eq(plannedPick.roundId, body.roundId),
	))
	const [created] = await db.insert(plannedPick).values({
		gamePlayerId: membership.id,
		roundId: body.roundId,
		teamId: body.teamId,
		autoSubmit: body.autoSubmit,
	}).returning()

	return NextResponse.json({ plan: created })
}
```

- [ ] **Step 2: Write a test**

```typescript
// src/app/api/games/[id]/planned-picks/route.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({
	requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/db', () => ({
	db: {
		query: {
			gamePlayer: { findFirst: vi.fn() },
			game: { findFirst: vi.fn() },
			round: { findFirst: vi.fn() },
			pick: { findMany: vi.fn().mockResolvedValue([]) },
			plannedPick: { findMany: vi.fn().mockResolvedValue([]) },
		},
		delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'plan-1' }]) })),
		})),
	},
}))

import { GET, POST } from './route'
import { db } from '@/lib/db'

function makeReq(body: unknown, method: 'GET' | 'POST' = 'POST'): Request {
	return new Request('http://x/api/games/g1/planned-picks', {
		method,
		headers: { 'content-type': 'application/json' },
		body: method === 'POST' ? JSON.stringify(body) : undefined,
	})
}

const ctx = { params: Promise.resolve({ id: 'g1' }) }

describe('planned-picks route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('GET returns 403 if not a member', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue(undefined as never)
		const res = await GET(makeReq(null, 'GET'), ctx)
		expect(res.status).toBe(403)
	})

	it('POST rejects non-classic games', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'turbo' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ status: 'upcoming', number: 5 } as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: false }), ctx)
		expect(res.status).toBe(400)
		expect(await res.json()).toEqual({ error: 'planner is classic-only' })
	})

	it('POST rejects starting rounds', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'classic' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ status: 'open', number: 5 } as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: false }), ctx)
		expect(res.status).toBe(400)
	})

	it('POST succeeds for valid plan', async () => {
		vi.mocked(db.query.gamePlayer.findFirst).mockResolvedValue({ id: 'gp' } as never)
		vi.mocked(db.query.game.findFirst).mockResolvedValue({ gameMode: 'classic' } as never)
		vi.mocked(db.query.round.findFirst).mockResolvedValue({ status: 'upcoming', number: 5 } as never)
		const res = await POST(makeReq({ roundId: 'r1', teamId: 't1', autoSubmit: true }), ctx)
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ plan: { id: 'plan-1' } })
	})
})
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec vitest run src/app/api/games/\[id\]/planned-picks/
git add src/app/api/games/\[id\]/planned-picks/
git commit -m "feat(api): add planned-picks GET + POST"
```

---

### Task 18: DELETE /api/games/[id]/planned-picks/[roundId]

**Files:**
- Create: `src/app/api/games/[id]/planned-picks/[roundId]/route.ts`

- [ ] **Step 1: Implement**

```typescript
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { gamePlayer, plannedPick } from '@/lib/schema/game'

type Ctx = { params: Promise<{ id: string; roundId: string }> }

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, roundId } = await ctx.params
	const membership = await db.query.gamePlayer.findFirst({
		where: and(eq(gamePlayer.gameId, gameId), eq(gamePlayer.userId, session.user.id)),
	})
	if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
	await db.delete(plannedPick).where(and(
		eq(plannedPick.gamePlayerId, membership.id),
		eq(plannedPick.roundId, roundId),
	))
	return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/api/games/\[id\]/planned-picks/
git commit -m "feat(api): add planned-picks DELETE"
```

---

### Task 19: Planner round card component

**Files:**
- Create: `src/components/picks/planner-round.tsx`

Single future-round card. Shows the round's fixtures with both sides selectable, applying per-side state from cascading used-state. Includes auto-submit toggle in the header.

- [ ] **Step 1: Implement**

```typescript
'use client'

import { useState } from 'react'
import { FixtureRow } from './fixture-row'
import { cn } from '@/lib/utils'

export interface PlannerFixture {
	id: string
	homeTeam: { id: string; short: string; name: string; colour: string | null; badgeUrl: string | null }
	awayTeam: { id: string; short: string; name: string; colour: string | null; badgeUrl: string | null }
	kickoff: Date | null
}

export interface UsedInfo {
	teamId: string
	label: string       // e.g. "USED GW3" or "PLANNED GW27"
	kind: 'used' | 'planned-elsewhere'
}

interface PlannerRoundProps {
	roundId: string
	roundNumber: number
	roundName: string
	deadline: Date | null
	fixturesTbc: boolean
	fixtures: PlannerFixture[]
	usedTeams: UsedInfo[]
	plannedTeamId: string | null
	plannedAutoSubmit: boolean
	onPlan: (roundId: string, teamId: string, autoSubmit: boolean) => Promise<void>
	onRemove: (roundId: string) => Promise<void>
	onToggleAuto: (roundId: string, autoSubmit: boolean) => Promise<void>
}

export function PlannerRound(props: PlannerRoundProps) {
	const [pending, setPending] = useState(false)
	if (props.fixturesTbc) {
		return (
			<div className="rounded-xl border border-border bg-muted/30 px-3 py-3 opacity-55">
				<div className="flex justify-between items-center">
					<div className="font-semibold text-sm">GW{props.roundNumber} · Fixtures TBC</div>
					<span className="text-[11px] text-muted-foreground">Planner unlocks when fixtures are published</span>
				</div>
			</div>
		)
	}
	return (
		<div className="rounded-xl border border-border bg-card px-3 py-3">
			<div className="flex justify-between items-center mb-2">
				<div>
					<div className="font-semibold text-sm">GW{props.roundNumber} · {props.roundName}</div>
					{props.deadline && <div className="text-[11px] text-muted-foreground">Deadline {formatDeadline(props.deadline)}</div>}
				</div>
				<label className={cn('flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer', pending && 'opacity-50')}>
					<span>Auto-submit</span>
					<input
						type="checkbox"
						className="sr-only peer"
						checked={props.plannedAutoSubmit}
						disabled={pending || !props.plannedTeamId}
						onChange={async e => {
							setPending(true)
							try { await props.onToggleAuto(props.roundId, e.target.checked) } finally { setPending(false) }
						}}
					/>
					<span className="relative w-7 h-4 bg-muted rounded-full peer-checked:bg-[#7c3aed]">
						<span className="absolute top-[2px] left-[2px] w-3 h-3 bg-white rounded-full transition-all peer-checked:left-[14px]" />
					</span>
				</label>
			</div>
			{props.fixtures.map(f => {
				const homeUsed = props.usedTeams.find(u => u.teamId === f.homeTeam.id)
				const awayUsed = props.usedTeams.find(u => u.teamId === f.awayTeam.id)
				const homeIsPlan = f.homeTeam.id === props.plannedTeamId
				const awayIsPlan = f.awayTeam.id === props.plannedTeamId
				const planKind = props.plannedAutoSubmit ? 'auto-locked' : 'tentative'
				return (
					<FixtureRow
						key={f.id}
						home={{ shortName: f.homeTeam.short, name: f.homeTeam.name, badgeUrl: f.homeTeam.badgeUrl, primaryColor: f.homeTeam.colour }}
						away={{ shortName: f.awayTeam.short, name: f.awayTeam.name, badgeUrl: f.awayTeam.badgeUrl, primaryColor: f.awayTeam.colour }}
						kickoff={f.kickoff}
						homeState={homeIsPlan
							? { kind: planKind }
							: homeUsed
								? { kind: homeUsed.kind, label: homeUsed.label }
								: undefined}
						awayState={awayIsPlan
							? { kind: planKind }
							: awayUsed
								? { kind: awayUsed.kind, label: awayUsed.label }
								: undefined}
						onPickHome={homeUsed ? undefined : () => props.onPlan(props.roundId, f.homeTeam.id, props.plannedAutoSubmit)}
						onPickAway={awayUsed ? undefined : () => props.onPlan(props.roundId, f.awayTeam.id, props.plannedAutoSubmit)}
					/>
				)
			})}
			{props.plannedTeamId && (
				<button
					type="button"
					className="mt-2 text-[11px] text-muted-foreground underline"
					onClick={() => props.onRemove(props.roundId)}
				>
					Clear plan
				</button>
			)}
		</div>
	)
}

function formatDeadline(d: Date): string {
	return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/picks/planner-round.tsx
git commit -m "feat(picks): add planner-round card component"
```

---

### Task 20: Integrate chain-ribbon + planner into classic-pick

**Files:**
- Modify: `src/components/picks/classic-pick.tsx`
- Modify: `src/app/(app)/game/[id]/page.tsx`

- [ ] **Step 1: Extend classic-pick props**

Add `chain`, `futureRounds`, `plans`, and handlers:

```typescript
interface ClassicPickProps {
	// existing…
	chain?: { slots: ChainSlot[]; summary: ChainSummary }
	futureRounds?: PlannerRoundInput[]
	planHandlers?: {
		onPlan: (roundId: string, teamId: string, autoSubmit: boolean) => Promise<void>
		onRemove: (roundId: string) => Promise<void>
		onToggleAuto: (roundId: string, autoSubmit: boolean) => Promise<void>
	}
}
```

In the render, add the ribbon at top and a collapsible planner section below:

```tsx
{chain && <ChainRibbon slots={chain.slots} summary={chain.summary} />}
<div className="mt-4">{/* existing current-round card */}</div>
{futureRounds && futureRounds.length > 0 && (
	<PlannerSection rounds={futureRounds} handlers={planHandlers!} />
)}
```

`PlannerSection` is a local collapsible wrapper (remembers state in `localStorage`).

- [ ] **Step 2: Build the page-level data assembly**

In `src/app/(app)/game/[id]/page.tsx`, classic branch:

```typescript
// Build chain slots from all rounds + my past picks + my plans
// Build future rounds input from upcoming rounds + their fixtures
// Wire handlers to the /api/games/[id]/planned-picks endpoints via fetch
```

Extract the data-assembly into `src/lib/game/classic-planner-view.ts` for testability.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/picks/classic-pick.tsx src/app/\(app\)/game/ src/lib/game/classic-planner-view.ts
git commit -m "feat(picks): integrate chain-ribbon and planner into classic-pick"
```

---

### Task 21: enqueueAutoSubmit QStash helper

**Files:**
- Modify: `src/lib/data/qstash.ts`
- Modify: `src/lib/data/qstash.test.ts`

- [ ] **Step 1: Extend the QStashJob union**

```typescript
export type QStashJob =
	| { type: 'process_round'; gameId: string; roundId: string }
	| { type: 'deadline_reminder'; gameId: string; roundId: string; window: '24h' | '2h' }
	| { type: 'auto_submit'; gamePlayerId: string; roundId: string; teamId: string }
```

Add the helper:

```typescript
export async function enqueueAutoSubmit(
	gamePlayerId: string,
	roundId: string,
	teamId: string,
	notBefore: Date,
): Promise<void> {
	await client().publishJSON({
		url: handlerUrl(),
		body: { type: 'auto_submit', gamePlayerId, roundId, teamId } satisfies QStashJob,
		notBefore: Math.floor(notBefore.getTime() / 1000),
	})
}
```

- [ ] **Step 2: Add a test**

Append to `qstash.test.ts`:

```typescript
it('enqueues an auto-submit at the given timestamp', async () => {
	const notBefore = new Date('2026-06-11T12:00:00Z')
	await enqueueAutoSubmit('gp-1', 'r-1', 't-1', notBefore)
	const call = publishJSONMock.mock.calls[0][0]
	expect(call.body).toEqual({ type: 'auto_submit', gamePlayerId: 'gp-1', roundId: 'r-1', teamId: 't-1' })
	expect(call.notBefore).toBe(Math.floor(notBefore.getTime() / 1000))
})
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec vitest run src/lib/data/qstash.test.ts
git add src/lib/data/qstash.ts src/lib/data/qstash.test.ts
git commit -m "feat(qstash): add enqueueAutoSubmit helper"
```

---

### Task 22: auto_submit case in qstash-handler

**Files:**
- Modify: `src/app/api/cron/qstash-handler/route.ts`
- Modify: `src/app/api/cron/qstash-handler/route.test.ts`

- [ ] **Step 1: Add the handler case**

```typescript
case 'auto_submit': {
	await submitPlannedPick(body.gamePlayerId, body.roundId, body.teamId)
	return NextResponse.json({ ok: true })
}
```

Implement `submitPlannedPick` in a new file `src/lib/game/auto-submit.ts`:

```typescript
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fixture } from '@/lib/schema/competition'
import { gamePlayer, pick, plannedPick } from '@/lib/schema/game'

export async function submitPlannedPick(
	gamePlayerId: string,
	roundId: string,
	teamId: string,
): Promise<{ submitted: boolean; reason?: string }> {
	// Verify plan still exists (player might have removed it)
	const plan = await db.query.plannedPick.findFirst({
		where: and(eq(plannedPick.gamePlayerId, gamePlayerId), eq(plannedPick.roundId, roundId)),
	})
	if (!plan || plan.teamId !== teamId) return { submitted: false, reason: 'plan-removed' }

	const gp = await db.query.gamePlayer.findFirst({ where: eq(gamePlayer.id, gamePlayerId) })
	if (!gp || gp.status !== 'alive') return { submitted: false, reason: 'player-not-alive' }

	// Verify no pick already submitted for this round
	const existingPick = await db.query.pick.findFirst({
		where: and(eq(pick.gamePlayerId, gamePlayerId), eq(pick.roundId, roundId)),
	})
	if (existingPick) return { submitted: false, reason: 'already-picked' }

	// Find the fixture where this team plays in this round
	const fixturesInRound = await db.query.fixture.findMany({ where: eq(fixture.roundId, roundId) })
	const fx = fixturesInRound.find(f => f.homeTeamId === teamId || f.awayTeamId === teamId)
	if (!fx) return { submitted: false, reason: 'team-not-in-round' }

	// Write the pick with auto_submitted = true, then clear the plan
	await db.insert(pick).values({
		gameId: gp.gameId,
		gamePlayerId,
		roundId,
		teamId,
		fixtureId: fx.id,
		autoSubmitted: true,
	})
	await db.delete(plannedPick).where(eq(plannedPick.id, plan.id))
	return { submitted: true }
}
```

- [ ] **Step 2: Extend the test**

Append to `qstash-handler/route.test.ts`:

```typescript
const submitPlannedPickMock = vi.fn().mockResolvedValue({ submitted: true })
vi.mock('@/lib/game/auto-submit', () => ({ submitPlannedPick: submitPlannedPickMock }))

it('dispatches auto_submit jobs', async () => {
	const res = await POST(req({ type: 'auto_submit', gamePlayerId: 'gp', roundId: 'r', teamId: 't' }))
	expect(res.status).toBe(200)
	expect(submitPlannedPickMock).toHaveBeenCalledWith('gp', 'r', 't')
})
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec vitest run src/app/api/cron/qstash-handler/
git add src/app/api/cron/qstash-handler/ src/lib/game/auto-submit.ts
git commit -m "feat(qstash): add auto_submit handler + plan realisation"
```

---

### Task 23: Daily-sync round-transition detection for auto-submits

**Files:**
- Modify: `src/app/api/cron/daily-sync/route.ts`
- Modify: `src/lib/game/bootstrap-competitions.ts`

When `syncCompetition` transitions a round's status from `upcoming` → `open` (because adapter now says it's open), scan `planned_pick` rows for this round and enqueue an `auto_submit` for each one where `autoSubmit = true`, scheduled for `deadline - 60s`.

- [ ] **Step 1: Detect the transition in syncCompetition**

```typescript
// Inside syncCompetition, when updating a round:
const transitioningToOpen = existingRound && existingRound.status === 'upcoming' && /* adapter says now open */
if (transitioningToOpen && ar.deadline) {
	const plans = await db.query.plannedPick.findMany({ where: eq(plannedPick.roundId, existingRound.id) })
	const autoPlans = plans.filter(p => p.autoSubmit)
	const notBefore = new Date(ar.deadline.getTime() - 60_000)
	for (const p of autoPlans) {
		await enqueueAutoSubmit(p.gamePlayerId, p.roundId, p.teamId, notBefore)
	}
}
```

Wait — the spec phrases "upcoming → open" as a status transition, but the adapter never tells us "this round is open"; it tells us the deadline and fixtures. So "open" is a time-derived state: if `deadline` is within, say, 48 hours, the round should be marked `open`. The current sync logic preserves `existingRound.status` except setting to `completed` when finished. We need to add the `upcoming → open` transition.

Change the round-update in `syncCompetition` to:

```typescript
const newStatus: 'upcoming' | 'open' | 'active' | 'completed' =
	ar.finished ? 'completed' :
	(ar.deadline && ar.deadline.getTime() - Date.now() < 48 * 3600 * 1000) ? 'open' :
	existingRound?.status ?? 'upcoming'
```

- [ ] **Step 2: Wire enqueue**

If the status just flipped from a non-`open` state to `open`, enqueue auto-submits.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`

```bash
git add src/lib/game/bootstrap-competitions.ts src/app/api/cron/daily-sync/
git commit -m "feat(sync): enqueue planned auto-submits on round open"
```

---

## Part C — 4b3: Payment claim flow

### Task 24: Schema migration

**Files:**
- Modify: `src/lib/schema/payment.ts`
- Create: `drizzle/NNNN_add_payment_claimed_status.sql` (auto-generated)

- [ ] **Step 1: Update the Drizzle schema**

```typescript
// src/lib/schema/payment.ts
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'claimed', 'paid', 'refunded'])

export const payment = pgTable('payment', {
	id: uuid('id').primaryKey().defaultRandom(),
	gameId: uuid('game_id').notNull().references(() => game.id),
	userId: text('user_id').notNull(),
	amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
	status: paymentStatusEnum('status').notNull().default('pending'),
	method: paymentMethodEnum('method').notNull().default('manual'),
	claimedAt: timestamp('claimed_at'),            // NEW
	paidAt: timestamp('paid_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Generate migration**

Run: `pnpm exec drizzle-kit generate`

Expected: a new migration file appears in `drizzle/` that adds `'claimed'` to the enum and `claimed_at` column.

- [ ] **Step 3: Apply and verify**

Run: `pnpm exec drizzle-kit migrate`
Expected: applies cleanly to local DB.

Confirm with:
```bash
psql $DATABASE_URL -c "\d payment"
```
Shows `claimed_at` column and the updated enum.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema/payment.ts drizzle/
git commit -m "feat(schema): add 'claimed' payment status and claimed_at column"
```

---

### Task 25: Rewrite calculatePot

**Files:**
- Modify: `src/lib/game-logic/prizes.ts`
- Modify: `src/lib/game-logic/prizes.test.ts`

Breaking API change from `(entryFee, playerCount)` to `(payments)`.

- [ ] **Step 1: Write the new tests**

```typescript
// src/lib/game-logic/prizes.test.ts
import { describe, expect, it } from 'vitest'
import { calculatePot } from './prizes'

describe('calculatePot', () => {
	it('returns all zeros on empty input', () => {
		expect(calculatePot([])).toEqual({ confirmed: '0.00', pending: '0.00', total: '0.00' })
	})

	it('sums paid rows into confirmed', () => {
		expect(calculatePot([
			{ amount: '10.00', status: 'paid' },
			{ amount: '10.00', status: 'paid' },
		])).toEqual({ confirmed: '20.00', pending: '0.00', total: '20.00' })
	})

	it('separates claimed into pending', () => {
		expect(calculatePot([
			{ amount: '10.00', status: 'paid' },
			{ amount: '10.00', status: 'claimed' },
		])).toEqual({ confirmed: '10.00', pending: '10.00', total: '20.00' })
	})

	it('ignores pending and refunded', () => {
		expect(calculatePot([
			{ amount: '10.00', status: 'paid' },
			{ amount: '10.00', status: 'pending' },
			{ amount: '10.00', status: 'refunded' },
		])).toEqual({ confirmed: '10.00', pending: '0.00', total: '10.00' })
	})

	it('handles multiple payments per player (rebuy pre-wiring)', () => {
		expect(calculatePot([
			{ amount: '10.00', status: 'paid' },
			{ amount: '10.00', status: 'paid' }, // rebuy
		])).toEqual({ confirmed: '20.00', pending: '0.00', total: '20.00' })
	})
})
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/game-logic/prizes.ts
export interface PaymentLike {
	amount: string
	status: string
}

export interface PotBreakdown {
	confirmed: string
	pending: string
	total: string
}

export function calculatePot(payments: PaymentLike[]): PotBreakdown {
	let paid = 0
	let claimed = 0
	for (const p of payments) {
		if (p.status === 'paid') paid += Number.parseFloat(p.amount)
		else if (p.status === 'claimed') claimed += Number.parseFloat(p.amount)
	}
	return {
		confirmed: paid.toFixed(2),
		pending: claimed.toFixed(2),
		total: (paid + claimed).toFixed(2),
	}
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run src/lib/game-logic/prizes.test.ts`
Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-logic/prizes.ts src/lib/game-logic/prizes.test.ts
git commit -m "feat(prizes): rewrite calculatePot with claimed/paid breakdown"
```

---

### Task 26: Update calculatePot callers

**Files:**
- Modify: `src/lib/game/queries.ts`
- Modify: `src/lib/game/detail-queries.ts`
- Modify: any other caller (`grep -r "calculatePot(" src/` to find them)

- [ ] **Step 1: Find callers**

Run:
```
pnpm exec tsc --noEmit
```

The compiler will error at every caller with the old signature. Fix each.

- [ ] **Step 2: queries.ts**

Load payment rows for each game and pass them:

```typescript
const payments = await db.query.payment.findMany({ where: eq(payment.gameId, g.id) })
const potBreakdown = calculatePot(payments)
// Previously: pot: string. Now: pot: { confirmed, pending, total } — update DashboardGame type.
```

Update `DashboardGame.pot` to `{ confirmed: string; pending: string; total: string }`. Update consumers (the `GameCard` component).

- [ ] **Step 3: detail-queries.ts**

Same: load payments for the game, call `calculatePot`, return the breakdown. `getGameDetail` response shape changes.

- [ ] **Step 4: Re-run typecheck + tests**

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/ src/components/game/
git commit -m "refactor: update calculatePot callers to new breakdown API"
```

---

### Task 27: Claim payment route

**Files:**
- Create: `src/app/api/games/[id]/payments/claim/route.ts`
- Create: `src/app/api/games/[id]/payments/claim/route.test.ts`

- [ ] **Step 1: Implement**

```typescript
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId } = await ctx.params

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, session.user.id)),
	})
	if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (existing.status !== 'pending') {
		return NextResponse.json({ error: 'not-pending' }, { status: 400 })
	}
	await db.update(payment)
		.set({ status: 'claimed', claimedAt: new Date() })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Test**

```typescript
// src/app/api/games/[id]/payments/claim/route.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('@/lib/db', () => ({
	db: {
		query: { payment: { findFirst: vi.fn() } },
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
	},
}))

import { POST } from './route'
import { db } from '@/lib/db'

const ctx = { params: Promise.resolve({ id: 'g1' }) }

describe('claim payment route', () => {
	beforeEach(() => vi.clearAllMocks())

	it('404s if no payment row exists', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue(undefined as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(404)
	})

	it('400s if payment is already claimed or paid', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ status: 'paid' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(400)
	})

	it('200s for a pending payment', async () => {
		vi.mocked(db.query.payment.findFirst).mockResolvedValue({ id: 'p1', status: 'pending' } as never)
		const res = await POST(new Request('http://x', { method: 'POST' }), ctx)
		expect(res.status).toBe(200)
	})
})
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec vitest run src/app/api/games/\[id\]/payments/claim/
git add src/app/api/games/\[id\]/payments/claim/
git commit -m "feat(api): add payment claim route"
```

---

### Task 28: Confirm payment route

**Files:**
- Create: `src/app/api/games/[id]/payments/[userId]/confirm/route.ts`
- Create: `src/app/api/games/[id]/payments/[userId]/confirm/route.test.ts`

- [ ] **Step 1: Implement**

```typescript
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { game } from '@/lib/schema/game'
import { payment } from '@/lib/schema/payment'

type Ctx = { params: Promise<{ id: string; userId: string }> }

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
	const session = await requireSession()
	const { id: gameId, userId } = await ctx.params

	const g = await db.query.game.findFirst({ where: eq(game.id, gameId) })
	if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (g.createdBy !== session.user.id) {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
	}

	const existing = await db.query.payment.findFirst({
		where: and(eq(payment.gameId, gameId), eq(payment.userId, userId)),
	})
	if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
	if (existing.status !== 'claimed') {
		return NextResponse.json({ error: 'not-claimed' }, { status: 400 })
	}
	await db.update(payment)
		.set({ status: 'paid', paidAt: new Date() })
		.where(eq(payment.id, existing.id))
	return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Test (auth + state transition)**

Same shape as claim route's test: 403 for non-admin, 404 for missing game/payment, 400 for non-claimed state, 200 for happy path.

- [ ] **Step 3: Run tests + commit**

```bash
pnpm exec vitest run src/app/api/games/\[id\]/payments/\[userId\]/confirm/
git add src/app/api/games/\[id\]/payments/\[userId\]/confirm/
git commit -m "feat(api): add payment confirm route (admin)"
```

---

### Task 29: Reject payment route

**Files:**
- Create: `src/app/api/games/[id]/payments/[userId]/reject/route.ts`

Identical pattern to confirm but sets status back to `pending` and clears `claimedAt`.

- [ ] **Step 1: Implement**

```typescript
await db.update(payment)
	.set({ status: 'pending', claimedAt: null })
	.where(eq(payment.id, existing.id))
```

Plus auth checks (admin-only, must be currently `claimed`).

- [ ] **Step 2: Test + commit**

Following the same test pattern.

```bash
git add src/app/api/games/\[id\]/payments/\[userId\]/reject/
git commit -m "feat(api): add payment reject route (admin)"
```

---

### Task 30: Override payment route

**Files:**
- Create: `src/app/api/games/[id]/payments/[userId]/override/route.ts`

Admin-only escape hatch. Body `{ status: 'pending' | 'claimed' | 'paid' }`.

- [ ] **Step 1: Implement**

```typescript
interface Body { status: 'pending' | 'claimed' | 'paid' }

const body = (await request.json()) as Body
if (!['pending', 'claimed', 'paid'].includes(body.status)) {
	return NextResponse.json({ error: 'invalid-status' }, { status: 400 })
}
const update: { status: 'pending' | 'claimed' | 'paid'; claimedAt?: Date | null; paidAt?: Date | null } = { status: body.status }
if (body.status === 'pending') { update.claimedAt = null; update.paidAt = null }
if (body.status === 'claimed') { update.claimedAt = new Date(); update.paidAt = null }
if (body.status === 'paid') { update.paidAt = new Date() }
await db.update(payment).set(update).where(eq(payment.id, existing.id))
```

Plus admin check.

- [ ] **Step 2: Test + commit**

```bash
git add src/app/api/games/\[id\]/payments/\[userId\]/override/
git commit -m "feat(api): add payment override route (admin)"
```

---

### Task 31: my-payment-strip component

**Files:**
- Create: `src/components/game/my-payment-strip.tsx`

Three states: UNPAID (with "Mark as paid" button), AWAITING CONFIRMATION (amber chip), PAID (green chip).

- [ ] **Step 1: Implement**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface MyPaymentStripProps {
	gameId: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded'
	amount: string
	creatorName: string
	onClaimed?: () => void
}

export function MyPaymentStrip({ gameId, status, amount, creatorName, onClaimed }: MyPaymentStripProps) {
	const [pending, setPending] = useState(false)

	async function handleClaim() {
		setPending(true)
		try {
			const res = await fetch(`/api/games/${gameId}/payments/claim`, { method: 'POST' })
			if (!res.ok) throw new Error(String(res.status))
			toast.success('Marked as paid — waiting for admin confirmation')
			onClaimed?.()
		} catch (e) {
			toast.error('Failed to mark as paid')
		} finally {
			setPending(false)
		}
	}

	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5 flex items-center justify-between">
			<div className="flex items-center gap-3">
				<span className="text-sm text-muted-foreground">Your entry fee</span>
				<StatusChip status={status} />
			</div>
			<div className="flex items-center gap-2">
				<span className="text-[11px] text-muted-foreground">£{amount} owed to {creatorName}</span>
				{status === 'pending' && (
					<button type="button"
						className="text-xs font-semibold px-3 py-1.5 rounded bg-foreground text-background disabled:opacity-60"
						disabled={pending}
						onClick={handleClaim}
					>
						Mark as paid
					</button>
				)}
			</div>
		</div>
	)
}

function StatusChip({ status }: { status: MyPaymentStripProps['status'] }) {
	const styles = {
		pending: 'bg-muted text-foreground/70',
		claimed: 'bg-amber-100 text-amber-900',
		paid: 'bg-emerald-100 text-emerald-900',
		refunded: 'bg-muted text-foreground/70',
	}[status]
	const label = {
		pending: 'UNPAID',
		claimed: '⏱ AWAITING CONFIRMATION',
		paid: '✓ PAID',
		refunded: 'REFUNDED',
	}[status]
	return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold', styles)}>{label}</span>
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/game/my-payment-strip.tsx
git commit -m "feat(game): add my-payment-strip component"
```

---

### Task 32: other-players-payments component

**Files:**
- Create: `src/components/game/other-players-payments.tsx`

Compact list for non-admin viewers to see everyone's payment state.

- [ ] **Step 1: Implement**

```typescript
interface OtherPayment {
	userName: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded'
	isRebuy: boolean
}

export function OtherPlayersPayments({ payments }: { payments: OtherPayment[] }) {
	return (
		<div className="space-y-1">
			<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
				Other players
			</div>
			{payments.map((p, i) => (
				<div key={`${p.userName}-${i}`} className="flex justify-between items-center px-3 py-1.5 rounded bg-muted/40 text-[12px]">
					<span>{p.userName}{p.isRebuy ? ' (rebuy)' : ''}</span>
					<StatusChip status={p.status} />
				</div>
			))}
		</div>
	)
}
```

`StatusChip` can be imported from my-payment-strip — export it from there or extract into a new `src/components/game/payment-status-chip.tsx` and import in both. Do the extraction to avoid repeating the JSX.

- [ ] **Step 2: Extract StatusChip**

Move `StatusChip` to `src/components/game/payment-status-chip.tsx` and export. Update `my-payment-strip.tsx` + `other-players-payments.tsx` to import it.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/
git commit -m "feat(game): add other-players-payments and extract StatusChip"
```

---

### Task 33: WhatsApp reminder link builder

**Files:**
- Create: `src/components/game/payment-reminder.tsx`

- [ ] **Step 1: Implement**

```typescript
interface PaymentReminderProps {
	gameName: string
	amount: string
	creatorName: string
	inviteCode: string
	origin?: string
}

export function buildReminderUrl(p: PaymentReminderProps): string {
	const base = p.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
	const inviteUrl = `${base}/join/${p.inviteCode}`
	const text = `Hi! Reminder: you owe £${p.amount} for ${p.gameName}. When you've paid, hit "Mark as paid" in the app: ${inviteUrl}`
	return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function PaymentReminderButton(p: PaymentReminderProps) {
	return (
		<a
			href={buildReminderUrl(p)}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded bg-[#25d366] text-white"
		>
			💬 Remind via WhatsApp
		</a>
	)
}
```

- [ ] **Step 2: Test the builder**

```typescript
// src/components/game/payment-reminder.test.ts
import { describe, expect, it } from 'vitest'
import { buildReminderUrl } from './payment-reminder'

describe('buildReminderUrl', () => {
	it('encodes the reminder text into a wa.me URL', () => {
		const url = buildReminderUrl({
			gameName: 'The Lads LPS',
			amount: '10.00',
			creatorName: 'Dave',
			inviteCode: 'ABC123',
			origin: 'https://lps.example.com',
		})
		expect(url).toContain('https://wa.me/?text=')
		const decoded = decodeURIComponent(url.split('text=')[1])
		expect(decoded).toContain('£10.00')
		expect(decoded).toContain('The Lads LPS')
		expect(decoded).toContain('https://lps.example.com/join/ABC123')
	})
})
```

- [ ] **Step 3: Run test + commit**

```bash
pnpm exec vitest run src/components/game/payment-reminder.test.ts
git add src/components/game/payment-reminder.tsx src/components/game/payment-reminder.test.ts
git commit -m "feat(game): add WhatsApp reminder link builder"
```

---

### Task 34: payments-panel admin component

**Files:**
- Create: `src/components/game/payments-panel.tsx`

The admin-only panel with needs-attention block + all-payments list.

- [ ] **Step 1: Implement**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { StatusChip } from './payment-status-chip'
import { PaymentReminderButton } from './payment-reminder'
import { cn } from '@/lib/utils'

interface AdminPayment {
	userId: string
	userName: string
	amount: string
	status: 'pending' | 'claimed' | 'paid' | 'refunded'
	isRebuy: boolean
	claimedAt: Date | null
	paidAt: Date | null
}

interface PaymentsPanelProps {
	gameId: string
	gameName: string
	inviteCode: string
	totals: { confirmed: string; pending: string; total: string }
	payments: AdminPayment[]
	onChange?: () => void
}

export function PaymentsPanel(props: PaymentsPanelProps) {
	const claimed = props.payments.filter(p => p.status === 'claimed')
	const all = props.payments

	async function callAction(userId: string, action: 'confirm' | 'reject' | 'revert') {
		const endpoint = action === 'confirm' ? 'confirm' : action === 'reject' ? 'reject' : 'override'
		const body = action === 'revert' ? JSON.stringify({ status: 'pending' }) : undefined
		const res = await fetch(`/api/games/${props.gameId}/payments/${userId}/${endpoint}`, {
			method: 'POST',
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body,
		})
		if (res.ok) {
			toast.success(`Payment ${action}ed`)
			props.onChange?.()
		} else {
			toast.error(`Failed to ${action}`)
		}
	}

	return (
		<section className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
			<div className="flex justify-between items-start">
				<div>
					<h2 className="font-display text-lg font-semibold">Payments</h2>
					<div className="text-[11px] text-muted-foreground">
						{claimed.length} of {all.length} awaiting confirmation · {all.filter(p => p.status === 'pending').length} unpaid
					</div>
				</div>
				<div className="text-right">
					<div className="text-[10px] uppercase text-muted-foreground">Received total</div>
					<div className="font-display text-lg font-bold">£{props.totals.confirmed}</div>
					{props.totals.pending !== '0.00' && (
						<div className="text-[10px] text-amber-800">+£{props.totals.pending} awaiting confirmation</div>
					)}
				</div>
			</div>

			{claimed.length > 0 && (
				<div>
					<div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">Needs your attention ({claimed.length})</div>
					{claimed.map(p => (
						<Row key={p.userId} p={p} actions={
							<>
								<button type="button" onClick={() => callAction(p.userId, 'confirm')} className="text-xs font-semibold px-3 py-1.5 rounded bg-foreground text-background">✓ Confirm</button>
								<button type="button" onClick={() => callAction(p.userId, 'reject')} className="text-xs font-semibold px-3 py-1.5 rounded border border-red-300 text-red-700">Reject</button>
							</>
						} highlight />
					))}
				</div>
			)}

			<div>
				<div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">All payments</div>
				{all.map(p => (
					<Row key={p.userId} p={p} actions={
						p.status === 'paid' ? (
							<button type="button" onClick={() => callAction(p.userId, 'revert')} className="text-xs font-semibold px-3 py-1.5 rounded border border-border">Revert</button>
						) : p.status === 'pending' ? (
							<PaymentReminderButton gameName={props.gameName} amount={p.amount} creatorName="you" inviteCode={props.inviteCode} />
						) : null
					} />
				))}
			</div>
		</section>
	)
}

function Row({ p, actions, highlight }: { p: AdminPayment; actions: React.ReactNode; highlight?: boolean }) {
	return (
		<div className={cn(
			'grid grid-cols-[28px_1fr_120px_60px_auto] gap-2 items-center px-3 py-2 rounded-lg border mb-1',
			highlight ? 'bg-amber-50 border-amber-300' : 'bg-card border-border',
		)}>
			<Avatar name={p.userName} />
			<div>
				<div className="text-sm font-semibold">{p.userName}{p.isRebuy ? ' (rebuy)' : ''}</div>
				<div className="text-[10px] text-muted-foreground">{rowSubtitle(p)}</div>
			</div>
			<StatusChip status={p.status} />
			<div className="text-sm font-semibold">£{p.amount}</div>
			<div className="flex gap-1 justify-end">{actions}</div>
		</div>
	)
}
```

`Avatar` and `rowSubtitle` as local helpers.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/game/payments-panel.tsx
git commit -m "feat(game): add payments admin panel"
```

---

### Task 35: Game header pot display split

**Files:**
- Modify: `src/components/game/game-header.tsx`

Replace the single pot figure with confirmed total + annotation showing pending/unpaid/target.

- [ ] **Step 1: Extend props**

```typescript
interface GameHeaderProps {
	// existing fields…
	potBreakdown: { confirmed: string; pending: string; total: string }
	target: string  // entryFee × playerCount, displayed as "£100 target"
	unpaid: string  // sum of pending payments (not claimed)
}
```

- [ ] **Step 2: Update the pot-display block**

```tsx
<div className="text-right">
	<div className="text-[10px] uppercase text-muted-foreground">Pot (confirmed)</div>
	<div className="font-display text-2xl font-bold">£{potBreakdown.confirmed}</div>
	<div className="text-[10px] text-muted-foreground">
		£{potBreakdown.pending} awaiting confirmation · £{unpaid} unpaid · £{target} target
	</div>
</div>
```

- [ ] **Step 3: Update callers to pass the new props**

`game-detail-view.tsx`, `game-card.tsx` if it shares the header.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/components/game/
git commit -m "feat(game): split pot display into confirmed + breakdown"
```

---

### Task 36: Wire payment UI into game-detail-view

**Files:**
- Modify: `src/components/game/game-detail-view.tsx`
- Modify: `src/lib/game/detail-queries.ts` (if not already)
- Modify: `src/app/(app)/game/[id]/page.tsx`

- [ ] **Step 1: Extend detail query**

`getGameDetail` returns admin-payment payload when viewer is creator:

```typescript
// Existing returns already include `players`, `pot`, etc.
// Add:
const payments = await db.query.payment.findMany({ where: eq(payment.gameId, gameId) })
const potBreakdown = calculatePot(payments)

return {
	// existing fields…
	potBreakdown,
	myPayment: payments.find(p => p.userId === userId),
	adminPayments: isAdmin ? buildAdminPayments(payments, gameData.players) : undefined,
}
```

- [ ] **Step 2: Render in game-detail-view**

Below the `GameHeader` and above the pick section:

```tsx
{myPayment && (
	<MyPaymentStrip
		gameId={game.id}
		status={myPayment.status}
		amount={myPayment.amount}
		creatorName={creatorName}
		onClaimed={refresh}
	/>
)}
<OtherPlayersPayments payments={otherPayments} />
```

For admin, below the standings/grid:

```tsx
{isAdmin && adminPayments && (
	<PaymentsPanel
		gameId={game.id}
		gameName={game.name}
		inviteCode={game.inviteCode}
		totals={potBreakdown}
		payments={adminPayments}
		onChange={refresh}
	/>
)}
```

`refresh` is a router-refresh trigger — `router.refresh()` via `useRouter`.

- [ ] **Step 3: Typecheck + verify + commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`

```bash
git add src/components/game/ src/lib/game/ src/app/\(app\)/game/
git commit -m "feat(game): wire payment UI into game detail"
```

---

## Part D — Verification

### Task 37: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Lint**

Run: `pnpm exec biome check --write .`
Expected: clean (any fixes applied automatically).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: All tests**

Run: `pnpm exec vitest run`
Expected: all tests pass, including the new suites:
- `src/lib/game-logic/cup-tier.test.ts`
- `src/lib/game/cup-standings-queries.test.ts`
- `src/lib/game/planned-picks.test.ts`
- `src/app/api/games/[id]/planned-picks/route.test.ts`
- `src/app/api/games/[id]/payments/*/route.test.ts`
- `src/components/game/payment-reminder.test.ts`
- `src/lib/game-logic/prizes.test.ts` (updated)

- [ ] **Step 4: Dev smoke test**

Run: `just db-reset && just dev`

Visit:
- `/` — dashboard shows classic, turbo, cup games with correct pot breakdowns
- A classic game → chain ribbon at top, plan a future pick, toggle auto-submit, verify plan appears in the ribbon
- A cup game → cup pick interface renders, submit picks, view standings (Ladder/Grid/Timeline)
- Payment flow: mark as paid, verify the admin sees it, confirm, verify pot updates

Any broken flows go back into the relevant task. Fix inline.

- [ ] **Step 5: Final commit**

If `biome` or any smoke-fix made changes:
```bash
git add -A
git commit -m "chore: format and smoke-fix for Phase 4b"
```

---

## Out-of-scope reminders (Phase 4c)

- Satori share templates for cup/live/winner variants
- Match-day live UI consuming `/api/games/[id]/live`
- Paid rebuys
- Admin add-player / make-pick-for-player / split-pot
- Mobile breakpoint polish across all Phase 4a/4b surfaces
- Event table + notification feed

## Risk mitigation

- **Cup mode's first real integration.** Dev seed uses PL fixtures (all tier diff = 0), so tier-mechanic visual verification is impossible locally. Plan a post-bootstrap staging test against real WC draw data during Phase 4.5.
- **Planner auto-submit is QStash-dependent.** Tasks 21–23 land the code dormant. First real auto-submit happens after Phase 4.5 wires QStash to a live webhook.
- **Pot-calc signature change is breaking.** Task 26 catches all callers via `tsc --noEmit`. Do not merge until typecheck is green.
- **Planned-pick cascade can invalidate on real-pick loss.** Current pick losing invalidates any plan that depended on the now-used team going unused. Phase 4b does not implement a cleanup cascade — flag in the spec, add a follow-up task post-4b (or roll into 4c's "invalid plan" toast design).
