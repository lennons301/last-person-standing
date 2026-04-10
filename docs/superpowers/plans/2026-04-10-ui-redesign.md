# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder UI with a designed, functional frontend using the "Broadcast" visual system (Slate & Teal light / Midnight Amber dark).

**Architecture:** Retheme via CSS custom properties in globals.css, swap fonts via next/font/google, then redesign each screen top-down starting from the layout shell. All backend code (lib/, api/, schema) is untouched. shadcn/ui primitives are kept and rethemed; feature components are rewritten.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui (@base-ui/react), next-themes, next/font/google (Bebas Neue, Syne, JetBrains Mono), Lucide React icons.

**Design Spec:** `docs/superpowers/specs/2026-04-10-ui-redesign-design.md`

---

## File Structure

```
src/
  app/
    globals.css                       # MODIFY — new colour tokens, font vars, custom utilities
    layout.tsx                        # MODIFY — swap fonts to Bebas Neue, Syne, JetBrains Mono
    (auth)/
      layout.tsx                      # MODIFY — branded auth layout
      login/page.tsx                  # MODIFY — redesigned login
      signup/page.tsx                 # MODIFY — redesigned signup
    (app)/
      layout.tsx                      # MODIFY — new nav shell (desktop top nav + mobile bottom tabs)
      page.tsx                        # REWRITE — dashboard with game cards, live scores, goal alerts
      games/
        page.tsx                      # MODIFY — rethemed games list
        new/page.tsx                  # MODIFY — rethemed create game with visual mode cards
        [id]/
          page.tsx                    # MODIFY — rethemed game detail
          progress/page.tsx           # MODIFY — rethemed progress grid
          admin/page.tsx              # MODIFY — rethemed admin
    (app)/pick/[gameId]/[mode]/
      page.tsx                        # MODIFY — rethemed pick page
  components/
    providers.tsx                     # MODIFY — default theme to system
    features/
      navigation/
        navbar.tsx                    # REWRITE — desktop top nav with branding
        user-menu.tsx                 # MODIFY — retheme avatar/dropdown
        bottom-tabs.tsx               # CREATE — mobile bottom tab bar
      dashboard/
        game-card.tsx                 # CREATE — broadcast-styled game card
        live-scores.tsx               # CREATE — fixture scores component
        goal-notification.tsx         # CREATE — goal event card
        ticker.tsx                    # CREATE — gameweek ticker bar
      games/
        game-list.tsx                 # MODIFY — use new game-card
        game-card.tsx                 # DELETE (replaced by dashboard/game-card.tsx)
        create-game-form.tsx          # MODIFY — visual mode cards instead of dropdown
        join-game-button.tsx          # MODIFY — retheme
      picks/
        pick-selector.tsx             # MODIFY — retheme, add sticky confirm footer
        fixture-row.tsx               # MODIFY — broadcast styling
        team-badge.tsx                # MODIFY — retheme
      leaderboard/
        leaderboard.tsx               # MODIFY — retheme with semantic colours
      progress/
        elimination-grid.tsx          # MODIFY — retheme
      admin/
        player-management.tsx         # MODIFY — retheme
```

---

## Task 1: Fonts & Theme Foundation

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/providers.tsx`

This task establishes the visual foundation — fonts, colours, and theme switching. Every subsequent task builds on this.

- [ ] **Step 1: Replace fonts in root layout**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import { Bebas_Neue, Syne, JetBrains_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
})

const syne = Syne({
  variable: "--font-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Last Person Standing",
  description: "Premier League survivor picks game",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${syne.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Replace globals.css with new colour system**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-display: var(--font-display);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-alive: var(--alive);
  --color-eliminated: var(--eliminated);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
}

/* Light: Slate & Teal */
:root {
  --background: #f5f7fa;
  --foreground: #1e2a3a;
  --card: #ffffff;
  --card-foreground: #1e2a3a;
  --popover: #ffffff;
  --popover-foreground: #1e2a3a;
  --primary: #0d9488;
  --primary-foreground: #ffffff;
  --secondary: #f0f2f6;
  --secondary-foreground: #5a6878;
  --muted: #f0f2f6;
  --muted-foreground: #8896a7;
  --accent: #f0f2f6;
  --accent-foreground: #1e2a3a;
  --destructive: #dc2626;
  --border: #e2e6ec;
  --input: #e2e6ec;
  --ring: #0d9488;
  --alive: #0d9488;
  --eliminated: #dc2626;
  --radius: 0.5rem;
}

/* Dark: Midnight Amber */
.dark {
  --background: #14161f;
  --foreground: #f0edea;
  --card: #1a1d28;
  --card-foreground: #f0edea;
  --popover: #1a1d28;
  --popover-foreground: #f0edea;
  --primary: #f0a030;
  --primary-foreground: #14161f;
  --secondary: #262a38;
  --secondary-foreground: #8890a8;
  --muted: #262a38;
  --muted-foreground: #555a70;
  --accent: #262a38;
  --accent-foreground: #f0edea;
  --destructive: #e05555;
  --border: #262a38;
  --input: #262a38;
  --ring: #f0a030;
  --alive: #4ade80;
  --eliminated: #e05555;
  --radius: 0.5rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 3: Change default theme to system preference**

Replace `src/components/providers.tsx` with:

```tsx
"use client"

import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
```

- [ ] **Step 4: Verify build and visual check**

Run: `doppler run -- npm run build 2>&1 | tail -20`
Expected: Build succeeds. No font loading errors.

Start dev server and check both themes render — colours should be Slate & Teal (light) and Midnight Amber (dark).

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/providers.tsx
git commit -m "feat: replace fonts and colour system with Broadcast theme"
```

---

## Task 2: Desktop Navigation

**Files:**
- Rewrite: `src/components/features/navigation/navbar.tsx`
- Modify: `src/components/features/navigation/user-menu.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Rewrite navbar with broadcast branding**

Replace `src/components/features/navigation/navbar.tsx` with:

```tsx
import Link from "next/link"
import { UserMenu } from "./user-menu"

export function Navbar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-display text-xl tracking-widest">
          LAST PERSON{" "}
          <span className="text-primary">STANDING</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/games"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Games
          </Link>
        </nav>
        <UserMenu displayName={displayName} />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Retheme user menu**

Replace `src/components/features/navigation/user-menu.tsx` with:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function UserMenu({ displayName }: { displayName: string }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut()
            router.push("/login")
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Update app layout**

Replace `src/app/(app)/layout.tsx` with:

```tsx
import { requireSession } from "@/lib/auth-helpers"
import { Navbar } from "@/components/features/navigation/navbar"
import { BottomTabs } from "@/components/features/navigation/bottom-tabs"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  return (
    <>
      <Navbar displayName={session.user.name ?? session.user.email} />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-20 md:pb-6">
        {children}
      </main>
      <BottomTabs />
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/features/navigation/navbar.tsx src/components/features/navigation/user-menu.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: redesign desktop nav with broadcast branding and theme toggle"
```

---

## Task 3: Mobile Bottom Tabs

**Files:**
- Create: `src/components/features/navigation/bottom-tabs.tsx`

- [ ] **Step 1: Create bottom tabs component**

Create `src/components/features/navigation/bottom-tabs.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Trophy, User } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/games", label: "Games", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
] as const

export function BottomTabs() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur md:hidden supports-backdrop-filter:bg-card/60">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-mono text-[10px] uppercase tracking-wider">
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Verify mobile and desktop rendering**

Run dev server. On mobile widths (<768px), bottom tabs should show and top nav links should be hidden. On desktop (>=768px), top nav links show and bottom tabs are hidden.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/navigation/bottom-tabs.tsx
git commit -m "feat: add mobile bottom tab navigation"
```

---

## Task 4: Dashboard Components

**Files:**
- Create: `src/components/features/dashboard/ticker.tsx`
- Create: `src/components/features/dashboard/goal-notification.tsx`
- Create: `src/components/features/dashboard/game-card.tsx`
- Create: `src/components/features/dashboard/live-scores.tsx`

Build the dashboard building blocks before wiring them into the page.

- [ ] **Step 1: Create ticker component**

Create `src/components/features/dashboard/ticker.tsx`:

```tsx
interface TickerProps {
  gameweek: number
  liveMatchCount: number
}

export function Ticker({ gameweek, liveMatchCount }: TickerProps) {
  return (
    <div className="flex items-center justify-between bg-primary px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
      <span>
        GW{gameweek} — {liveMatchCount > 0 ? `${liveMatchCount} match${liveMatchCount !== 1 ? "es" : ""} live` : "No live matches"}
      </span>
      {liveMatchCount > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />
          LIVE
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create goal notification component**

Create `src/components/features/dashboard/goal-notification.tsx`:

```tsx
interface GoalNotificationProps {
  scorer: string
  minute: number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  affectedPlayer: string
  outcome: "SAFE" | "ELIMINATED" | "LEADING" | "BEHIND"
}

export function GoalNotification({
  scorer,
  minute,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  affectedPlayer,
  outcome,
}: GoalNotificationProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
      <span className="text-base">⚽</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">
          {scorer} {minute}&apos; — {homeTeam} {homeScore}-{awayScore} {awayTeam}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {affectedPlayer} picked {homeTeam}
        </p>
      </div>
      <span className="font-mono text-[10px] font-semibold text-primary">
        {outcome}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard game card**

Create `src/components/features/dashboard/game-card.tsx`:

```tsx
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { GameMode, GameStatus } from "@/lib/types"

interface DashboardGameCardProps {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  aliveCount: number
  eliminatedCount: number
  gameweek: number | null
  hasPicked: boolean
  deadline: string | null
}

export function DashboardGameCard({
  id,
  name,
  mode,
  status,
  aliveCount,
  eliminatedCount,
  gameweek,
  hasPicked,
  deadline,
}: DashboardGameCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between p-3 pb-2">
        <h3 className="text-[15px] font-bold">{name}</h3>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-primary">
          {mode}
        </span>
      </div>
      <div className="flex gap-4 px-3 pb-2 font-mono text-[11px]">
        <span>
          <span className="text-muted-foreground">alive </span>
          <span className="text-alive">{aliveCount}</span>
        </span>
        <span>
          <span className="text-muted-foreground">out </span>
          <span className="text-eliminated">{eliminatedCount}</span>
        </span>
        {gameweek && (
          <span>
            <span className="text-muted-foreground">gw </span>
            <span>{gameweek}</span>
          </span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {hasPicked ? "picked ✓" : deadline ?? ""}
        </span>
        <div className="flex gap-1.5">
          <Link
            href={`/games/${id}/progress`}
            className="rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Progress
          </Link>
          {status !== "finished" && (
            <Link
              href={hasPicked ? `/pick/${id}/${mode}` : `/pick/${id}/${mode}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors",
                hasPicked
                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {hasPicked ? "EDIT" : "PICK"}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create live scores component**

Create `src/components/features/dashboard/live-scores.tsx`:

```tsx
interface Fixture {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  kickoff: string | null
  minute: number | null
  status: "scheduled" | "live" | "finished"
  isUserPick: boolean
  userPickedHome: boolean
}

interface LiveScoresProps {
  gameweek: number
  fixtures: Fixture[]
}

export function LiveScores({ gameweek, fixtures }: LiveScoresProps) {
  if (fixtures.length === 0) return null

  const hasLive = fixtures.some((f) => f.status === "live")

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[13px] font-bold">Live Scores</span>
        {hasLive && (
          <span className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 font-mono text-[9px] font-semibold text-primary-foreground">
            <span className="h-1 w-1 animate-pulse rounded-full bg-primary-foreground" />
            GW{gameweek}
          </span>
        )}
      </div>
      {fixtures.map((fixture) => (
        <div
          key={fixture.id}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border px-3 py-2"
        >
          <div>
            <div className="font-mono text-[11px] font-medium">
              {fixture.homeTeam}
            </div>
            {fixture.isUserPick && fixture.userPickedHome && (
              <div className="font-mono text-[8px] font-semibold text-primary">
                YOUR PICK
              </div>
            )}
          </div>
          <div className="text-center">
            {fixture.status === "scheduled" ? (
              <div className="font-mono text-[10px] text-muted-foreground">
                {fixture.kickoff ?? "TBD"}
              </div>
            ) : (
              <>
                <div
                  className={`rounded px-2 py-0.5 font-display text-base tracking-widest ${
                    fixture.status === "live"
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {fixture.homeScore} - {fixture.awayScore}
                </div>
                <div className="font-mono text-[9px] text-muted-foreground">
                  {fixture.status === "live" ? `${fixture.minute}'` : "FT"}
                </div>
              </>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] font-medium">
              {fixture.awayTeam}
            </div>
            {fixture.isUserPick && !fixture.userPickedHome && (
              <div className="font-mono text-[8px] font-semibold text-primary">
                YOUR PICK
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/features/dashboard/
git commit -m "feat: add dashboard components (ticker, goal notification, game card, live scores)"
```

---

## Task 5: Dashboard Page

**Files:**
- Rewrite: `src/app/(app)/page.tsx`
- Delete: `src/components/features/games/game-card.tsx`
- Modify: `src/components/features/games/game-list.tsx`

- [ ] **Step 1: Rewrite the dashboard page**

Replace `src/app/(app)/page.tsx` with:

```tsx
import Link from "next/link"
import { eq, sql } from "drizzle-orm"
import { requireSession } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { games, gamePlayers, gameweeks, picks } from "@/lib/schema/domain"
import { Ticker } from "@/components/features/dashboard/ticker"
import { DashboardGameCard } from "@/components/features/dashboard/game-card"
import type { GameMode, GameStatus, PlayerStatus } from "@/lib/types"

export default async function DashboardPage() {
  const session = await requireSession()

  const activeGameweek = await db
    .select()
    .from(gameweeks)
    .where(eq(gameweeks.isCurrent, true))
    .then((rows) => rows[0] ?? null)

  const myGames = await db
    .select({
      gameId: gamePlayers.gameId,
      gameName: games.name,
      gameMode: games.mode,
      gameStatus: games.status,
      playerStatus: gamePlayers.status,
      aliveCount: sql<number>`(
        select count(*)::int from ${gamePlayers} gp
        where gp.game_id = ${games.id} and gp.status = 'alive'
      )`,
      eliminatedCount: sql<number>`(
        select count(*)::int from ${gamePlayers} gp
        where gp.game_id = ${games.id} and gp.status = 'eliminated'
      )`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(eq(gamePlayers.playerId, session.user.id))

  // Check which games the user has picked for this gameweek
  let pickedGameIds = new Set<string>()
  if (activeGameweek) {
    const userPicks = await db
      .select({ gameId: picks.gameId })
      .from(picks)
      .where(eq(picks.playerId, session.user.id))

    pickedGameIds = new Set(userPicks.map((p) => p.gameId))
  }

  return (
    <div className="-mx-4 -mt-6 md:mx-0 md:mt-0">
      <Ticker
        gameweek={activeGameweek?.fplGameweek ?? 0}
        liveMatchCount={0}
      />

      <div className="space-y-4 px-4 pt-4 md:px-0">
        {myGames.length > 0 ? (
          <>
            <h2 className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Your games
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {myGames.map((game) => (
                <DashboardGameCard
                  key={game.gameId}
                  id={game.gameId}
                  name={game.gameName}
                  mode={game.gameMode as GameMode}
                  status={game.gameStatus as GameStatus}
                  aliveCount={game.aliveCount}
                  eliminatedCount={game.eliminatedCount}
                  gameweek={activeGameweek?.fplGameweek ?? null}
                  hasPicked={pickedGameIds.has(game.gameId)}
                  deadline={null}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="py-20 text-center">
            <h2 className="font-display text-3xl tracking-wider">
              NO GAMES YET<span className="text-primary">.</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Survivor picks with your mates
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/games/new"
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Create a game
              </Link>
              <Link
                href="/games"
                className="rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                Browse games
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update game-list to use Link cards (for the /games page)**

Replace `src/components/features/games/game-list.tsx` with:

```tsx
import Link from "next/link"
import type { GameMode, GameStatus } from "@/lib/types"

interface GameWithCount {
  id: string
  name: string
  mode: GameMode
  status: GameStatus
  playerCount: number
}

export function GameList({ games }: { games: GameWithCount[] }) {
  if (games.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No games found.
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {games.map((game) => (
        <Link
          key={game.id}
          href={`/games/${game.id}`}
          className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-start justify-between">
            <h3 className="text-[15px] font-bold">{game.name}</h3>
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-primary">
              {game.mode}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            <span>{game.playerCount} player{game.playerCount !== 1 ? "s" : ""}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase">
              {game.status}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Delete old game-card component**

```bash
rm src/components/features/games/game-card.tsx
```

- [ ] **Step 4: Verify build**

Run: `doppler run -- npm run build 2>&1 | tail -20`
Expected: Build succeeds. No import errors from deleted game-card.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/page.tsx src/components/features/games/game-list.tsx src/components/features/dashboard/
git rm src/components/features/games/game-card.tsx
git commit -m "feat: redesign dashboard with game cards, ticker, and empty state"
```

---

## Task 6: Auth Pages

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Redesign auth layout**

Replace `src/app/(auth)/layout.tsx` with:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl tracking-widest">
          LAST PERSON <span className="text-primary">STANDING</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Survivor picks with your mates
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Redesign login page**

Read the current `src/app/(auth)/login/page.tsx` for the form logic, then replace the JSX to use the new styling while keeping the same `signIn.email` call, error handling, and router logic. Key changes:

- Remove the Card wrapper — use a simple div with border and rounded-lg
- Use font-display for the "Log in" heading
- Style inputs with the new border/input tokens
- Primary-coloured submit button
- Monospace styling on error text

- [ ] **Step 3: Redesign signup page**

Same treatment as login — keep the `signUp.email` form logic, restyle the wrapper and inputs.

- [ ] **Step 4: Verify both pages render**

Navigate to `/login` and `/signup` in the dev server. Check both themes.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: redesign auth pages with broadcast branding"
```

---

## Task 7: Games List & Create Game Pages

**Files:**
- Modify: `src/app/(app)/games/page.tsx`
- Modify: `src/app/(app)/games/new/page.tsx`
- Modify: `src/components/features/games/create-game-form.tsx`

- [ ] **Step 1: Retheme games list page**

Replace the heading and button styling in `src/app/(app)/games/page.tsx`:
- Page title: `font-display text-3xl tracking-wider` instead of `text-3xl font-bold tracking-tight`
- "New game" link: use primary button styling directly on Link
- Section labels: `font-mono text-[9px] uppercase tracking-widest text-muted-foreground`

- [ ] **Step 2: Redesign create game form with visual mode cards**

Replace the mode `<Select>` dropdown in `src/components/features/games/create-game-form.tsx` with a 2x2 grid of clickable cards. Each card shows mode name (font-bold) and a 1-line description. Selected card gets `border-primary ring-2 ring-primary/20`. Unselected cards get `border-border hover:border-primary/30`.

Mode descriptions:
- classic: "Pick a team each week. If they lose, you're out."
- turbo: "Predict every result. Points for each correct pick."
- escalating: "Classic rules with rising stakes each round."
- cup: "Follow a knockout tournament. Tier handicaps and lives."

- [ ] **Step 3: Retheme the create game page wrapper**

Update `src/app/(app)/games/new/page.tsx` heading to use `font-display text-3xl tracking-wider`.

- [ ] **Step 4: Verify create game flow**

Navigate to `/games/new`, select a mode, fill in name, submit. Verify the mode card selection works and the form submits correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/games/ src/components/features/games/create-game-form.tsx
git commit -m "feat: retheme games list and create game with visual mode cards"
```

---

## Task 8: Game Detail & Leaderboard

**Files:**
- Modify: `src/app/(app)/games/[id]/page.tsx`
- Modify: `src/components/features/leaderboard/leaderboard.tsx`
- Modify: `src/components/features/games/join-game-button.tsx`

- [ ] **Step 1: Retheme game detail page**

Update `src/app/(app)/games/[id]/page.tsx`:
- Game name: `font-display text-4xl tracking-wider` (was text-3xl font-bold)
- Mode/status badges: `font-mono text-[9px] font-semibold uppercase tracking-wider` with `bg-primary/10 text-primary` and `bg-secondary text-secondary-foreground`
- Action buttons: primary for "Make pick", secondary/outline for "Progress" and "Admin"
- Add a "your status" section if the user is a player — show alive/eliminated with semantic colours

- [ ] **Step 2: Retheme leaderboard**

Update `src/components/features/leaderboard/leaderboard.tsx`:
- Replace hardcoded `text-green-500` / `text-red-500` / `text-amber-500` with `text-alive` / `text-eliminated` / `text-primary`
- Use `font-mono text-[11px]` for data cells
- Highlight current user's row with `bg-primary/5`
- Strikethrough styling for eliminated players: `text-muted-foreground line-through`

- [ ] **Step 3: Retheme join game button**

Update `src/components/features/games/join-game-button.tsx` — use primary button styling.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/games/\[id\]/page.tsx src/components/features/leaderboard/ src/components/features/games/join-game-button.tsx
git commit -m "feat: retheme game detail, leaderboard, and join button"
```

---

## Task 9: Pick Page

**Files:**
- Modify: `src/app/(app)/pick/[gameId]/[mode]/page.tsx`
- Modify: `src/components/features/picks/pick-selector.tsx`
- Modify: `src/components/features/picks/fixture-row.tsx`
- Modify: `src/components/features/picks/team-badge.tsx`

- [ ] **Step 1: Retheme pick page**

Update `src/app/(app)/pick/[gameId]/[mode]/page.tsx`:
- Heading: `font-display text-3xl tracking-wider` with game name
- Add gameweek number and deadline info below heading (font-mono text-sm text-muted-foreground)
- Mode badge next to heading

- [ ] **Step 2: Retheme fixture row**

Update `src/components/features/picks/fixture-row.tsx`:
- Team names: `font-mono text-[11px] font-medium`
- Selected state: `bg-primary text-primary-foreground` (already uses primary, verify it maps to new tokens)
- Score/time centre: `font-display text-lg tracking-wider` for scores, `font-mono text-[10px]` for times
- Disabled teams: `opacity-40 cursor-not-allowed`

- [ ] **Step 3: Add sticky confirm footer to pick selector**

Update `src/components/features/picks/pick-selector.tsx`:
- Wrap the submit button in a sticky footer: `sticky bottom-0 border-t border-border bg-card p-3`
- Show selected team name in the footer: "You picked [Team]"
- Button: primary styled, full width within footer

- [ ] **Step 4: Verify pick flow**

Navigate to a game's pick page. Select a team, verify the sticky footer appears, submit the pick.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/pick/ src/components/features/picks/
git commit -m "feat: retheme pick page with sticky confirm footer"
```

---

## Task 10: Progress Grid & Admin

**Files:**
- Modify: `src/app/(app)/games/[id]/progress/page.tsx`
- Modify: `src/components/features/progress/elimination-grid.tsx`
- Modify: `src/app/(app)/games/[id]/admin/page.tsx`
- Modify: `src/components/features/admin/player-management.tsx`

- [ ] **Step 1: Retheme progress page and grid**

Update `src/app/(app)/games/[id]/progress/page.tsx`:
- Heading: `font-display text-3xl tracking-wider`

Update `src/components/features/progress/elimination-grid.tsx`:
- Replace `text-green-500` with `text-alive`, `text-red-500` with `text-eliminated`
- Header cells: `font-mono text-[10px] uppercase tracking-wider`
- Player name cells: `font-mono text-[11px] font-medium`
- Highlight current user row: `bg-primary/5`
- Table styling: `border-border` tokens

- [ ] **Step 2: Retheme admin page**

Update `src/app/(app)/games/[id]/admin/page.tsx`:
- Heading: `font-display text-3xl tracking-wider`

Update `src/components/features/admin/player-management.tsx`:
- Status colours: `text-alive` / `text-eliminated`
- Button styling: use themed destructive and outline variants
- Table cells: `font-mono text-[11px]`

- [ ] **Step 3: Verify both pages**

Navigate to a game's progress and admin pages. Verify colours render correctly in both themes.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/games/\[id\]/progress/ src/app/\(app\)/games/\[id\]/admin/ src/components/features/progress/ src/components/features/admin/
git commit -m "feat: retheme progress grid and admin page"
```

---

## Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run linter and type checker**

```bash
doppler run -- npm run lint 2>&1
doppler run -- npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 2: Run tests**

```bash
doppler run -- npm run test 2>&1
```

Expected: All existing tests pass (game logic tests should be unaffected by UI changes).

- [ ] **Step 3: Run production build**

```bash
doppler run -- npm run build 2>&1
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Visual smoke test**

Start dev server and verify each screen in both light and dark mode:
1. `/login` — branded header, form renders
2. `/signup` — branded header, form renders
3. `/` (dashboard) — ticker, game cards with stats, empty state if no games
4. `/games` — game list with new card styling
5. `/games/new` — visual mode cards, form submits
6. `/games/[id]` — game detail with themed leaderboard
7. `/games/[id]/progress` — elimination grid with semantic colours
8. `/games/[id]/admin` — player management table
9. `/pick/[id]/[mode]` — fixture selection, sticky footer
10. Mobile widths — bottom tabs visible, top nav links hidden

- [ ] **Step 5: Commit any fixes**

If any visual issues were found and fixed:

```bash
git add -A
git commit -m "fix: address visual issues from smoke test"
```
